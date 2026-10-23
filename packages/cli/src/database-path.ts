import path from "node:path"
import { existsSync } from "node:fs"
import { OPENCODE_CHANNEL } from "./version"

export function databasePath(data: string) {
  const configured = process.env.KIDUCODE_DB ?? process.env.OPENCODE_DB
  const channel = OPENCODE_CHANNEL.replace(/[^a-zA-Z0-9._-]/g, "-")
  const unversioned =
    ["latest", "dev", "beta", "next", "prod"].includes(OPENCODE_CHANNEL) ||
    process.env.OPENCODE_DISABLE_CHANNEL_DB === "1" ||
    process.env.OPENCODE_DISABLE_CHANNEL_DB === "true"
  const filename = configured ?? (unversioned ? "kiducode.db" : `kiducode-${channel}.db`)
  if (filename === ":memory:") return filename
  const target = path.resolve(data, filename)
  if (configured || existsSync(target)) return target
  const legacy = path.resolve(data, "..", "opencode", unversioned ? "opencode.db" : `opencode-${channel}.db`)
  return existsSync(legacy) ? legacy : target
}
