export * as KiduNexusTool from "./kidunexus.js"

import { define } from "@opencode/plugin/effect/plugin"
import { ToolFailure } from "@opencode/ai"
import { ConfigKiduNexus } from "@opencode/schema/config/kidunexus"
import { KiduNexus } from "@opencode/schema/kidunexus"
import { TokenUsage } from "@opencode/schema/token-usage"
import { Effect, Option, Schema, Semaphore, Stream } from "effect"
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

export const Input = Schema.Struct({
  task: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(12000)),
  mode: Schema.optionalKey(ConfigKiduNexus.Mode),
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
    const lock = yield* Semaphore.make(1)
    const running = new Set<Session.ID>()
    const workers = new Map<Session.ID, {
      budget: ReturnType<typeof NexusBudget.create>
      config: NexusConfig.Resolved
      model: Model.Info
      steps: number
      failure?: NexusSchema.Failure
    }>()
    const settings = Effect.gen(function* () {
      return NexusConfig.resolve((yield* config.entries()).flatMap((entry) => entry.type === "document" && entry.info.kidunexus ? [entry.info.kidunexus] : []))
    })

    yield* ctx.agent.transform((editor) => {
      editor.update(primary, (agent) => {
        agent.name = Agent.Name.make("Nexus")
        agent.description = "KiduNexus: bounded collaborative reasoning, adversarial verification, and authorized execution."
        agent.mode = "primary"
        agent.steps = 4
        agent.system = "You are KiduNexus. For a substantive user task call nexus_run with a precise self-contained task and the requested mode. Use adaptive unless requested otherwise. Execution requires mode execute and configured authorization. Present the returned conclusion, verification and unresolved issues faithfully. Use nexus_report to inspect prior runs. Do not claim success when a run failed or was limited. Simple greetings need no workflow. Never report unmeasured savings or hide disagreement."
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
            if (NexusPolicy.allows(parsed, tool)) agent.permissions.push({ action: tool, resource: "*", effect: NexusPolicy.mutates(tool) ? "ask" : "allow" })
          }
          agent.permissions.push({ action: "read", resource: "*.env*", effect: "deny" })
        })
      })
    })

    // This hook is a runtime execution boundary, including calls from a stale model snapshot.
    yield* ctx.tool.hook("execute.before", (event) => Effect.gen(function* () {
      const session = yield* sessions.get(event.sessionID).pipe(Effect.mapError((error) => new Tool.Error({ message: "Session unavailable", error })))
      const marker = decodeMarker(session.metadata?.kidunexus)
      if (Option.isNone(marker)) {
        if (String(event.agent).startsWith("nexus-") || (event.agent === primary && !["nexus_run", "nexus_report", "question"].includes(event.tool)))
          return yield* new Tool.Error({ message: "Nexus actions must run through an authorized workflow" })
        return
      }
      if (!workers.has(event.sessionID) || !NexusPolicy.allows(marker.value.role, event.tool))
        return yield* new Tool.Error({ message: "Tool is outside the active Nexus worker's authority" })
      if (event.tool === "shell") {
        const input = Schema.decodeUnknownOption(ShellTool.Input)(event.input)
        if (Option.isNone(input)) return yield* new Tool.Error({ message: "Invalid shell arguments" })
        if (input.value.background) return yield* new Tool.Error({ message: "Nexus workers cannot detach background commands" })
        event.input = { ...input.value, background: false, timeout: Math.min(input.value.timeout || 60_000, 60_000) }
      }
      const parent = yield* sessions.get(marker.value.parentID).pipe(Effect.mapError((error) => new Tool.Error({ message: "Nexus parent unavailable", error })))
      if (parent.location.directory !== session.location.directory || parent.location.workspaceID !== session.location.workspaceID)
        return yield* new Tool.Error({ message: "Nexus worker Location differs from its parent" })
    }))

    // Leaf permissions supply resolved paths/commands. Intersect with the originating policy
    // here rather than attempting to infer resources from arbitrary tool input shapes.
    yield* ctx.permission.hook("evaluate", (event) => Effect.gen(function* () {
      const child = yield* sessions.get(event.sessionID).pipe(Effect.orDie)
      const marker = decodeMarker(child.metadata?.kidunexus)
      if (Option.isNone(marker)) return
      if (!workers.has(child.id)) { event.effect = "deny"; return }
      const parent = yield* sessions.get(marker.value.parentID).pipe(Effect.orDie)
      const agent = yield* agents.resolve(marker.value.originAgent)
      if (!agent) { event.effect = "deny"; return }
      const effects = event.resources.map((resource) => Permission.evaluate(event.action, resource, agent.permissions, parent.permissions ?? []).effect)
      if (effects.includes("deny")) { event.effect = "deny"; return }
      if (event.effect !== "deny" && (effects.includes("ask") || event.action === "edit" || event.action === "shell")) event.effect = "ask"
    }))

    yield* ctx.event.subscribe().pipe(
      Stream.filter((event) => event.type === "session.deleted"),
      Stream.runForEach((event) => Effect.gen(function* () {
        if (event.type !== "session.deleted") return
        const prefix = `kidunexus:${event.data.sessionID}:`
        while (true) {
          const page = yield* kv.scan({ prefix, limit: 100 })
          yield* Effect.forEach(page.entries, (entry) => kv.remove(entry.key), { discard: true })
          if (!page.next) break
        }
      })),
      Effect.forkScoped,
    )

    yield* ctx.session.hook("context", (event) => Effect.gen(function* () {
      if (event.agent === primary) {
        Object.keys(event.tools).forEach((name) => { if (!["nexus_run", "nexus_report", "question"].includes(name)) delete event.tools[name] })
      }
      const state = workers.get(event.sessionID)
      if (!state) {
        if (String(event.agent).startsWith("nexus-")) return yield* Effect.die(new Error("Nexus worker is not attached to an active run"))
        return
      }
      if (++state.steps > state.config.steps) {
        state.failure = new NexusSchema.Failure({ kind: "limit", message: "Nexus worker step limit reached" })
        return yield* Effect.die(state.failure)
      }
      const session = yield* sessions.get(event.sessionID).pipe(Effect.orDie)
      const marker = decodeMarker(session.metadata?.kidunexus)
      if (Option.isNone(marker)) return yield* Effect.die(new Error("Missing Nexus worker identity"))
      Object.keys(event.tools).forEach((name) => { if (!NexusPolicy.allows(marker.value.role, name)) delete event.tools[name] })
      const bytes = new TextEncoder().encode(JSON.stringify({ system: event.system, messages: event.messages, tools: event.tools })).length + 1024
      const max = yield* Effect.try({
        try: () => state.budget.reserve(state.model, bytes),
        catch: (error) => error instanceof NexusSchema.Failure ? error : new NexusSchema.Failure({ kind: "invalid", message: "Invalid budget reservation" }),
      }).pipe(Effect.tapError((error) => Effect.sync(() => { state.failure = error })), Effect.orDie)
      event.options.maxTokens = max
    }))
    // Retries get their own bounded fresh worker and reservation; never hide provider retries from accounting.
    yield* ctx.session.hook("retry", (event) => Effect.sync(() => {
      if (workers.has(event.sessionID)) event.decision = { retry: false }
    }))

    yield* ctx.tool.transform((editor) => {
      editor.add({
        name: "nexus_run", input: Input, output: NexusSchema.Report,
        options: { codemode: false },
        description: "Run KiduNexus: bounded independent ideation, exchange, adversarial verification and synthesis. Requires kidunexus.enabled in configuration. execute mode additionally requires allow_execution and normal tool approvals. Returns an inspectable report; cost/token reservations are estimates, not billing guarantees.",
        execute: (input, context) => Effect.gen(function* () {
          const options = yield* settings
          if (!options.enabled) return yield* new ToolFailure({ message: "Enable KiduNexus with kidunexus.enabled: true in configuration." })
          const mode = input.mode ?? options.mode
          if (mode === "execute" && !options.execution) return yield* new ToolFailure({ message: "KiduNexus execution is disabled; set allow_execution explicitly." })
          const parent = yield* sessions.get(context.sessionID).pipe(Effect.mapError((error) => new ToolFailure({ message: "Parent session unavailable", error })))
          if (parent.metadata?.kidunexus) return yield* new ToolFailure({ message: "Nested Nexus workflows are forbidden" })
          yield* permission.assert({ action: "nexus_run", resources: [mode], save: [mode], sessionID: parent.id, agent: context.agent, source: { type: "tool", messageID: context.messageID, id: context.id } }).pipe(Effect.mapError((error) => new ToolFailure({ message: "Nexus run not authorized", error })))
          if (running.has(parent.id)) return yield* new ToolFailure({ message: "A Nexus run is already active for this session" })
          running.add(parent.id)
          const budget = NexusBudget.create(options)
          const key = `kidunexus:${parent.id}:${context.id}`
          const progress = (report: NexusSchema.Report): KiduNexus.Progress => ({
              id: report.id, state: report.state,
              phase: report.nodes.findLast((node) => node.status === "running")?.phase ?? report.state,
              completed: report.nodes.filter((node) => node.status === "completed").length,
              total: report.nodes.length, tokens: report.tokens, estimatedCost: report.estimatedCost,
              reservedTokens: budget.reserved.tokens, elapsedMs: report.updated - report.started,
              nodes: report.nodes.map((node) => ({ id: node.id, role: node.role, status: node.status, dependencies: node.dependencies })),
          })
          const checkpoint: NexusRuntime.Checkpoint = (report) => lock.withPermit(Effect.gen(function* () {
            yield* kv.set(key, Schema.encodeSync(NexusSchema.Report)(report))
            yield* context.progress({ nexus: progress(report) })
          }))
          const worker: NexusRuntime.Worker = (node, dependencies) => Effect.gen(function* () {
            const available = yield* models.available()
            const selected = options.models[node.role] ?? parent.model
            const candidate = node.attempt > 1 ? options.fallbacks[0] ?? selected : selected
            if (!candidate) return yield* new NexusSchema.Failure({ kind: "invalid", message: "Select a coordinator model or configure role_models" })
            const model = available.find((item) => item.id === candidate.id && item.providerID === candidate.providerID)
            if (!model || (candidate.variant && candidate.variant !== "default" && !model.variants.some((variant) => variant.id === candidate.variant)))
              return yield* new NexusSchema.Failure({ kind: "worker", message: "Configured worker model or variant is unavailable" })
            const child = yield* sessions.create({
              parentID: parent.id, agent: Agent.ID.make(`nexus-${node.role}`), model: candidate,
              title: `Nexus ${node.id}`,
              metadata: { kidunexus: { parentID: parent.id, role: node.role, originAgent: context.agent } },
              permissions: [
                { action: "*", resource: "*", effect: "deny" },
                ...["read", "glob", "grep", "webfetch", "websearch", "edit", "shell"].filter((tool) => NexusPolicy.allows(node.role, tool)).map((tool) => ({ action: tool, resource: "*", effect: NexusPolicy.mutates(tool) ? "ask" as const : "allow" as const })),
                ...(parent.permissions ?? []),
                { action: "read", resource: "*.env*", effect: "deny" },
                { action: "read", resource: "*.pem", effect: "deny" },
                { action: "read", resource: "*id_rsa*", effect: "deny" },
              ],
            }).pipe(Effect.mapError(() => new NexusSchema.Failure({ kind: "worker", message: "Could not create worker session" })))
            node.sessionID = child.id
            node.model = `${candidate.providerID}/${candidate.id}`
            const state: { budget: typeof budget; config: typeof options; model: Model.Info; steps: number; failure?: NexusSchema.Failure } = { budget, config: options, model, steps: 0 }
            workers.set(child.id, state)
            return yield* Effect.gen(function* () {
              yield* sessions.prompt({ sessionID: child.id, text: NexusPrompt.handoff(input.task, node, dependencies), resume: false })
              yield* sessions.resume(child.id)
              const messages = yield* sessions.messages({ sessionID: child.id, order: "desc", limit: 20 })
              const assistant = messages.find((message) => message.type === "assistant" && !message.error)
              const decoded = decodeFindings(SubagentCompletion.text(assistant))
              if (Option.isNone(decoded)) return yield* new NexusSchema.Failure({ kind: "worker", message: "Worker did not return a valid public findings envelope" })
              const redacted = decodeFindings(NexusPrompt.redact(JSON.stringify(decoded.value)))
              if (Option.isNone(redacted)) return yield* new NexusSchema.Failure({ kind: "invalid", message: "Could not redact worker findings" })
              return redacted.value
            }).pipe(
              Effect.mapError(() => state.failure ?? new NexusSchema.Failure({ kind: "worker", message: `Worker ${node.id} failed; inspect its child session for details` })),
              Effect.ensuring(Effect.gen(function* () {
                yield* sessions.interrupt(child.id).pipe(Effect.ignore)
                const finished = yield* sessions.get(child.id).pipe(Effect.orDie)
                node.tokens += TokenUsage.total(finished.tokens)
                node.cost = model.cost.length ? (node.cost ?? 0) + finished.cost : null
                workers.delete(child.id)
              })),
            )
          })
          const report = yield* NexusRuntime.run({ id: context.id, parentID: parent.id, task: NexusPrompt.redact(input.task), mode, config: options, worker, checkpoint }).pipe(
            Effect.ensuring(Effect.sync(() => running.delete(parent.id))),
          )
          return { output: report, content: JSON.stringify({ ...report, graph: NexusGraph.evidence(report) }), metadata: { nexus: progress(report) } }
        }),
      })
      editor.add({
        name: "nexus_report", options: { codemode: false },
        description: "Inspect a saved Nexus report from this session, or list its runs. Interrupted runs are not automatically replayed, especially after side effects.",
        input: Schema.Struct({ id: Schema.optionalKey(Schema.String) }), output: Schema.Json,
        execute: (input, context) => Effect.gen(function* () {
          yield* sessions.get(context.sessionID).pipe(Effect.mapError((error) => new ToolFailure({ message: "Session unavailable", error })))
          yield* permission.assert({ action: "nexus_report", resources: [context.sessionID], save: [], sessionID: context.sessionID, agent: context.agent, source: { type: "tool", messageID: context.messageID, id: context.id } }).pipe(Effect.mapError((error) => new ToolFailure({ message: "Report access denied", error })))
          const prefix = `kidunexus:${context.sessionID}:`
          if (!input.id) {
            const entries = yield* kv.scan({ prefix, limit: 100 })
            const output = { runs: entries.entries.flatMap((entry) => {
              const report = decodeReport(entry.value)
              return Option.isSome(report) ? [{ id: report.value.id, state: report.value.state, task: report.value.task, updated: report.value.updated }] : []
            }), more: entries.next !== undefined }
            return { output, content: JSON.stringify(output) }
          }
          const report = decodeReport(yield* kv.get(`${prefix}${input.id}`))
          if (Option.isNone(report)) return yield* new ToolFailure({ message: "Report not found in this session" })
          const output = { report: Schema.encodeSync(NexusSchema.Report)(report.value), graph: NexusGraph.evidence(report.value), active: running.has(context.sessionID) }
          return { output, content: JSON.stringify(output) }
        }),
      })
    }).pipe(Effect.orDie)
  }),
})
