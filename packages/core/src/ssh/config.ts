export * as SshConfig from "./config.js"

import fs from "node:fs"
import path from "node:path"
import { Global } from "@opencode/util/global"
import { openPath } from "@opencode/util/open"

export interface SshServerConfig {
  name: string
  host: string
  port?: number
  username: string
  privateKeyPath?: string
  password?: string
  description?: string
}

export interface SshPublicServerInfo {
  name: string
  host: string
  port: number
  username: string
  description?: string
  hasKey: boolean
  hasPassword: boolean
}

export interface SshConfigFile {
  $schema?: string
  servers: SshServerConfig[]
}

export function getConfigDir(): string {
  return path.join(Global.Path.config, "ssh")
}

export function getConfigFile(): string {
  return path.join(getConfigDir(), "ssh.json")
}

const STARTER_CONFIG: SshConfigFile = {
  $schema: "https://kiducode.com/schemas/ssh.json",
  servers: [
    {
      name: "example-server",
      host: "192.168.1.100",
      port: 22,
      username: "ubuntu",
      privateKeyPath: "~/.ssh/id_ed25519",
      description: "Example remote server (edit or replace with your actual server)",
    },
  ],
}

export function ensureConfigFile(): string {
  const dir = getConfigDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const file = getConfigFile()
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(STARTER_CONFIG, null, 2), "utf-8")
  }
  return file
}

export async function openConfigFolder(): Promise<{ dir: string; file: string }> {
  const file = ensureConfigFile()
  const dir = getConfigDir()
  await openPath(dir)
  return { dir, file }
}

export function readConfig(): SshConfigFile {
  const file = getConfigFile()
  if (!fs.existsSync(file)) {
    return { servers: [] }
  }
  try {
    const raw = fs.readFileSync(file, "utf-8")
    const parsed = JSON.parse(raw) as Partial<SshConfigFile>
    if (!Array.isArray(parsed.servers)) {
      return { servers: [] }
    }
    return {
      $schema: parsed.$schema,
      servers: parsed.servers.filter(
        (s): s is SshServerConfig =>
          typeof s === "object" && s !== null && typeof s.name === "string" && typeof s.host === "string",
      ),
    }
  } catch {
    return { servers: [] }
  }
}

export function listPublicServers(): SshPublicServerInfo[] {
  const config = readConfig()
  return config.servers.map((s) => ({
    name: s.name,
    host: s.host,
    port: s.port ?? 22,
    username: s.username,
    description: s.description,
    hasKey: Boolean(s.privateKeyPath),
    hasPassword: Boolean(s.password),
  }))
}

export function getServer(name: string): SshServerConfig | undefined {
  const config = readConfig()
  return config.servers.find((s) => s.name.toLowerCase() === name.toLowerCase())
}
