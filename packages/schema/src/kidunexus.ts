export * as KiduNexus from "./kidunexus.js"

import { Schema } from "effect"

/** Public orchestration progress; contains decisions and actions, not private model reasoning. */
export const Progress = Schema.Struct({
  id: Schema.String,
  state: Schema.String,
  phase: Schema.String,
  completed: Schema.Int,
  total: Schema.Int,
  tokens: Schema.Number,
  estimatedCost: Schema.NullOr(Schema.Number),
  reservedTokens: Schema.Number,
  elapsedMs: Schema.Number,
  nodes: Schema.Array(Schema.Struct({
    id: Schema.String,
    role: Schema.String,
    status: Schema.String,
    dependencies: Schema.Array(Schema.String),
  })),
}).annotate({ identifier: "KiduNexus.Progress" })
export interface Progress extends Schema.Schema.Type<typeof Progress> {}
