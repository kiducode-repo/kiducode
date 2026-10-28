export * as ConfigKiduNexus from "./kidunexus.js"

import { Schema } from "effect"
import { Model } from "../model.js"
import { optional } from "../schema.js"

export const Mode = Schema.Literals(["adaptive", "standard", "collaborative", "adversarial", "research", "execute"])
export const Role = Schema.Literals([
  "orchestrator", "creative", "logical", "research", "skeptic", "proponent", "opponent",
  "verification", "synthesis", "execution", "evaluation",
])

export const Info = Schema.Struct({
  enabled: Schema.Boolean.pipe(optional),
  mode: Mode.pipe(optional),
  max_concurrent_agents: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 })).pipe(optional),
  max_iterations: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 })).pipe(optional),
  max_debate_rounds: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })).pipe(optional),
  max_task_duration_seconds: Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 3600 })).pipe(optional),
  max_total_tokens: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 2_000_000 })).pipe(optional),
  max_estimated_cost_usd: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 })).pipe(optional),
  max_output_tokens: Schema.Int.check(Schema.isBetween({ minimum: 256, maximum: 16000 })).pipe(optional),
  max_worker_steps: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10 })).pipe(optional),
  allow_execution: Schema.Boolean.pipe(optional),
  cross_pollination: Schema.Boolean.pipe(optional),
  independent_verification: Schema.Boolean.pipe(optional),
  role_models: Schema.Struct({
    orchestrator: Model.Ref.pipe(optional),
    creative: Model.Ref.pipe(optional),
    logical: Model.Ref.pipe(optional),
    research: Model.Ref.pipe(optional),
    skeptic: Model.Ref.pipe(optional),
    proponent: Model.Ref.pipe(optional),
    opponent: Model.Ref.pipe(optional),
    verification: Model.Ref.pipe(optional),
    synthesis: Model.Ref.pipe(optional),
    execution: Model.Ref.pipe(optional),
    evaluation: Model.Ref.pipe(optional),
  }).pipe(optional),
  fallback_models: Schema.Array(Model.Ref).check(Schema.isMaxLength(3)).pipe(optional),
}).annotate({ identifier: "Config.KiduNexus" })
export interface Info extends Schema.Schema.Type<typeof Info> {}
