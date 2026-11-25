export * as RemoteSshTool from "./remote-ssh.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import { ToolFailure } from "@opencode/ai"
import { Effect, Schema } from "effect"
import { Permission } from "../../permission.js"
import { SshConfig } from "../../ssh/config.js"
import { SshClient } from "../../ssh/client.js"

export const name = "remote_ssh"

export const Input = Schema.Struct({
  server: Schema.String.annotate({
    description: "The name/alias of the configured SSH server to execute the command on.",
  }),
  command: Schema.String.annotate({
    description: "The shell command to execute remotely on the server.",
  }),
  timeoutMs: Schema.optionalKey(Schema.Number).annotate({
    description: "Optional timeout in milliseconds (defaults to 60000ms / 1 minute).",
  }),
})

export const Output = Schema.Struct({
  server: Schema.String,
  command: Schema.String,
  exitCode: Schema.Int,
  stdout: Schema.String,
  stderr: Schema.String,
  durationMs: Schema.Number,
})
export type Output = typeof Output.Type

export const toModelContent = (output: Output) => {
  const parts = [
    `[Remote SSH: ${output.server}] Command exited with code ${output.exitCode} (${output.durationMs}ms)`,
  ]
  if (output.stdout) {
    parts.push(`STDOUT:\n${output.stdout}`)
  }
  if (output.stderr) {
    parts.push(`STDERR:\n${output.stderr}`)
  }
  if (!output.stdout && !output.stderr) {
    parts.push("(No output produced)")
  }
  return parts.join("\n\n")
}

export function buildToolDescription(): string {
  const servers = SshConfig.listPublicServers()
  const serverSummary =
    servers.length > 0
      ? `Configured servers:\n${servers
          .map((s) => `- "${s.name}": ${s.username}@${s.host}:${s.port}${s.description ? ` (${s.description})` : ""}`)
          .join("\n")}`
      : "No SSH servers are currently configured in ssh.json. Ask the user to configure servers using /ssh."

  return [
    "Execute a shell command on an added remote SSH server using native OpenSSH.",
    "Credentials and private keys are stored securely on the local machine and are NEVER revealed to the model.",
    "Execution is strictly gated by user permission before any command runs.",
    serverSummary,
  ].join("\n\n")
}

export const Plugin = {
  id: "kiducode.tool.remote_ssh",
  effect: Effect.fn("RemoteSshTool.Plugin")(function* (ctx: Context) {
    const permission = yield* Permission.Service

    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          options: { codemode: false, permission: "remote_ssh" },
          description: buildToolDescription(),
          input: Input,
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              const server = SshConfig.getServer(input.server)
              if (!server) {
                const available = SshConfig.listPublicServers().map((s) => `"${s.name}"`)
                const hint =
                  available.length > 0
                    ? `Available servers are: ${available.join(", ")}.`
                    : "No servers are configured yet. The user can type /ssh in KiduCode to add servers."
                return yield* new ToolFailure({
                  message: `Unknown SSH server "${input.server}". ${hint}`,
                })
              }

              const source = {
                type: "tool" as const,
                messageID: context.messageID,
                id: context.id,
              }

              yield* permission.assert({
                action: "remote_ssh",
                resources: [`${server.name}: ${input.command}`],
                save: [`${server.name}:*`],
                metadata: {
                  server: server.name,
                  host: server.host,
                  user: server.username,
                  command: input.command,
                },
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })

              const result = yield* Effect.promise(() =>
                SshClient.executeRemoteCommand(server, input.command, { timeoutMs: input.timeoutMs }),
              )

              const output: Output = {
                server: server.name,
                command: input.command,
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
                durationMs: result.durationMs,
              }

              return output
            }).pipe(
              Effect.map((output) => ({ output, content: toModelContent(output) })),
              Effect.mapError((error) =>
                error instanceof ToolFailure
                  ? error
                  : new ToolFailure({ message: `SSH execution error on ${input.server}`, error }),
              ),
            ),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
