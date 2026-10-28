import { describe, expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { SshConfig } from "../src/ssh/config"
import { SshClient } from "../src/ssh/client"

describe("SshConfig", () => {
  test("generates and resolves config directory and file", () => {
    const dir = SshConfig.getConfigDir()
    const file = SshConfig.getConfigFile()
    expect(dir).toContain("ssh")
    expect(file).toContain("ssh.json")
    expect(file.endsWith("ssh.json")).toBe(true)
  })

  test("masks sensitive fields in listPublicServers", () => {
    const publicServers = SshConfig.listPublicServers()
    for (const server of publicServers) {
      expect((server as any).password).toBeUndefined()
      expect((server as any).privateKeyPath).toBeUndefined()
      expect(typeof server.name).toBe("string")
      expect(typeof server.host).toBe("string")
      expect(typeof server.port).toBe("number")
      expect(typeof server.hasKey).toBe("boolean")
    }
  })
})

describe("SshClient", () => {
  test("builds correct OpenSSH arguments with port, key, and options", () => {
    const server = {
      name: "prod-api",
      host: "10.0.0.1",
      port: 2222,
      username: "deploy",
      privateKeyPath: "~/.ssh/custom_key",
      description: "Production API",
    }
    const args = SshClient.buildSshArgs(server, "uptime")

    expect(args).toContain("-p")
    expect(args).toContain("2222")
    expect(args).toContain("-o")
    expect(args).toContain("BatchMode=yes")
    expect(args).toContain("StrictHostKeyChecking=accept-new")
    expect(args).toContain("-i")
    expect(args).toContain(path.join(os.homedir(), ".ssh/custom_key"))
    expect(args).toContain("deploy@10.0.0.1")
    expect(args).toContain("uptime")
  })

  test("builds correct OpenSSH arguments with default port 22", () => {
    const server = {
      name: "staging",
      host: "staging.local",
      username: "ubuntu",
    }
    const args = SshClient.buildSshArgs(server, "whoami")

    expect(args).toContain("-p")
    expect(args).toContain("22")
    expect(args).not.toContain("-i")
    expect(args).toContain("ubuntu@staging.local")
    expect(args).toContain("whoami")
  })

  test("detects puttygen executable if available on system", () => {
    const puttygen = SshClient.findPuttygenExecutable()
    if (puttygen) {
      expect(typeof puttygen).toBe("string")
      expect(puttygen.toLowerCase()).toContain("puttygen")
    }
  })

  test("returns friendly error when ppk key file does not exist", () => {
    const server = {
      name: "staging",
      host: "staging.local",
      username: "ubuntu",
      privateKeyPath: "~/non_existent_key.ppk",
    }
    const res = SshClient.resolveEffectiveKeyPath(server)
    expect(res.error).toBeDefined()
    expect(res.error).toContain("Private key file not found")
  })
})

describe("RemoteSshTool", () => {
  test("formats model content with duration and streams", async () => {
    const { RemoteSshTool } = await import("../src/tool/plugin/remote-ssh")
    const formatted = RemoteSshTool.toModelContent({
      server: "prod-server",
      command: "uname -a",
      exitCode: 0,
      stdout: "Linux ubuntu 5.15.0",
      stderr: "",
      durationMs: 142,
    })
    expect(formatted).toContain("[Remote SSH: prod-server] Command exited with code 0 (142ms)")
    expect(formatted).toContain("STDOUT:\nLinux ubuntu 5.15.0")
  })

  test("generates informative description with privacy reminder", async () => {
    const { RemoteSshTool } = await import("../src/tool/plugin/remote-ssh")
    const desc = RemoteSshTool.buildToolDescription()
    expect(desc).toContain("Execute a shell command on an added remote SSH server")
    expect(desc).toContain("NEVER revealed to the model")
  })
})

