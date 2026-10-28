import { describe, expect, test } from "bun:test"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { ConfigKiduNexus } from "@opencode/schema/config/kidunexus"
import { NexusConfig } from "../src/kidunexus/config"
import { NexusGraph } from "../src/kidunexus/graph"
import { NexusRuntime } from "../src/kidunexus/runtime"
import { NexusSchema } from "../src/kidunexus/schema"
import { NexusBudget } from "../src/kidunexus/budget"
import { NexusPolicy } from "../src/kidunexus/policy"
import { NexusPrompt } from "../src/kidunexus/prompt"
import { NexusBenchmark } from "../src/kidunexus/benchmark"
import { ConfigNormalize } from "../src/config/normalize"
import { it } from "./lib/effect"

const findings = (summary: string): NexusSchema.Findings => ({
  summary, complexity: "complex", hypotheses: [{ text: summary, sources: ["https://example.test/spec"] }],
  evidence: [{ source: "https://example.test/spec#section", excerpt: "Specification excerpt" }],
  challenges: [], verifications: [], unresolved: ["Live verification needed"], next: "complete",
})
const options = NexusConfig.resolve([{ enabled: true }])
const base = { id: "run-1", parentID: "parent-1", task: "Compare candidate implementations", mode: "adversarial" as const, config: options }

describe("KiduNexus contracts", () => {
  test("rejects invalid limits and unsupported settings at the config boundary", () => {
    expect(() => Schema.decodeUnknownSync(ConfigKiduNexus.Info)({ max_concurrent_agents: 0 })).toThrow()
    expect(() => Schema.decodeUnknownSync(ConfigKiduNexus.Info)({ max_total_tokens: -1 })).toThrow()
    expect(ConfigNormalize.normalize({ kidunexus: { enabled: true, sandbox_enabled: true } }).type).toBe("rejected")
    expect(ConfigNormalize.normalize({ kidunexus: { role_models: { unsupported: { providerID: "test", id: "cheap" } } } }).type).toBe("rejected")
    expect(Schema.encodeSync(ConfigKiduNexus.Info)({ role_models: { creative: undefined } })).toEqual({ role_models: {} })
    expect(ConfigNormalize.normalize({ kidunexus: { enabled: true, role_models: { creative: { providerID: "test", id: "cheap" } } } })).toMatchObject({ type: "normalized", encoded: { kidunexus: { enabled: true } } })
  })
  test("project entries cannot relax earlier ceilings or execution denial", () => {
    const config = NexusConfig.resolve([
      { enabled: true, allow_execution: false, max_total_tokens: 2000, max_concurrent_agents: 1 },
      { allow_execution: true, max_total_tokens: 100000, max_concurrent_agents: 8 },
    ])
    expect(config.tokens).toBe(2000)
    expect(config.concurrency).toBe(1)
    expect(config.execution).toBe(false)
    expect(NexusConfig.resolve([{ enabled: false }, { enabled: true }]).enabled).toBe(false)
  })
  test("graph is acyclic, bounded and simple requests avoid a swarm", () => {
    const graph = [NexusGraph.node("classify", "CLASSIFY", "orchestrator"), ...NexusGraph.plan("adversarial", "complex", options)]
    expect(() => NexusGraph.validate(graph)).not.toThrow()
    expect(graph.filter((node) => node.role === "opponent")).toHaveLength(options.debateRounds)
    expect(NexusGraph.plan("adaptive", "simple", options)).toHaveLength(1)
    expect(() => NexusGraph.validate([NexusGraph.node("a", "VERIFY", "verification", ["b"]), NexusGraph.node("b", "GENERATE", "creative", ["a"])])).toThrow()
  })
  test("reasoning roles cannot mutate or spawn agents even under injected requests", () => {
    for (const role of ["creative", "logical", "research", "skeptic", "opponent", "verification", "synthesis"] as const) {
      for (const tool of ["shell", "edit", "write", "patch", "remote_ssh", "subagent", "nexus_run", "execute", "unknown"]) expect(NexusPolicy.allows(role, tool)).toBe(false)
      expect(NexusPolicy.allows(role, "read")).toBe(true)
    }
    expect(NexusPolicy.allows("execution", "edit")).toBe(true)
    expect(NexusPolicy.allows("execution", "subagent")).toBe(false)
  })
  test("budget reservations reject oversubscription before another request", () => {
    const budget = NexusBudget.create(NexusConfig.resolve([{ max_total_tokens: 3000, max_output_tokens: 1000 }]))
    const model = Model.Info.default(Provider.ID.make("test"), Model.ID.make("test"))
    expect(budget.reserve(model, 1500)).toBe(1000)
    expect(() => budget.reserve(model, 1000)).toThrow("budget exhausted")
    expect(budget.reserved.tokens).toBe(2500)
    expect(() => NexusBudget.create(NexusConfig.resolve([{ max_estimated_cost_usd: 1 }])).reserve(model, 1000)).toThrow("unknown pricing")
    expect(() => budget.reserve({ ...model, limit: { context: 100, output: 100 } }, 200)).toThrow("context allowance")
  })
  test("redacts common tokens and private keys from public findings", () => {
    const output = NexusPrompt.redact("api_key=secret123 sk-abcdefghijklmnopqrstuvwxyz -----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----")
    expect(output).not.toContain("secret123")
    expect(output).not.toContain("sk-abcdefghijklmnopqrstuvwxyz")
    expect(output).not.toContain("\nprivate\n")
  })
})

