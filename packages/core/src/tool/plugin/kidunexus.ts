export * as KiduNexusTool from "./kidunexus.js"

import { define } from "@opencode/plugin/effect/plugin"
import { ToolFailure } from "@opencode/ai"
import { ConfigKiduNexus } from "@opencode/schema/config/kidunexus"
import { KiduNexus } from "@opencode/schema/kidunexus"
import { TokenUsage } from "@opencode/schema/token-usage"
import { Clock, Effect, Option, Schema, Semaphore, Stream } from "effect"
import { Agent } from "../../agent.js"
import { Config } from "../../config.js"
import { KV } from "../../kv.js"
import { Model } from "../../model.js"
import { Permission } from "../../permission.js"
import { Session } from "../../session.js"
import { Tool } from "../../tool.js"
import { SubagentCompletion } from "../../session/subagent-completion.js"
import { NexusBudget } from "../../kidunexus/budget.js"
import { NexusConfig } from "../../kidunexus/config.js"
import { NexusGraph } from "../../kidunexus/graph.js"
import { NexusPolicy } from "../../kidunexus/policy.js"
import { NexusPrompt } from "../../kidunexus/prompt.js"
import { NexusRuntime } from "../../kidunexus/runtime.js"
import { NexusSchema } from "../../kidunexus/schema.js"
import { ShellTool } from "./shell.js"
import { Form } from "../../form.js"

export const Input = Schema.Struct({
  task: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(12000)),
  mode: Schema.optionalKey(ConfigKiduNexus.Mode),
  nodes: Schema.optionalKey(KiduNexus.CustomNodes),
  judge: Schema.optionalKey(Schema.Literals(["human", "model"])),
})
const Marker = Schema.Struct({ parentID: Session.ID, role: ConfigKiduNexus.Role, originAgent: Agent.ID })
const decodeMarker = Schema.decodeUnknownOption(Marker)
const decodeFindings = Schema.decodeUnknownOption(Schema.fromJsonString(NexusSchema.Findings))
const decodeReport = Schema.decodeUnknownOption(NexusSchema.Report)
const primary = Agent.ID.make("nexus")

