export * as KiduNexus from "./kidunexus.js"

import { Schema } from "effect"
import { Model } from "./model.js"
import { optional } from "./schema.js"

export const CustomNode = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/)),
  role: Schema.Literals([
    "creative",
    "logical",
    "research",
    "skeptic",
    "proponent",
    "opponent",
    "verification",
    "synthesis",
  ]),
  model: Model.Ref.pipe(optional),
  task: Schema.String.check(Schema.isMaxLength(4000)).pipe(optional),
  dependencies: Schema.Array(Schema.String).check(Schema.isMaxLength(3)).pipe(optional),
}).annotate({ identifier: "KiduNexus.CustomNode" })
export interface CustomNode extends Schema.Schema.Type<typeof CustomNode> {}
export const CustomNodes = Schema.Array(CustomNode)
  .check(Schema.isMinLength(2), Schema.isMaxLength(4))
  .annotate({ identifier: "KiduNexus.CustomNodes" })

export const JudgeInput = Schema.Struct({
  id: Schema.String,
  action: Schema.Literals(["question", "revise", "verdict", "cancel"]),
  target: Schema.String.pipe(optional),
  feedback: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(12000)),
}).annotate({ identifier: "KiduNexus.JudgeInput" })
export interface JudgeInput extends Schema.Schema.Type<typeof JudgeInput> {}

export const Worker = Schema.Struct({
  runID: Schema.String,
  nodeID: Schema.String,
  role: Schema.String,
  parentID: Schema.String,
  pane: Schema.Boolean.pipe(optional),
}).annotate({ identifier: "KiduNexus.Worker" })
export interface Worker extends Schema.Schema.Type<typeof Worker> {}

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
  interactive: Schema.Boolean.pipe(optional),
  nodes: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      role: Schema.String,
      status: Schema.String,
      dependencies: Schema.Array(Schema.String),
      sessionID: Schema.String.pipe(optional),
      model: Schema.String.pipe(optional),
    }),
  ),
}).annotate({ identifier: "KiduNexus.Progress" })
export interface Progress extends Schema.Schema.Type<typeof Progress> {}
