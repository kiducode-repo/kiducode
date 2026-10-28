export * as NexusConfig from "./config.js"

import { ConfigKiduNexus } from "@opencode/schema/config/kidunexus"
import type { Model } from "@opencode/schema/model"

export function resolve(entries: readonly ConfigKiduNexus.Info[]) {
  const minimum = (key: "max_concurrent_agents" | "max_iterations" | "max_debate_rounds" | "max_task_duration_seconds" | "max_total_tokens" | "max_output_tokens" | "max_worker_steps", fallback: number) =>
    entries.some((entry) => entry[key] !== undefined)
      ? entries.reduce((limit, entry) => entry[key] === undefined ? limit : Math.min(limit, entry[key]), Infinity)
      : fallback
  const models = entries.reduce<Partial<Record<typeof ConfigKiduNexus.Role.Type, Model.Ref>>>((roles, entry) => Object.assign(roles, entry.role_models), {})
  return {
    enabled: entries.some((entry) => entry.enabled === true) && !entries.some((entry) => entry.enabled === false),
    mode: entries.findLast((entry) => entry.mode)?.mode ?? "adaptive",
    concurrency: minimum("max_concurrent_agents", 4),
    iterations: minimum("max_iterations", 2),
    debateRounds: minimum("max_debate_rounds", 2),
    durationMs: minimum("max_task_duration_seconds", 600) * 1000,
    tokens: minimum("max_total_tokens", 100_000),
    outputTokens: minimum("max_output_tokens", 2048),
    steps: minimum("max_worker_steps", 4),
    cost: entries.reduce<number | undefined>((limit, entry) => entry.max_estimated_cost_usd === undefined ? limit : Math.min(limit ?? Infinity, entry.max_estimated_cost_usd), undefined),
    execution: entries.some((entry) => entry.allow_execution === true) && !entries.some((entry) => entry.allow_execution === false),
    crossPollination: !entries.some((entry) => entry.cross_pollination === false),
    verification: !entries.some((entry) => entry.independent_verification === false),
    models,
    fallbacks: entries.findLast((entry) => entry.fallback_models)?.fallback_models ?? [],
  }
}
export type Resolved = ReturnType<typeof resolve>
