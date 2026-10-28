export * as NexusSchema from "./schema.js"

import { Schema } from "effect"
import { ConfigKiduNexus } from "@opencode/schema/config/kidunexus"

const Text = Schema.String.check(Schema.isMaxLength(12000))
const Short = Schema.String.check(Schema.isMaxLength(2000))
export const Phase = Schema.Literals([
  "CLASSIFY", "DECOMPOSE", "GENERATE", "RESEARCH", "CROSS_POLLINATE", "CRITIQUE", "DEBATE",
  "VERIFY", "SYNTHESIZE", "EXECUTE", "VALIDATE", "REVISE",
])
export const Status = Schema.Literals(["pending", "running", "completed", "failed", "cancelled", "skipped"])
export const Verdict = Schema.Literals(["supported", "refuted", "partial", "inconclusive", "needs_evidence"])

// This is a public findings envelope, never a request for private chain-of-thought.
export const Findings = Schema.Struct({
  summary: Text,
  complexity: Schema.optionalKey(Schema.Literals(["simple", "moderate", "complex"])),
  hypotheses: Schema.Array(Schema.Struct({ text: Short, sources: Schema.Array(Short).check(Schema.isMaxLength(10)) })).check(Schema.isMaxLength(8)),
  evidence: Schema.Array(Schema.Struct({ source: Short, excerpt: Short })).check(Schema.isMaxLength(16)),
  challenges: Schema.Array(Schema.Struct({ target: Short, reason: Short })).check(Schema.isMaxLength(12)),
  verifications: Schema.Array(Schema.Struct({ target: Short, verdict: Verdict, reason: Short, sources: Schema.Array(Short).check(Schema.isMaxLength(10)) })).check(Schema.isMaxLength(12)),
  unresolved: Schema.Array(Short).check(Schema.isMaxLength(12)),
  next: Schema.optionalKey(Schema.Literals(["complete", "revise"])),
})
export type Findings = typeof Findings.Type

export const Node = Schema.Struct({
  id: Schema.String,
  phase: Phase,
  role: ConfigKiduNexus.Role,
  dependencies: Schema.Array(Schema.String),
  status: Status,
  attempt: Schema.Int,
  sessionID: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  result: Schema.optionalKey(Findings),
  error: Schema.optionalKey(Schema.String),
  tokens: Schema.Number,
  cost: Schema.NullOr(Schema.Number),
  elapsedMs: Schema.Number,
})
export type Node = typeof Node.Type

export const Report = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.String,
  parentID: Schema.String,
  task: Text,
  mode: ConfigKiduNexus.Mode,
  state: Schema.Literals(["running", "completed", "failed", "cancelled", "limited"]),
  started: Schema.Number,
  updated: Schema.Number,
  nodes: Schema.Array(Node),
  conclusion: Text,
  unresolved: Schema.Array(Short),
  tokens: Schema.Number,
  estimatedCost: Schema.NullOr(Schema.Number),
  reason: Schema.optionalKey(Schema.String),
})
export type Report = typeof Report.Type

export class Failure extends Schema.TaggedError<Failure>()("Nexus.Failure", {
  message: Schema.String,
  kind: Schema.Literals(["worker", "limit", "invalid", "permission"]),
}) {}
