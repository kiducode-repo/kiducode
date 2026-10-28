import { expect } from "bun:test"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel } from "@opencode/ai"
import { OpenAIChat } from "@opencode/ai/protocols"
import { TestLLM } from "@opencode/ai/testing"
import { Agent } from "@opencode/core/agent"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNodePlatform } from "@opencode/core/effect/app-node-platform"
import { Watcher } from "@opencode/core/filesystem/watcher"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { Model } from "@opencode/core/model"
import { Plugin } from "@opencode/core/plugin"
import { Provider } from "@opencode/core/provider"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { Tool } from "@opencode/core/tool"
import { KV } from "@opencode/core/kv"
import { Bus } from "@opencode/core/bus"
import { Permission } from "@opencode/core/permission"
import { Form } from "@opencode/core/form"
import { NexusSchema } from "@opencode/core/kidunexus/schema"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { tempGlobalLayer } from "./fixture/global"
import { offlineModels } from "./fixture/models"
import { tmpdirScoped } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { executeTool, toolIdentity } from "./lib/tool"

const llmLayer = TestLLM.testLayer()
const it = testEffect(
  Layer.merge(
    llmLayer,
    AppNodeBuilder.build(LayerNode.group([Session.node, LocationServiceMap.node, KV.node, Bus.node]), [
      Global.node.replace(tempGlobalLayer),
      offlineModels,
      Watcher.node.replace(Watcher.configured({ enabled: false })),
      LayerNodePlatform.llmClient.replace(llmLayer),
      SessionRunnerModel.node.replace(
        Layer.succeed(SessionRunnerModel.Service, {
          resolve: () =>
            Effect.succeed(
              SessionRunnerModel.resolved(
                LanguageModel.make({ id: "fixture", provider: "test", route: OpenAIChat.route }),
                {
                  capabilities: { tools: true, input: ["text"], output: ["text"] },
                  cost: [],
                  limit: { context: 200_000, output: 32_000 },
                },
              ),
            ),
        }),
      ),
    ]),
  ),
)

it.live("native Nexus tool runs real child sessions and persists an inspectable report", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    yield* Effect.promise(() =>
      Bun.write(
        `${directory.path}/kiducode.json`,
        JSON.stringify({
          kidunexus: { enabled: true, max_total_tokens: 2_000_000, max_debate_rounds: 1 },
          permissions: [{ action: "*", resource: "*", effect: "allow" }],
        }),
      ),
    )
    const sessions = yield* Session.Service
    const locations = yield* LocationServiceMap.Service
    const llm = yield* TestLLM.Test
    yield* llm.serve((request) => {
      const role =
        request.system
          ?.map((part) => part.text)
          .join(" ")
          .match(/KiduNexus's (\w+) worker/)?.[1] ?? "unknown"
      return TestLLM.textWithUsage(
        JSON.stringify({
          summary: `${role} public result`,
          complexity: "complex",
          hypotheses: [{ text: `${role} candidate`, sources: [] }],
          evidence: [],
          challenges: role === "opponent" ? [{ target: "pro-0", reason: "Missing executable evidence" }] : [],
          verifications:
            role === "verification"
              ? [{ target: "pro-0", verdict: "needs_evidence", reason: "No source supplied", sources: [] }]
              : [],
          unresolved: ["Evidence not independently confirmed"],
          next: "complete",
        }),
        role,
        100,
      )
    })
    const parent = yield* sessions.create({
      location: { directory: AbsolutePath.make(directory.path) },
      agent: Agent.ID.make("nexus"),
      model: Model.Ref.make({ id: Model.ID.make("fixture"), providerID: Provider.ID.make("test") }),
    })
    yield* Plugin.Service.use((plugins) => plugins.awaitActivation).pipe(Effect.provide(locations.get(parent.location)))
    yield* Provider.Service.use((providers) =>
      providers.transform((editor) => {
        editor.models.update(Provider.ID.make("test"), Model.ID.make("fixture"), () => {})
      }),
    ).pipe(Effect.provide(locations.get(parent.location)))
    const registry = yield* Tool.Service.pipe(Effect.provide(locations.get(parent.location)))
    const progress: Tool.Metadata[] = []
    const result = yield* executeTool(registry, {
      ...toolIdentity,
      agent: Agent.ID.make("nexus"),
      sessionID: parent.id,
      call: {
        type: "tool-call",
        id: "nexus-integration",
        name: "nexus_run",
        input: { task: "Compare two implementations", mode: "adversarial" },
      },
      progress: (value) =>
        Effect.sync(() => {
          progress.push(structuredClone(value))
        }),
    })
    expect(result).toMatchObject({ status: "completed", output: { state: "completed" } })
    const report = Schema.decodeUnknownSync(NexusSchema.Report)(result.output)
    expect(report.nodes.filter((node) => node.phase === "GENERATE")).toHaveLength(2)
    expect(report.nodes.every((node) => node.sessionID)).toBe(true)
    expect(new Set(report.nodes.map((node) => node.sessionID)).size).toBe(report.nodes.length)
    expect(report.unresolved).toContain("Evidence not independently confirmed")
    expect(report.tokens).toBeGreaterThan(0)
    expect(report.estimatedCost).toBeNull()
    expect(progress.length).toBeGreaterThan(5)
    const kv = yield* KV.Service
    expect(yield* kv.get(`kidunexus:${parent.id}:nexus-integration`)).toMatchObject({ state: "completed" })
    const replay = yield* executeTool(registry, {
      ...toolIdentity,
      agent: Agent.ID.make("nexus"),
      sessionID: parent.id,
      call: { type: "tool-call", id: "inspect", name: "nexus_report", input: { id: "nexus-integration" } },
    })
    expect(replay).toMatchObject({ status: "completed", output: { active: false, report: { state: "completed" } } })
  }),
)

