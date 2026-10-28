export * as NexusPolicy from "./policy.js"

import type { NexusSchema } from "./schema.js"

const reasoning = new Set(["read", "glob", "grep", "webfetch", "websearch"])
const execution = new Set([...reasoning, "edit", "write", "patch", "shell"])
const validation = new Set([...reasoning, "shell"])

export function allows(role: NexusSchema.Node["role"], tool: string) {
  return (role === "execution" ? execution : role === "evaluation" ? validation : reasoning).has(tool)
}

export function action(tool: string) {
  return tool === "write" || tool === "patch" ? "edit" : tool
}

export function mutates(tool: string) {
  return ["edit", "write", "patch", "shell"].includes(tool)
}
