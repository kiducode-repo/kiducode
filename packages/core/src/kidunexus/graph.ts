export * as NexusGraph from "./graph.js"

import type { NexusConfig } from "./config.js"
import { NexusSchema } from "./schema.js"
import { KiduNexus } from "@opencode/schema/kidunexus"
import { Schema } from "effect"

export function custom(input: readonly KiduNexus.CustomNode[]) {
  const nodes = Schema.decodeUnknownSync(KiduNexus.CustomNodes)(input).map((assignment) => ({
    ...node(assignment.id, "GENERATE", assignment.role, [...(assignment.dependencies ?? [])]),
    assignment,
  }))
  validate(nodes)
  return nodes
}

export function node(
  id: string,
  phase: NexusSchema.Node["phase"],
  role: NexusSchema.Node["role"],
  dependencies: string[] = [],
): NexusSchema.Node {
  return { id, phase, role, dependencies, status: "pending", attempt: 0, tokens: 0, cost: null, elapsedMs: 0 }
}

export function plan(
  mode: NexusSchema.Report["mode"],
  complexity: "simple" | "moderate" | "complex",
  config: NexusConfig.Resolved,
) {
  if (mode === "standard" || (mode === "adaptive" && complexity === "simple"))
    return [node("synthesis", "SYNTHESIZE", "synthesis", ["classify"])]
  const nodes = [node("decompose", "DECOMPOSE", "orchestrator", ["classify"])]
  if (mode === "adaptive" && complexity === "moderate") {
    nodes.push(node("logical", "GENERATE", "logical", ["decompose"]))
  } else {
    nodes.push(
      node("creative", "GENERATE", "creative", ["decompose"]),
      node("logical", "GENERATE", "logical", ["decompose"]),
    )
    if (mode === "research") nodes.push(node("research", "RESEARCH", "research", ["decompose"]))
  }
  const ideas = nodes.filter((item) => item.phase === "GENERATE" || item.phase === "RESEARCH").map((item) => item.id)
  const candidates = config.crossPollination && ideas.length > 1 ? "exchange" : undefined
  if (candidates) nodes.push(node(candidates, "CROSS_POLLINATE", "creative", ideas))
  const selection = candidates ? [candidates, ...ideas] : ideas
  const debate = mode === "adversarial" || mode === "research" || (mode === "adaptive" && complexity === "complex")
  if (debate) {
    for (let round = 0; round < config.debateRounds; round++) {
      const previous = round === 0 ? selection : [`judge-${round - 1}`]
      nodes.push(node(`pro-${round}`, "DEBATE", "proponent", previous))
      nodes.push(node(`con-${round}`, "DEBATE", "opponent", [...previous, `pro-${round}`]))
      nodes.push(node(`judge-${round}`, "VERIFY", "verification", [...selection, `pro-${round}`, `con-${round}`]))
    }
  }
  const judges = nodes.filter((item) => item.phase === "VERIFY").map((item) => item.id)
  if (config.verification && judges.length === 0) nodes.push(node("verify", "VERIFY", "verification", selection))
  nodes.push(
    node(
      "synthesis",
      "SYNTHESIZE",
      "synthesis",
      nodes.filter((item) => item.id !== "decompose").map((item) => item.id),
    ),
  )
  if (mode === "execute") {
    nodes.push(node("execute", "EXECUTE", "execution", ["synthesis"]))
    nodes.push(node("validate", "VALIDATE", "evaluation", ["execute", "synthesis"]))
  }
  return nodes
}

export function validate(nodes: readonly NexusSchema.Node[]) {
  const ids = new Set(nodes.map((item) => item.id))
  if (ids.size !== nodes.length) throw new Error("Duplicate graph node ID")
  const visited = new Set<string>()
  for (const item of nodes) {
    if (item.dependencies.some((id) => !visited.has(id)))
      throw new Error(`Missing, cyclic, or forward dependency at ${item.id}`)
    visited.add(item.id)
  }
}

export function evidence(report: NexusSchema.Report) {
  const sources = new Map<string, { source: string; nodes: string[]; excerpts: string[] }>()
  const hypotheses = new Map<string, { id: string; text: string; nodes: string[]; sources: string[] }>()
  for (const item of report.nodes) {
    item.result?.evidence.forEach((entry) => {
      const source = entry.source.trim().replace(/#.*$/, "")
      const prior = sources.get(source) ?? { source, nodes: [], excerpts: [] }
      if (!prior.nodes.includes(item.id)) prior.nodes.push(item.id)
      if (!prior.excerpts.includes(entry.excerpt)) prior.excerpts.push(entry.excerpt)
      sources.set(source, prior)
    })
    item.result?.hypotheses.forEach((entry, index) => {
      const key = entry.text.trim().toLowerCase().replace(/\s+/g, " ")
      const prior = hypotheses.get(key) ?? { id: `${item.id}:${index}`, text: entry.text, nodes: [], sources: [] }
      if (!prior.nodes.includes(item.id)) prior.nodes.push(item.id)
      prior.sources = Array.from(new Set([...prior.sources, ...entry.sources]))
      hypotheses.set(key, prior)
    })
  }
  return {
    hypotheses: Array.from(hypotheses.values()),
    evidence: Array.from(sources.values()),
    challenges: report.nodes.flatMap((item) =>
      (item.result?.challenges ?? []).map((entry) => ({ ...entry, node: item.id })),
    ),
    verifications: report.nodes
      .filter((item) => item.phase === "VERIFY" || item.phase === "VALIDATE")
      .flatMap((item) =>
        (item.result?.verifications ?? []).map((entry) => ({ ...entry, node: item.id, independentProof: false })),
      ),
  }
}