export const Plugin = define({
  id: "kiducode.kidunexus",
  effect: Effect.fn("KiduNexus.Plugin")(function* (ctx) {
    const sessions = yield* Session.Service
    const config = yield* Config.Service
    const models = yield* Model.Service
    const permission = yield* Permission.Service
    const agents = yield* Agent.Service
    const kv = yield* KV.Service
    const forms = yield* Form.Service
    const lock = yield* Semaphore.make(1)
    const running = new Set<Session.ID>()
    const workers = new Map<
      Session.ID,
      {
        budget: ReturnType<typeof NexusBudget.create>
        config: NexusConfig.Resolved
        model: Model.Info
        steps: number
        failure?: NexusSchema.Failure
      }
    >()
    const settings = Effect.gen(function* () {
      return NexusConfig.resolve(
        (yield* config.entries()).flatMap((entry) =>
          entry.type === "document" && entry.info.kidunexus ? [entry.info.kidunexus] : [],
        ),
      )
    })

    yield* ctx.agent.transform((editor) => {
      editor.update(primary, (agent) => {
        agent.name = Agent.Name.make("Nexus")
        agent.description =
          "KiduNexus: bounded collaborative reasoning, adversarial verification, and authorized execution."
        agent.mode = "primary"
        agent.steps = 4
        agent.system =
          "You are KiduNexus. For a substantive user task call nexus_run with a precise self-contained task and the requested mode. Use adaptive unless requested otherwise. For interactive tasks use nexus_models to discover available models and propose 2-4 nodes with role, model and objective, then call nexus_run with judge human. The human confirms the plan. An awaiting_judge_input result is paused: stop and wait for the user. Use nexus_judge only to relay the user's explicit question, revision, verdict or cancellation with the saved run id; never decide a human verdict yourself. Execution requires mode execute and configured authorization. Present findings and unresolved issues faithfully. Use nexus_report to inspect prior runs. Simple greetings need no workflow. Never report unmeasured savings or hide disagreement."
      })
      Object.entries(NexusPrompt.roles).forEach(([role]) => {
        const parsed = Schema.decodeUnknownSync(ConfigKiduNexus.Role)(role)
        editor.update(Agent.ID.make(`nexus-${role}`), (agent) => {
          agent.name = Agent.Name.make(`Nexus ${role}`)
          agent.mode = "subagent"
          agent.hidden = true
          agent.steps = 4
          agent.system = NexusPrompt.system(parsed)
          agent.permissions.push({ action: "*", resource: "*", effect: "deny" })
          for (const tool of ["read", "glob", "grep", "webfetch", "websearch", "edit", "shell"]) {
            if (NexusPolicy.allows(parsed, tool))
              agent.permissions.push({
                action: tool,
                resource: "*",
                effect: NexusPolicy.mutates(tool) ? "ask" : "allow",
              })
          }
          agent.permissions.push({ action: "read", resource: "*.env*", effect: "deny" })
        })
      })
    })

    // This hook is a runtime execution boundary, including calls from a stale model snapshot.
    yield* ctx.tool.hook("execute.before", (event) =>
      Effect.gen(function* () {
        const session = yield* sessions
          .get(event.sessionID)
          .pipe(Effect.mapError((error) => new Tool.Error({ message: "Session unavailable", error })))
        const marker = decodeMarker(session.metadata?.kidunexus)
        if (Option.isNone(marker)) {
          if (
            String(event.agent).startsWith("nexus-") ||
            (event.agent === primary &&
              !["nexus_run", "nexus_report", "nexus_judge", "nexus_models", "question"].includes(event.tool))
          )
            return yield* new Tool.Error({ message: "Nexus actions must run through an authorized workflow" })
          return
        }
        if (!workers.has(event.sessionID) || !NexusPolicy.allows(marker.value.role, event.tool))
          return yield* new Tool.Error({ message: "Tool is outside the active Nexus worker's authority" })
        if (event.tool === "shell") {
          const input = Schema.decodeUnknownOption(ShellTool.Input)(event.input)
          if (Option.isNone(input)) return yield* new Tool.Error({ message: "Invalid shell arguments" })
          if (input.value.background)
            return yield* new Tool.Error({ message: "Nexus workers cannot detach background commands" })
          event.input = { ...input.value, background: false, timeout: Math.min(input.value.timeout || 60_000, 60_000) }
        }
        const parent = yield* sessions
          .get(marker.value.parentID)
          .pipe(Effect.mapError((error) => new Tool.Error({ message: "Nexus parent unavailable", error })))
        if (
          parent.location.directory !== session.location.directory ||
          parent.location.workspaceID !== session.location.workspaceID
        )
          return yield* new Tool.Error({ message: "Nexus worker Location differs from its parent" })
      }),
    )

    // Leaf permissions supply resolved paths/commands. Intersect with the originating policy
    // here rather than attempting to infer resources from arbitrary tool input shapes.
    yield* ctx.permission.hook("evaluate", (event) =>
      Effect.gen(function* () {
        const child = yield* sessions.get(event.sessionID).pipe(Effect.orDie)
        const marker = decodeMarker(child.metadata?.kidunexus)
        if (Option.isNone(marker)) return
        if (!workers.has(child.id)) {
          event.effect = "deny"
          return
        }
        const parent = yield* sessions.get(marker.value.parentID).pipe(Effect.orDie)
        const agent = yield* agents.resolve(marker.value.originAgent)
        if (!agent) {
          event.effect = "deny"
          return
        }
        const effects = event.resources.map(
          (resource) => Permission.evaluate(event.action, resource, agent.permissions, parent.permissions ?? []).effect,
        )
        if (effects.includes("deny")) {
          event.effect = "deny"
          return
        }
        if (event.effect !== "deny" && (effects.includes("ask") || event.action === "edit" || event.action === "shell"))
          event.effect = "ask"
      }),
    )

    yield* ctx.event.subscribe().pipe(
      Stream.filter((event) => event.type === "session.deleted"),
      Stream.runForEach((event) =>
        Effect.gen(function* () {
          if (event.type !== "session.deleted") return
          const prefix = `kidunexus:${event.data.sessionID}:`
          while (true) {
            const page = yield* kv.scan({ prefix, limit: 100 })
            yield* Effect.forEach(page.entries, (entry) => kv.remove(entry.key), { discard: true })
            if (!page.next) break
          }
        }),
      ),
      Effect.forkScoped,
    )

    yield* ctx.session.hook("context", (event) =>
      Effect.gen(function* () {
        if (event.agent === primary) {
          Object.keys(event.tools).forEach((name) => {
            if (!["nexus_run", "nexus_report", "nexus_judge", "nexus_models", "question"].includes(name))
              delete event.tools[name]
          })
        }
        const state = workers.get(event.sessionID)
        if (!state) {
          if (String(event.agent).startsWith("nexus-"))
            return yield* Effect.die(new Error("Nexus worker is not attached to an active run"))
          return
        }
        if (++state.steps > state.config.steps) {
          state.failure = new NexusSchema.Failure({ kind: "limit", message: "Nexus worker step limit reached" })
          return yield* Effect.die(state.failure)
        }
        const session = yield* sessions.get(event.sessionID).pipe(Effect.orDie)
        const marker = decodeMarker(session.metadata?.kidunexus)
        if (Option.isNone(marker)) return yield* Effect.die(new Error("Missing Nexus worker identity"))
        Object.keys(event.tools).forEach((name) => {
          if (!NexusPolicy.allows(marker.value.role, name)) delete event.tools[name]
        })
        const bytes =
          new TextEncoder().encode(
            JSON.stringify({ system: event.system, messages: event.messages, tools: event.tools }),
          ).length + 1024
        const max = yield* Effect.try({
          try: () => state.budget.reserve(state.model, bytes),
          catch: (error) =>
            error instanceof NexusSchema.Failure
              ? error
              : new NexusSchema.Failure({ kind: "invalid", message: "Invalid budget reservation" }),
        }).pipe(
          Effect.tapError((error) =>
            Effect.sync(() => {
              state.failure = error
            }),
          ),
          Effect.orDie,
        )
        event.options.maxTokens = max
      }),
    )
    // Retries get their own bounded fresh worker and reservation; never hide provider retries from accounting.
    yield* ctx.session.hook("retry", (event) =>
      Effect.sync(() => {
        if (workers.has(event.sessionID)) event.decision = { retry: false }
      }),
    )

    const run = (
      input: typeof Input.Type,
      context: Tool.Context,
      previous?: NexusSchema.Report,
      feedback?: KiduNexus.JudgeInput,
    ) =>
      Effect.gen(function* () {
        const current = yield* settings
        const options = previous?.settings ? NexusConfig.resolve([previous.settings, snapshot(current)]) : current
        if (!options.enabled)
          return yield* new ToolFailure({ message: "Enable KiduNexus with kidunexus.enabled: true in configuration." })
        const mode = input.judge === "human" ? "human_judge" : (input.mode ?? options.mode)
        if (input.judge === "model" && mode === "human_judge")
          return yield* new ToolFailure({ message: "human_judge mode requires a human judge" })
        if (input.nodes && mode === "execute")
          return yield* new ToolFailure({
            message: "Custom interactive workers are reasoning-only; use a separate execute run for implementation",
          })
        const assignments =
          input.nodes ??
          (mode === "human_judge"
            ? [
                { id: "agent1", role: "proponent" as const },
                { id: "agent2", role: "opponent" as const },
              ]
            : undefined)
        if (assignments)
          yield* Effect.try({
            try: () => NexusGraph.custom(assignments),
            catch: () =>
              new ToolFailure({ message: "Invalid custom graph: use 2-4 unique nodes with earlier dependencies" }),
          })
        if (mode === "execute" && !options.execution)
          return yield* new ToolFailure({ message: "KiduNexus execution is disabled; set allow_execution explicitly." })
        const parent = yield* sessions
          .get(context.sessionID)
          .pipe(Effect.mapError((error) => new ToolFailure({ message: "Parent session unavailable", error })))
        const nodes = assignments?.map((node) => ({
          ...node,
          model: ("model" in node ? node.model : undefined) ?? options.models[node.role] ?? parent.model,
        }))
        const originAgent = previous?.originAgent ?? context.agent
        if (parent.metadata?.kidunexus)
          return yield* new ToolFailure({ message: "Nested Nexus workflows are forbidden" })
        yield* permission
          .assert({
            action: "nexus_run",
            resources: [mode],
            save: [mode],
            sessionID: parent.id,
            agent: context.agent,
            source: { type: "tool", messageID: context.messageID, id: context.id },
          })
          .pipe(Effect.mapError((error) => new ToolFailure({ message: "Nexus run not authorized", error })))
        if (running.has(parent.id))
          return yield* new ToolFailure({ message: "A Nexus run is already active for this session" })
        const key = `kidunexus:${parent.id}:${previous?.id ?? context.id}`
        if (!previous && (yield* kv.get(key)) !== undefined)
          return yield* new ToolFailure({ message: "This run already exists; inspect it with nexus_report" })
        if (nodes && !previous) {
          const available = yield* models.available()
          if (
            nodes.some(
              (node) =>
                !node.model ||
                !available.some(
                  (model) =>
                    model.id === node.model?.id &&
                    model.providerID === node.model.providerID &&
                    (!node.model.variant ||
                      node.model.variant === "default" ||
                      model.variants.some((variant) => variant.id === node.model?.variant)),
                ),
            )
          )
            return yield* new ToolFailure({ message: "An assigned model is unavailable; use nexus_models" })
          yield* confirm(
            context,
            "Confirm Nexus plan",
            JSON.stringify({ task: input.task, judge: mode === "human_judge" ? "human" : "model", nodes }),
          )
        }
        if (running.has(parent.id))
          return yield* new ToolFailure({ message: "A Nexus run is already active for this session" })
        running.add(parent.id)
        const budget = NexusBudget.create(options, previous)
        const checkpoint: NexusRuntime.Checkpoint = (report) =>
          lock.withPermit(
            Effect.gen(function* () {
              yield* kv.set(
                key,
                Schema.encodeSync(NexusSchema.Report)({
                  ...report,
                  originAgent,
                  settings: snapshot(options),
                  reservedTokens: budget.reserved.tokens,
                  reservedCost: budget.reserved.cost,
                }),
              )
              yield* context.progress({ nexus: progress(report, budget.reserved.tokens) })
            }),
          )
        const worker: NexusRuntime.Worker = (node, dependencies) =>
          Effect.gen(function* () {
            const available = yield* models.available()
            const selected = node.assignment?.model ?? options.models[node.role] ?? parent.model
            const candidate = node.attempt > 1 ? (options.fallbacks[0] ?? selected) : selected
            if (!candidate)
              return yield* new NexusSchema.Failure({
                kind: "invalid",
                message: "Select a coordinator model or configure role_models",
              })
            const model = available.find((item) => item.id === candidate.id && item.providerID === candidate.providerID)
            if (
              !model ||
              (candidate.variant &&
                candidate.variant !== "default" &&
                !model.variants.some((variant) => variant.id === candidate.variant))
            )
              return yield* new NexusSchema.Failure({
                kind: "worker",
                message: "Configured worker model or variant is unavailable",
              })
            const child = yield* sessions
              .create({
                parentID: parent.id,
                agent: Agent.ID.make(`nexus-${node.role}`),
                model: candidate,
                title: `Nexus ${node.id}`,
                metadata: {
                  kidunexus: {
                    parentID: parent.id,
                    role: node.role,
                    originAgent,
                    runID: previous?.id ?? context.id,
                    nodeID: node.assignment?.id ?? node.id,
                    pane: !!node.assignment,
                  },
                },
                permissions: [
                  { action: "*", resource: "*", effect: "deny" },
                  ...["read", "glob", "grep", "webfetch", "websearch", "edit", "shell"]
                    .filter((tool) => NexusPolicy.allows(node.role, tool))
                    .map((tool) => ({
                      action: tool,
                      resource: "*",
                      effect: NexusPolicy.mutates(tool) ? ("ask" as const) : ("allow" as const),
                    })),
                  ...(parent.permissions ?? []),
                  { action: "read", resource: "*.env*", effect: "deny" },
                  { action: "read", resource: "*.pem", effect: "deny" },
                  { action: "read", resource: "*id_rsa*", effect: "deny" },
                ],
              })
              .pipe(
                Effect.mapError(
                  () => new NexusSchema.Failure({ kind: "worker", message: "Could not create worker session" }),
                ),
              )
            node.sessionID = child.id
            node.model = `${candidate.providerID}/${candidate.id}`
            const state: {
              budget: typeof budget
              config: typeof options
              model: Model.Info
              steps: number
              failure?: NexusSchema.Failure
            } = { budget, config: options, model, steps: 0 }
            workers.set(child.id, state)
            return yield* Effect.gen(function* () {
              yield* sessions.prompt({
                sessionID: child.id,
                text: NexusPrompt.handoff(
                  JSON.stringify({
                    task: input.task,
                    objective: node.assignment?.task,
                    humanFeedback: feedback?.feedback,
                  }),
                  node,
                  dependencies,
                ),
                resume: false,
              })
              yield* sessions.resume(child.id)
              const messages = yield* sessions.messages({ sessionID: child.id, order: "desc", limit: 20 })
              const assistant = messages.find((message) => message.type === "assistant" && !message.error)
              const decoded = decodeFindings(SubagentCompletion.text(assistant))
              if (Option.isNone(decoded))
                return yield* new NexusSchema.Failure({
                  kind: "worker",
                  message: "Worker did not return a valid public findings envelope",
                })
              const redacted = decodeFindings(NexusPrompt.redact(JSON.stringify(decoded.value)))
              if (Option.isNone(redacted))
                return yield* new NexusSchema.Failure({ kind: "invalid", message: "Could not redact worker findings" })
              return redacted.value
            }).pipe(
              Effect.mapError(
                () =>
                  state.failure ??
                  new NexusSchema.Failure({
                    kind: "worker",
                    message: `Worker ${node.id} failed; inspect its child session for details`,
                  }),
              ),
              Effect.ensuring(
                Effect.gen(function* () {
                  yield* sessions.interrupt(child.id).pipe(Effect.ignore)
                  const finished = yield* sessions.get(child.id).pipe(Effect.orDie)
                  node.tokens += TokenUsage.total(finished.tokens)
                  node.cost = model.cost.length ? (node.cost ?? 0) + finished.cost : null
                  workers.delete(child.id)
                }),
              ),
            )
          })
        const report = yield* NexusRuntime.run({
          id: previous?.id ?? context.id,
          parentID: parent.id,
          task: NexusPrompt.redact(input.task),
          mode,
          config: options,
          worker,
          checkpoint,
          nodes: previous ? undefined : nodes,
          previous,
          feedback,
        }).pipe(
          Effect.mapError((error) => new ToolFailure({ message: error.message })),
          Effect.ensuring(Effect.sync(() => running.delete(parent.id))),
        )
        return {
          output: report,
          content: JSON.stringify({ ...report, graph: NexusGraph.evidence(report) }),
          metadata: { nexus: progress(report, budget.reserved.tokens) },
        }
      })
    const confirm = (context: Tool.Context, title: string, description: string) =>
      Effect.gen(function* () {
        const state = yield* forms
          .ask({
            sessionID: context.sessionID,
            title,
            metadata: { kind: "nexus", tool: { messageID: context.messageID, id: context.id } },
            fields: [
              {
                key: "confirm",
                type: "string",
                title,
                description,
                required: true,
                options: [
                  { value: "confirm", label: "Confirm" },
                  { value: "cancel", label: "Cancel" },
                ],
                custom: false,
              },
            ],
          })
          .pipe(Effect.orDie)
        if (state.status !== "answered" || state.answer.confirm !== "confirm")
          return yield* new ToolFailure({ message: "Human did not confirm the Nexus action" })
      })

    yield* ctx.tool
      .transform((editor) => {
        editor.add({
          name: "nexus_run",
          input: Input,
          output: NexusSchema.Report,
          options: { codemode: false },
          description:
            "Run bounded Nexus reasoning or human_judge with 2-4 custom nodes. Custom plans require human confirmation. Human runs pause for nexus_judge; never invent a verdict. execute requires allow_execution. Reservations are estimates, not billing guarantees.",
          execute: (input, context) => run(input, context),
        })
        editor.add({
          name: "nexus_models",
          input: Schema.Struct({}),
          output: Schema.Json,
          options: { codemode: false },
          description:
            "Discover available connected models for a Nexus plan. Returns actual model references, not invented model names.",
          execute: (_, context) =>
            Effect.gen(function* () {
              yield* permission
                .assert({
                  action: "nexus_models",
                  resources: ["*"],
                  save: [],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: { type: "tool", messageID: context.messageID, id: context.id },
                })
                .pipe(Effect.mapError((error) => new ToolFailure({ message: "Model discovery denied", error })))
              const output = (yield* models.available()).map((model) => ({
                providerID: model.providerID,
                id: model.id,
                name: model.name,
              }))
              return { output, content: JSON.stringify(output) }
            }),
        })
        editor.add({
          name: "nexus_judge",
          input: KiduNexus.JudgeInput,
          output: NexusSchema.Report,
          options: { codemode: false },
          description:
            "Relay explicit human feedback for a paused run. question/revise targets a node or all nodes; verdict records the human decision; cancel ends the run. Every action requires human confirmation.",
          execute: (input, context) =>
            Effect.gen(function* () {
              yield* permission
                .assert({
                  action: "nexus_judge",
                  resources: [input.id],
                  save: [],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: { type: "tool", messageID: context.messageID, id: context.id },
                })
                .pipe(Effect.mapError((error) => new ToolFailure({ message: "Judge action denied", error })))
              const key = `kidunexus:${context.sessionID}:${input.id}`
              const stored = decodeReport(yield* kv.get(key))
              if (
                Option.isNone(stored) ||
                stored.value.mode !== "human_judge" ||
                stored.value.state !== "awaiting_judge_input"
              )
                return yield* new ToolFailure({ message: "No paused human-judge run with this ID" })
              if (running.has(context.sessionID)) return yield* new ToolFailure({ message: "A run is active" })
              if (input.target && !stored.value.nodes.some((node) => node.assignment?.id === input.target))
                return yield* new ToolFailure({ message: "Unknown judge target" })
              yield* confirm(context, "Confirm human judge action", JSON.stringify(input))
              const current = decodeReport(yield* kv.get(key))
              if (
                Option.isNone(current) ||
                current.value.updated !== stored.value.updated ||
                current.value.state !== "awaiting_judge_input" ||
                running.has(context.sessionID)
              )
                return yield* new ToolFailure({ message: "Run changed; inspect the latest report before judging" })
              const feedback = { ...input, feedback: NexusPrompt.redact(input.feedback) }
              if (input.action === "question" || input.action === "revise")
                return yield* run({ task: stored.value.task, mode: "human_judge" }, context, stored.value, feedback)
              const report: NexusSchema.Report = {
                ...stored.value,
                state: input.action === "cancel" ? "cancelled" : "completed",
                updated: yield* Clock.currentTimeMillis,
                conclusion: feedback.feedback,
                decisions: [...(stored.value.decisions ?? []), feedback],
              }
              yield* kv.set(key, Schema.encodeSync(NexusSchema.Report)(report))
              return { output: report, content: JSON.stringify(report), metadata: { nexus: progress(report) } }
            }),
        })
        editor.add({
          name: "nexus_report",
          options: { codemode: false },
          description:
            "Inspect a saved Nexus report from this session, or list its runs. Interrupted runs are not automatically replayed, especially after side effects.",
          input: Schema.Struct({ id: Schema.optionalKey(Schema.String) }),
          output: Schema.Json,
          execute: (input, context) =>
            Effect.gen(function* () {
              yield* sessions
                .get(context.sessionID)
                .pipe(Effect.mapError((error) => new ToolFailure({ message: "Session unavailable", error })))
              yield* permission
                .assert({
                  action: "nexus_report",
                  resources: [context.sessionID],
                  save: [],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: { type: "tool", messageID: context.messageID, id: context.id },
                })
                .pipe(Effect.mapError((error) => new ToolFailure({ message: "Report access denied", error })))
              const prefix = `kidunexus:${context.sessionID}:`
              if (!input.id) {
                const entries = yield* kv.scan({ prefix, limit: 100 })
                const output = {
                  runs: entries.entries.flatMap((entry) => {
                    const report = decodeReport(entry.value)
                    return Option.isSome(report)
                      ? [
                          {
                            id: report.value.id,
                            state: report.value.state,
                            task: report.value.task,
                            updated: report.value.updated,
                          },
                        ]
                      : []
                  }),
                  more: entries.next !== undefined,
                }
                return { output, content: JSON.stringify(output) }
              }
              const report = decodeReport(yield* kv.get(`${prefix}${input.id}`))
              if (Option.isNone(report)) return yield* new ToolFailure({ message: "Report not found in this session" })
              const output = {
                report: Schema.encodeSync(NexusSchema.Report)(report.value),
                graph: NexusGraph.evidence(report.value),
                active: running.has(context.sessionID),
              }
              return { output, content: JSON.stringify(output), metadata: { nexus: progress(report.value) } }
            }),
        })
      })
      .pipe(Effect.orDie)
  }),
})