it.live(
  "human runs require confirmation, persist a pause, accept targeted feedback and record only confirmed verdicts",
  () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped()
      yield* Effect.promise(() =>
        Bun.write(
          `${directory.path}/kiducode.json`,
          JSON.stringify({
            kidunexus: { enabled: true, max_total_tokens: 2_000_000, max_iterations: 3 },
            permissions: [{ action: "*", resource: "*", effect: "allow" }],
          }),
        ),
      )
      const sessions = yield* Session.Service
      const locations = yield* LocationServiceMap.Service
      const llm = yield* TestLLM.Test
      yield* llm.serve(() =>
        TestLLM.textWithUsage(
          JSON.stringify({
            summary: "Public proposal",
            hypotheses: [],
            evidence: [],
            challenges: [],
            verifications: [],
            unresolved: ["Requires human decision"],
            next: "complete",
          }),
          "proposal",
          100,
        ),
      )
      const parent = yield* sessions.create({
        location: { directory: AbsolutePath.make(directory.path) },
        agent: Agent.ID.make("nexus"),
        model: Model.Ref.make({ id: Model.ID.make("fixture"), providerID: Provider.ID.make("test") }),
      })
      yield* Plugin.Service.use((plugins) => plugins.awaitActivation).pipe(
        Effect.provide(locations.get(parent.location)),
      )
      yield* Provider.Service.use((providers) =>
        providers.transform((editor) => {
          editor.models.update(Provider.ID.make("test"), Model.ID.make("fixture"), () => {})
        }),
      ).pipe(Effect.provide(locations.get(parent.location)))
      const registry = yield* Tool.Service.pipe(Effect.provide(locations.get(parent.location)))
      const forms = yield* Form.Service.pipe(Effect.provide(locations.get(parent.location)))
      const bus = yield* Bus.Service
      const confirmations = ["cancel", "confirm", "confirm", "cancel", "confirm"]
      yield* bus.subscribe(Form.Event.Created).pipe(
        Stream.runForEach((event) =>
          forms
            .reply({ id: event.data.form.id, answer: { confirm: confirmations.shift() ?? "cancel" } })
            .pipe(Effect.orDie),
        ),
        Effect.forkScoped({ startImmediately: true }),
      )
      const input = {
        task: "Compare designs",
        mode: "human_judge",
        nodes: [
          { id: "design", role: "creative", model: { providerID: "test", id: "fixture" } },
          { id: "audit", role: "skeptic" },
        ],
      }
      const invoke = (id: string, name: string, input: unknown, sessionID = parent.id) =>
        executeTool(registry, {
          ...toolIdentity,
          agent: Agent.ID.make("nexus"),
          sessionID,
          call: { type: "tool-call", id, name, input },
        })
      expect(yield* invoke("declined", "nexus_run", input)).toMatchObject({ status: "error" })
      expect((yield* llm.requests()).length).toBe(0)
      const launched = yield* invoke("human", "nexus_run", input)
      expect(launched).toMatchObject({ status: "completed", output: { state: "awaiting_judge_input" } })
      const first = Schema.decodeUnknownSync(NexusSchema.Report)(launched.output)
      expect(first.nodes).toHaveLength(2)
      expect(first.nodes[0].model).toBe("test/fixture")
      const kv = yield* KV.Service
      const saved = Schema.decodeUnknownSync(NexusSchema.Report)(yield* kv.get(`kidunexus:${parent.id}:human`))
      expect(saved.reservedTokens).toBeGreaterThan(0)
      const other = yield* sessions.create({ location: parent.location })
      expect(
        yield* invoke(
          "foreign",
          "nexus_judge",
          { id: "human", action: "verdict", feedback: "Wrong session" },
          other.id,
        ),
      ).toMatchObject({ status: "error" })
      const followup = yield* invoke("followup", "nexus_judge", {
        id: "human",
        action: "question",
        target: "audit",
        feedback: "Check failure recovery",
      })
      expect(followup).toMatchObject({ status: "completed", output: { state: "awaiting_judge_input", round: 1 } })
      const revised = Schema.decodeUnknownSync(NexusSchema.Report)(yield* kv.get(`kidunexus:${parent.id}:human`))
      expect(revised.reservedTokens).toBeGreaterThan(saved.reservedTokens ?? 0)
      expect(revised.nodes).toHaveLength(3)
      expect(revised.nodes.at(-1)?.assignment?.id).toBe("audit")
      expect(revised.nodes[0].sessionID).toBe(first.nodes[0].sessionID)
      expect(
        yield* invoke("denied-verdict", "nexus_judge", {
          id: "human",
          action: "verdict",
          target: "design",
          feedback: "Choose design with audit recommendations",
        }),
      ).toMatchObject({ status: "error" })
      expect(yield* kv.get(`kidunexus:${parent.id}:human`)).toMatchObject({ state: "awaiting_judge_input" })
      const verdict = yield* invoke("verdict", "nexus_judge", {
        id: "human",
        action: "verdict",
        target: "design",
        feedback: "Choose design with audit recommendations",
      })
      expect(verdict).toMatchObject({
        status: "completed",
        output: {
          state: "completed",
          conclusion: "Choose design with audit recommendations",
          unresolved: ["Requires human decision"],
        },
      })
      expect(confirmations).toHaveLength(0)
      expect((yield* llm.requests()).length).toBe(3)
      expect(
        yield* invoke("repeat", "nexus_judge", { id: "human", action: "verdict", feedback: "Replace verdict" }),
      ).toMatchObject({ status: "error" })
    }),
)

