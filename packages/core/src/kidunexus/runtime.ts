export * as NexusRuntime from "./runtime.js"

import { Clock, Effect, Types } from "effect"
import { NexusGraph } from "./graph.js"
import { NexusSchema } from "./schema.js"
import type { NexusConfig } from "./config.js"

export type Worker = (node: Types.Mutable<NexusSchema.Node>, dependencies: readonly NexusSchema.Node[]) => Effect.Effect<NexusSchema.Findings, NexusSchema.Failure>
export type Checkpoint = (report: NexusSchema.Report) => Effect.Effect<void>
type State = Omit<Types.Mutable<NexusSchema.Report>, "nodes"> & { nodes: Types.Mutable<NexusSchema.Node>[] }

export const run = Effect.fn("KiduNexus.run")(function* (input: {
  id: string
  parentID: string
  task: string
  mode: NexusSchema.Report["mode"]
  config: NexusConfig.Resolved
  worker: Worker
  checkpoint: Checkpoint
}) {
  const classifier = input.mode === "standard" ? NexusGraph.node("synthesis", "SYNTHESIZE", "synthesis") : NexusGraph.node("classify", "CLASSIFY", "orchestrator")
  const report: State = {
    version: 1, id: input.id, parentID: input.parentID, task: input.task, mode: input.mode,
    state: "running", started: yield* Clock.currentTimeMillis, updated: yield* Clock.currentTimeMillis,
    nodes: [classifier],
    conclusion: "", unresolved: [], tokens: 0, estimatedCost: null,
  }
  const save = Effect.gen(function* () {
    report.updated = yield* Clock.currentTimeMillis
    report.tokens = report.nodes.reduce((sum, item) => sum + item.tokens, 0)
    report.estimatedCost = report.nodes.some((item) => item.sessionID && item.cost === null)
      ? null : report.nodes.reduce((sum, item) => sum + (item.cost ?? 0), 0)
    yield* input.checkpoint(report)
  })
  const finish = (state: NexusSchema.Report["state"], reason?: string) => Effect.gen(function* () {
    report.state = state
    if (reason) report.reason = reason
    report.nodes.forEach((item) => {
      if (item.status === "running") item.status = state === "cancelled" ? "cancelled" : "failed"
      if (item.status === "pending") item.status = "skipped"
    })
    yield* save
  })
  const execute = (item: Types.Mutable<NexusSchema.Node>) => Effect.gen(function* () {
    item.status = "running"
    const start = yield* Clock.currentTimeMillis
    yield* save
    const attempt = Effect.gen(function* () {
      item.attempt++
      const findings = yield* input.worker(item, report.nodes.filter((node) => item.dependencies.includes(node.id)))
      item.result = structuredClone(findings)
    })
    // Never automatically retry a node which could already have performed side effects.
    yield* attempt.pipe(Effect.catchTag("Nexus.Failure", (error) =>
      error.kind === "worker" && item.phase !== "EXECUTE" && item.phase !== "VALIDATE" ? attempt : Effect.fail(error)))
    item.status = "completed"
    item.elapsedMs = (yield* Clock.currentTimeMillis) - start
    yield* save
  })

  const workflow = Effect.gen(function* () {
    yield* execute(classifier)
    if (input.mode !== "standard") report.nodes.push(...NexusGraph.plan(input.mode, report.nodes[0]?.result?.complexity ?? "complex", input.config))
    NexusGraph.validate(report.nodes)
    yield* save
    while (report.nodes.some((item) => item.status === "pending")) {
      const ready = report.nodes.filter((item) => item.status === "pending" && item.dependencies.every((id) =>
        report.nodes.some((dependency) => dependency.id === id && (dependency.status === "completed" || dependency.status === "skipped"))))
      if (!ready.length) return yield* new NexusSchema.Failure({ kind: "invalid", message: "Task graph cannot progress" })
      yield* Effect.forEach(ready, execute, { concurrency: input.config.concurrency, discard: true })
      const judge = ready.findLast((item) => item.id.startsWith("judge-") && item.result?.next === "complete")
      if (judge) report.nodes.forEach((item) => {
        if (item.status === "pending" && (item.phase === "DEBATE" || item.id.startsWith("judge-"))) item.status = "skipped"
      })
      const synthesis = ready.find((item) => item.phase === "SYNTHESIZE")
      const revisions = report.nodes.filter((item) => item.phase === "REVISE").length
      if (synthesis?.result?.next === "revise" && revisions + 1 < input.config.iterations && input.mode !== "execute") {
        const id = `revision-${revisions + 1}`
        report.nodes.push(NexusGraph.node(id, "REVISE", "logical", [synthesis.id]))
        if (input.config.verification) report.nodes.push(NexusGraph.node(`${id}-verify`, "VERIFY", "verification", [id, synthesis.id]))
        report.nodes.push(NexusGraph.node(`${id}-synthesis`, "SYNTHESIZE", "synthesis", input.config.verification ? [id, `${id}-verify`] : [id]))
      }
    }
    report.conclusion = report.nodes.findLast((item) => item.phase === "SYNTHESIZE")?.result?.summary ?? "No synthesis produced."
    report.unresolved = Array.from(new Set(report.nodes.flatMap((item) => item.result?.unresolved ?? [])))
    const validation = report.nodes.find((item) => item.phase === "VALIDATE")
    if (validation?.result) report.conclusion = `${report.conclusion}\n\nValidation: ${validation.result.summary}`.slice(0, 12000)
    yield* finish("completed")
  })
  yield* workflow.pipe(
    Effect.timeout(input.config.durationMs),
    Effect.catchTag("Nexus.Failure", (error) => finish(error.kind === "limit" ? "limited" : "failed", error.message)),
    Effect.catchTag("TimeoutError", () => finish("limited", "Task deadline reached")),
    Effect.onInterrupt(() => finish("cancelled", "User or parent session interrupted the workflow")),
  )
  return report
})
