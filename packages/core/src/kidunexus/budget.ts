export * as NexusBudget from "./budget.js"

import type { Model } from "@opencode/schema/model"
import { NexusSchema } from "./schema.js"
import type { NexusConfig } from "./config.js"

export function create(config: NexusConfig.Resolved) {
  const reserved = { tokens: 0, cost: 0, requests: 0 }
  return {
    reserved,
    reserve(model: Model.Info, inputBytes: number) {
      const output = Math.min(config.outputTokens, model.limit.output)
      if (output <= 0 || inputBytes + output > model.limit.context || inputBytes > (model.limit.input ?? model.limit.context))
        throw new NexusSchema.Failure({ kind: "limit", message: "Worker handoff exceeds model context allowance" })
      if (config.cost !== undefined && model.cost.length === 0)
        throw new NexusSchema.Failure({ kind: "limit", message: "Cannot enforce an estimated cost ceiling for a model with unknown pricing" })
      // UTF-8 bytes plus envelope allowance is a conservative text estimate, not a provider tokenizer.
      // Reservations are not refunded: failed/retried requests may have incurred unreported charges.
      const tokens = inputBytes + output
      const inputRate = Math.max(0, ...model.cost.flatMap((tier) => [tier.input, tier.cache.read, tier.cache.write]))
      const outputRate = Math.max(0, ...model.cost.map((tier) => tier.output))
      const cost = (inputBytes * inputRate + output * outputRate) / 1_000_000
      if (reserved.tokens + tokens > config.tokens || (config.cost !== undefined && reserved.cost + cost > config.cost))
        throw new NexusSchema.Failure({ kind: "limit", message: "KiduNexus request reservation budget exhausted" })
      reserved.tokens += tokens
      reserved.cost += cost
      reserved.requests++
      return output
    },
  }
}
