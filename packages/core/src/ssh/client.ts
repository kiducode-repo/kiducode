export * as SshClient from "./client.js"

import { execFileSync, spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { SshConfig, type SshServerConfig } from "./config.js"

export interface SshExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

export function findPuttygenExecutable(): string | undefined {
  if (process.platform === "win32") {
    const commonPaths = [
      "puttygen.exe",
      "puttygen",
      path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "PuTTY", "puttygen.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "PuTTY", "puttygen.exe"),
    ]
    for (const p of commonPaths) {
      if (fs.existsSync(p)) return p
    }
    try {
      const out = execFileSync("where.exe", ["puttygen"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim()
      const first = out.split(/\r?\n/)[0]?.trim()
      if (first && fs.existsSync(first)) return first
    } catch {
      // not in PATH
    }
  } else {
    try {
      const out = execFileSync("which", ["puttygen"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim()
      if (out && fs.existsSync(out)) return out
    } catch {
      // not in PATH
    }
  }
  return undefined
}

export function resolveEffectiveKeyPath(server: SshServerConfig): { keyPath?: string; error?: string } {
  if (!server.privateKeyPath) return {}
  const rawPath = server.privateKeyPath.startsWith("~")
    ? path.join(os.homedir(), server.privateKeyPath.slice(1))
    : path.resolve(server.privateKeyPath)

  if (!fs.existsSync(rawPath)) {
    return { error: `Private key file not found: "${rawPath}"` }
  }

  if (rawPath.toLowerCase().endsWith(".ppk")) {
    const convertedDir = path.join(SshConfig.getConfigDir(), "converted")
    if (!fs.existsSync(convertedDir)) {
      fs.mkdirSync(convertedDir, { recursive: true })
    }
    const safeServerName = server.name.replace(/[^a-zA-Z0-9_-]/g, "_")
    const convertedDst = path.join(convertedDir, `${safeServerName}.pem`)

    // Check if already converted and newer than source
    if (fs.existsSync(convertedDst)) {
      try {
        const srcStat = fs.statSync(rawPath)
        const dstStat = fs.statSync(convertedDst)
        if (dstStat.mtimeMs >= srcStat.mtimeMs) {
          return { keyPath: convertedDst }
        }
      } catch {
        // re-convert below
      }
    }

    // Try auto-conversion with puttygen if available
    const puttygen = findPuttygenExecutable()
    if (puttygen) {
      try {
        const res = spawnSync(puttygen, [rawPath, "-O", "private-openssh", "-o", convertedDst], {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 10_000,
        })
        if (res.status === 0 && fs.existsSync(convertedDst)) {
          if (process.platform !== "win32") {
            try {
              fs.chmodSync(convertedDst, 0o600)
            } catch {
              // ignore chmod error
            }
          }
          return { keyPath: convertedDst }
        }
      } catch {
        // conversion error, fall through
      }
    }

    return {
      error: `PuTTY .ppk key format detected for server "${server.name}" (${path.basename(rawPath)}). OpenSSH requires OpenSSH/PEM format. In PuTTYgen: Conversions → Export OpenSSH key to convert it to a .pem file.`,
    }
  }

  return { keyPath: rawPath }
}

function resolveRawKeyPath(keyPath: string): string {
  if (keyPath.startsWith("~")) {
    return path.join(os.homedir(), keyPath.slice(1))
  }
  return path.resolve(keyPath)
}

function getSshExecutable(): string {
  return process.platform === "win32" ? "ssh.exe" : "ssh"
}

export function buildSshArgs(
  server: SshServerConfig,
  remoteCommand: string,
  options: { connectTimeout?: number; resolvedKeyPath?: string } = {},
): string[] {
  const timeout = options.connectTimeout ?? 10
  const args: string[] = [
    "-p",
    String(server.port ?? 22),
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    `ConnectTimeout=${timeout}`,
  ]

  const key = options.resolvedKeyPath ?? (server.privateKeyPath ? resolveRawKeyPath(server.privateKeyPath) : undefined)
  if (key) {
    args.push("-i", key)
  }

  args.push(`${server.username}@${server.host}`, remoteCommand)
  return args
}

export function executeRemoteCommand(
  server: SshServerConfig,
  command: string,
  options: { timeoutMs?: number } = {},
): Promise<SshExecutionResult> {
  const keyResolution = resolveEffectiveKeyPath(server)
  if (keyResolution.error) {
    return Promise.resolve({
      stdout: "",
      stderr: keyResolution.error,
      exitCode: 1,
      durationMs: 0,
    })
  }

  const timeoutMs = options.timeoutMs ?? 60_000
  const executable = getSshExecutable()
  const args = buildSshArgs(server, command, { resolvedKeyPath: keyResolution.keyPath })
  const startTime = Date.now()

  return new Promise((resolve) => {
    let stdout = ""
    let stderr = ""
    let timedOut = false

    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, timeoutMs)

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8")
    })

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8")
    })

    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({
        stdout,
        stderr: stderr ? `${stderr}\n${err.message}` : err.message,
        exitCode: 1,
        durationMs: Date.now() - startTime,
      })
    })

    child.on("close", (code) => {
      clearTimeout(timer)
      if (timedOut) {
        stderr += `\nCommand timed out after ${timeoutMs}ms`
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: timedOut ? 124 : (code ?? 0),
        durationMs: Date.now() - startTime,
      })
    })
  })
}

export async function testConnection(server: SshServerConfig): Promise<{ success: boolean; message: string }> {
  const keyResolution = resolveEffectiveKeyPath(server)
  if (keyResolution.error) {
    return { success: false, message: keyResolution.error }
  }

  const executable = getSshExecutable()
  const args = buildSshArgs(server, "exit 0", { connectTimeout: 5, resolvedKeyPath: keyResolution.keyPath })

  return new Promise((resolve) => {
    let stderr = ""
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })

    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      resolve({ success: false, message: "Connection timed out (5s)" })
    }, 6_000)

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8")
    })

    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ success: false, message: err.message })
    })

    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ success: true, message: `Connected to ${server.username}@${server.host}:${server.port ?? 22}` })
      } else {
        const msg = stderr.trim() || `SSH exited with code ${code}`
        resolve({ success: false, message: msg })
      }
    })
  })
}
