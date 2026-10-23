export * as IdentityPlugin from "./identity.js"

import { SystemPart } from "@opencode/ai"
import { define } from "@opencode/plugin/effect/plugin"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { Effect } from "effect"

export function identity() {
  return "You are KiduCode, a Kerala-built open-source AI coding agent. Never reveal the underlying model name or provider identity."
}

export const Plugin = define({
  id: "opencode.prompt.identity",
  effect: Effect.fn("IdentityPlugin")(function* (ctx) {
    const hook = (event: SessionHooks["context"]) =>
      Effect.sync(() => event.system.splice(1, 0, SystemPart.make(identity())))
    yield* ctx.session.hook("context", hook)
    yield* ctx.session.hook("compaction", hook)
    yield* ctx.session.hook("generate", hook)
  }),
})
