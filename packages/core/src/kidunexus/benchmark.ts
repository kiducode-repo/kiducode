export * as NexusBenchmark from "./benchmark.js"

import { Schema } from "effect"
import { NexusSchema } from "./schema.js"

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export const Sample = Schema.Struct({
  task: Schema.String,
  repetition: Count,
  system: Schema.Literals(["single", "collaborative", "nexus", "no-mindstorm", "no-debate", "no-verification", "no-cross-pollination", "no-adaptive"]),
  // The producer records the same access, ceilings and permissions for every comparison.
  policy: Schema.String,
  revision: Schema.String,
  runtime: Schema.String,
  report: NexusSchema.Report,
  success: Schema.Boolean,
  testsPassed: Count,
  testsTotal: Count,
  supportedClaims: Count,
  unsupportedClaims: Count,
  evaluatedClaims: Count,
  correctVerifications: Count,
  evaluatedVerifications: Count,
  recoveredFailures: Count,
  inducedFailures: Count,
  gradingEvidence: Schema.String.check(Schema.isMinLength(1)),
})
export type Sample = typeof Sample.Type
export const Samples = Schema.Array(Sample)

export function summarize(samples: readonly Sample[]) {
  const policies = new Set(samples.map((sample) => sample.policy))
  if (policies.size > 1) throw new Error("Comparison mixes model access, permissions or budget policies")
  const ids = samples.map((sample) => `${sample.task}:${sample.system}:${sample.repetition}`)
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate benchmark sample")
  for (const sample of samples) {
    if (sample.testsPassed > sample.testsTotal || sample.supportedClaims + sample.unsupportedClaims > sample.evaluatedClaims || sample.correctVerifications > sample.evaluatedVerifications || sample.recoveredFailures > sample.inducedFailures)
      throw new Error("Invalid grading counts")
    if (sample.success && sample.report.state !== "completed") throw new Error("Incomplete workflow cannot count as a success")
  }
  return Array.from(new Set(samples.map((sample) => sample.system))).map((system) => {
    const runs = samples.filter((sample) => sample.system === system)
    const sum = (get: (sample: Sample) => number) => runs.reduce((total, sample) => total + get(sample), 0)
    const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : null
    const successes = sum((sample) => Number(sample.success))
    const cost = runs.some((sample) => sample.report.estimatedCost === null) ? null : sum((sample) => sample.report.estimatedCost ?? 0)
    return {
      system, runs: runs.length, successes,
      successRate: ratio(successes, runs.length),
      testPassRate: ratio(sum((sample) => sample.testsPassed), sum((sample) => sample.testsTotal)),
      evidenceVerificationAccuracy: ratio(sum((sample) => sample.correctVerifications), sum((sample) => sample.evaluatedVerifications)),
      unsupportedClaimRate: ratio(sum((sample) => sample.unsupportedClaims), sum((sample) => sample.evaluatedClaims)),
      costPerSuccess: cost === null ? null : ratio(cost, successes),
      totalTokens: sum((sample) => sample.report.tokens),
      meanLatencyMs: sum((sample) => sample.report.updated - sample.report.started) / runs.length,
      coordinationNodes: sum((sample) => sample.report.nodes.filter((node) => ["CLASSIFY", "DECOMPOSE", "CROSS_POLLINATE", "SYNTHESIZE"].includes(node.phase)).length),
      recoveryRate: ratio(sum((sample) => sample.recoveredFailures), sum((sample) => sample.inducedFailures)),
      tasks: Array.from(new Set(runs.map((sample) => sample.task))),
      revisions: Array.from(new Set(runs.map((sample) => sample.revision))),
    }
  })
}
