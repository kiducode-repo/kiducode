for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith("KIDUCODE_") || value === undefined) continue
  const legacy = `OPENCODE_${name.slice("KIDUCODE_".length)}`
  process.env[legacy] ??= value
}

process.env.KIDUCODE = "1"
process.env.OPENCODE = "1"
process.env.KIDUCODE_PID = String(process.pid)
process.env.OPENCODE_PID = String(process.pid)