function snapshot(options: NexusConfig.Resolved): ConfigKiduNexus.Info {
  return {
    enabled: options.enabled,
    mode: options.mode,
    max_concurrent_agents: options.concurrency,
    max_iterations: options.iterations,
    max_debate_rounds: options.debateRounds,
    max_task_duration_seconds: options.durationMs / 1000,
    max_total_tokens: options.tokens,
    max_output_tokens: options.outputTokens,
    max_worker_steps: options.steps,
    max_estimated_cost_usd: options.cost,
    allow_execution: options.execution,
    cross_pollination: options.crossPollination,
    independent_verification: options.verification,
    role_models: options.models,
    fallback_models: options.fallbacks,
  }
}

function progress(report: NexusSchema.Report, reservedTokens = report.reservedTokens ?? 0): KiduNexus.Progress {
  return {
    id: report.id,
    state: report.state,
    phase: report.nodes.findLast((node) => node.status === "running")?.phase ?? report.state,
    completed: report.nodes.filter((node) => node.status === "completed").length,
    total: report.nodes.length,
    tokens: report.tokens,
    estimatedCost: report.estimatedCost,
    reservedTokens,
    elapsedMs: report.updated - report.started,
    interactive: report.nodes.some((node) => node.assignment !== undefined),
    nodes: report.nodes.map((node) => ({
      id: node.id,
      role: node.role,
      status: node.status,
      dependencies: node.dependencies,
      sessionID: node.sessionID,
      model: node.model,
    })),
  }
}
