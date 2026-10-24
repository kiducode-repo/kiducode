import { fileURLToPath } from "node:url"

const child = Bun.spawn([process.execPath, "run", "src/index.ts", ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL("../../cli/", import.meta.url)),
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
})

const forward = (signal: NodeJS.Signals) => child.kill(signal)
process.on("SIGINT", forward)
process.on("SIGTERM", forward)
process.exitCode = await child.exited