it.live("execution uses real edit and test tools with approval; injected reasoning edits are blocked", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    yield* Effect.promise(() =>
      Promise.all([
        Bun.write(
          `${directory.path}/kiducode.json`,
          JSON.stringify({
            kidunexus: { enabled: true, allow_execution: true, max_total_tokens: 2_000_000, max_worker_steps: 4 },
            permissions: [{ action: "*", resource: "*", effect: "allow" }],
          }),
        ),
        Bun.write(`${directory.path}/sum.ts`, "export const sum = (a: number, b: number) => a - b\n"),
        Bun.write(
          `${directory.path}/sum.test.ts`,
          'import { expect, test } from "bun:test"\nimport { sum } from "./sum"\ntest("adds", () => expect(sum(2, 3)).toBe(5))\n',
        ),
      ]),
    )
    const sessions = yield* Session.Service
    const locations = yield* LocationServiceMap.Service
    const llm = yield* TestLLM.Test
    const observed: string[] = []
    yield* llm.serve((request) => {
      const role =
        request.system
          ?.map((part) => part.text)
          .join(" ")
          .match(/KiduNexus's (\w+) worker/)?.[1] ?? "unknown"
      const tools = request.messages.filter((message) => message.role === "tool")
      if (role === "creative" && tools.length === 0)
        return TestLLM.tool("injected-write", "write", {
          path: `${directory.path}/injected.txt`,
          content: "Unauthorized",
        })
      if (role === "execution" && tools.length === 0)
        return TestLLM.tool("read-source", "read", { path: `${directory.path}/sum.ts` })
      if (role === "execution" && tools.length === 1)
        return TestLLM.tool("fix-source", "edit", {
          path: `${directory.path}/sum.ts`,
          oldString: "a - b",
          newString: "a + b",
        })
      if (role === "evaluation" && tools.length === 0)
        return TestLLM.tool("test-source", "shell", {
          command: `bun test sum.test.ts`,
          workdir: directory.path,
        })
      observed.push(JSON.stringify(tools))
      return TestLLM.textWithUsage(
        JSON.stringify({
          summary: `${role} completed`,
          complexity: "complex",
          hypotheses: [],
          evidence: [],
          challenges: [],
          verifications: [],
          unresolved: [],
          next: "complete",
        }),
        role,
        100,
      )
    })
    const parent = yield* sessions.create({
      location: { directory: AbsolutePath.make(directory.path) },
      agent: Agent.ID.make("nexus"),
      model: Model.Ref.make({ id: Model.ID.make("fixture"), providerID: Provider.ID.make("test") }),
    })
    yield* Plugin.Service.use((plugins) => plugins.awaitActivation).pipe(Effect.provide(locations.get(parent.location)))
    yield* Provider.Service.use((providers) =>
      providers.transform((editor) => {
        editor.models.update(Provider.ID.make("test"), Model.ID.make("fixture"), () => {})
      }),
    ).pipe(Effect.provide(locations.get(parent.location)))
    const registry = yield* Tool.Service.pipe(Effect.provide(locations.get(parent.location)))
    const permission = yield* Permission.Service.pipe(Effect.provide(locations.get(parent.location)))
    const bus = yield* Bus.Service
    const approvals: string[] = []
    yield* bus.subscribe(Permission.Event.Asked).pipe(
      Stream.runForEach((event) =>
        Effect.gen(function* () {
          approvals.push(event.data.action)
          yield* permission.reply({ requestID: event.data.id, reply: "once" }).pipe(Effect.orDie)
        }),
      ),
      Effect.forkScoped({ startImmediately: true }),
    )
    const result = yield* executeTool(registry, {
      ...toolIdentity,
      agent: Agent.ID.make("nexus"),
      sessionID: parent.id,
      call: {
        type: "tool-call",
        id: "nexus-edit",
        name: "nexus_run",
        input: { task: "Fix sum and run its test", mode: "execute" },
      },
    })
    expect(result).toMatchObject({ status: "completed", output: { state: "completed" } })
    expect(yield* Effect.promise(() => Bun.file(`${directory.path}/sum.ts`).text())).toContain("a + b")
    expect(yield* Effect.promise(() => Bun.file(`${directory.path}/injected.txt`).exists())).toBe(false)
    expect(approvals).toContain("edit")
    expect(approvals).toContain("shell")
    expect(observed.some((value) => value.includes("1 pass"))).toBe(true)
  }),
)
