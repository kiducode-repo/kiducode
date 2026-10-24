import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { ServerFetch } from "../src/fetch"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"

const options = {
  app: { version: "test-version" },
  database: { path: ":memory:" },
  config: { project: false },
  models: { fetch: false },
  fs: { filewatcher: false },
} as const

it.live("serves the legacy Cloud Console runner contract", () =>
  Effect.gen(function* () {
    const temp = yield* Effect.acquireDisposable(Effect.promise(() => tmpdir("kiducode-cloud-console-")))
    const directory = path.join(temp.path, "project")
    yield* Effect.promise(() => fs.mkdir(directory))
    const handler = yield* ServerFetch.make(options)

    const health = yield* Effect.promise(() => handler(new Request("http://kiducode.local/global/health")))
    expect(health.status).toBe(200)
    expect(yield* Effect.promise(() => health.json())).toEqual({ healthy: true, version: "unknown" })

    const created = yield* Effect.promise(() =>
      handler(
        new Request("http://kiducode.local/session", {
          method: "POST",
          headers: { "content-type": "application/json", "x-opencode-directory": directory },
          body: JSON.stringify({ title: "Cloud task" }),
        }),
      ),
    )
    expect(created.status).toBe(200)
    const session = (yield* Effect.promise(() => created.json())) as { id: string; directory: string }
    expect(session.id).toStartWith("ses_")
    expect(session.directory).toBe(directory)

    const messages = yield* Effect.promise(() =>
      handler(new Request(`http://kiducode.local/session/${session.id}/message`)),
    )
    expect(messages.status).toBe(200)
    expect(yield* Effect.promise(() => messages.json())).toEqual([])

    const status = yield* Effect.promise(() => handler(new Request("http://kiducode.local/session/status")))
    expect(status.status).toBe(200)
    expect(yield* Effect.promise(() => status.json())).toEqual({})

    const aborted = yield* Effect.promise(() =>
      handler(new Request(`http://kiducode.local/session/${session.id}/abort`, { method: "POST" })),
    )
    expect(aborted.status).toBe(200)
    expect(yield* Effect.promise(() => aborted.json())).toBe(false)
  }),
)