describe("KiduNexus scheduler", () => {
  it.effect("independent hypotheses traverse exchange, adversarial challenge, verification and synthesis", () => Effect.gen(function* () {
    const checkpoints: NexusSchema.Report[] = []
    const report = yield* NexusRuntime.run({ ...base,
      checkpoint: (report) => Effect.sync(() => { checkpoints.push(structuredClone(report)) }),
      worker: (node, dependencies) => Effect.sync(() => {
        if (node.phase === "GENERATE") expect(dependencies.map((item) => item.id)).toEqual(["decompose"])
        if (node.role === "opponent") expect(dependencies.some((item) => item.role === "proponent")).toBe(true)
        if (node.role === "verification") expect(dependencies.some((item) => item.role === "opponent")).toBe(true)
        return findings(`${node.role} findings`)
      }),
    })
    expect(report.state).toBe("completed")
    expect(report.nodes.filter((node) => node.phase === "GENERATE")).toHaveLength(2)
    expect(report.nodes.some((node) => node.phase === "CROSS_POLLINATE" && node.status === "completed")).toBe(true)
    expect(report.nodes.find((node) => node.id === "pro-1")?.status).toBe("skipped")
    expect(report.conclusion).toBe("synthesis findings")
    expect(report.unresolved).toContain("Live verification needed")
    expect(checkpoints.at(-1)?.state).toBe("completed")
    const graph = NexusGraph.evidence(report)
    expect(graph.evidence).toHaveLength(1)
    expect(graph.evidence[0]?.nodes.length).toBeGreaterThan(1)
    expect(graph.hypotheses.every((item) => item.nodes.length > 0)).toBe(true)
    expect(Schema.decodeUnknownSync(NexusSchema.Report)(report)).toEqual(report)
  }))

  it.effect("runs independent workers concurrently within the configured bound", () => Effect.gen(function* () {
    const reached = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const counts = { active: 0, peak: 0 }
    const fiber = yield* NexusRuntime.run({ ...base,
      checkpoint: () => Effect.void,
      worker: (node) => Effect.gen(function* () {
        if (node.phase !== "GENERATE") return findings(node.id)
        counts.active++
        counts.peak = Math.max(counts.peak, counts.active)
        if (counts.active === 2) yield* Deferred.succeed(reached, undefined)
        yield* Deferred.await(release)
        counts.active--
        return findings(node.id)
      }),
    }).pipe(Effect.forkScoped({ startImmediately: true }))
    yield* Deferred.await(reached)
    yield* Deferred.succeed(release, undefined)
    expect((yield* Fiber.join(fiber)).state).toBe("completed")
    expect(counts.peak).toBe(2)
  }))

  it.effect("bounds reasoning retries and never retries side-effecting workers", () => Effect.gen(function* () {
    const calls: string[] = []
    const report = yield* NexusRuntime.run({ ...base, mode: "execute",
      checkpoint: () => Effect.void,
      worker: (node) => Effect.gen(function* () {
        calls.push(node.id)
        if (node.id === "classify" && node.attempt === 1) return yield* new NexusSchema.Failure({ kind: "worker", message: "provider failed" })
        if (node.phase === "EXECUTE") return yield* new NexusSchema.Failure({ kind: "worker", message: "ambiguous command outcome" })
        return findings(node.id)
      }),
    })
    expect(report.state).toBe("failed")
    expect(calls.filter((id) => id === "classify")).toHaveLength(2)
    expect(calls.filter((id) => id === "execute")).toHaveLength(1)
    expect(report.nodes.find((node) => node.phase === "VALIDATE")?.status).toBe("skipped")
  }))

  it.effect("deadline interrupts active workers and saves a limited report", () => Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const stopped = yield* Deferred.make<void>()
    const fiber = yield* NexusRuntime.run({ ...base, config: { ...options, durationMs: 100 },
      checkpoint: () => Effect.void,
      worker: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(stopped, undefined))),
    }).pipe(Effect.forkScoped({ startImmediately: true }))
    yield* Deferred.await(started)
    yield* TestClock.adjust(100)
    expect((yield* Fiber.join(fiber)).state).toBe("limited")
    yield* Deferred.await(stopped)
  }))

  it.effect("user cancellation propagates and checkpoints a cancelled state", () => Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const stopped = yield* Deferred.make<void>()
    const states: string[] = []
    const fiber = yield* NexusRuntime.run({ ...base,
      checkpoint: (report) => Effect.sync(() => { states.push(report.state) }),
      worker: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(stopped, undefined))),
    }).pipe(Effect.forkScoped({ startImmediately: true }))
    yield* Deferred.await(started)
    yield* Fiber.interrupt(fiber)
    yield* Deferred.await(stopped)
    expect(states.at(-1)).toBe("cancelled")
  }))

  it.effect("bounded revision requests terminate without an infinite reasoning loop", () => Effect.gen(function* () {
    const report = yield* NexusRuntime.run({ ...base, checkpoint: () => Effect.void,
      worker: (node) => Effect.succeed({ ...findings(node.id), next: "revise" }),
    })
    expect(report.state).toBe("completed")
    expect(report.nodes.filter((node) => node.phase === "REVISE")).toHaveLength(options.iterations - 1)
  }))

  it.effect("benchmark grades remain separate from workflow completion and unknown cost", () => Effect.gen(function* () {
    const report = yield* NexusRuntime.run({ ...base, mode: "standard", checkpoint: () => Effect.void, worker: () => Effect.succeed(findings("answer")) })
    expect(report.nodes).toHaveLength(1)
    const sample: NexusBenchmark.Sample = {
      task: "fixture", repetition: 1, system: "single", policy: "same-models-tools-budgets", revision: "fixture", runtime: "test",
      report: { ...report, estimatedCost: null }, success: false, testsPassed: 0, testsTotal: 1,
      supportedClaims: 0, unsupportedClaims: 1, evaluatedClaims: 1, correctVerifications: 0, evaluatedVerifications: 0,
      recoveredFailures: 0, inducedFailures: 0, gradingEvidence: "Independent test failed",
    }
    expect(NexusBenchmark.summarize([sample])[0]).toMatchObject({ successRate: 0, unsupportedClaimRate: 1, costPerSuccess: null, evidenceVerificationAccuracy: null })
    expect(() => NexusBenchmark.summarize([sample, { ...sample, policy: "different" }])).toThrow()
    expect(() => NexusBenchmark.summarize([sample, sample])).toThrow("Duplicate")
  }))
})
