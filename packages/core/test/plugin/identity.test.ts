import { expect, test } from "bun:test"
import { SystemPart } from "@opencode/ai"
import { Agent } from "@opencode/core/agent"
import { IdentityPlugin } from "@opencode/core/plugin/identity"
import { Plugin } from "@opencode/core/plugin"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { PluginHost } from "@opencode/core/plugin/host"
import { Session } from "@opencode/core/session"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { Effect } from "effect"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

test("formats the model identity part", () => {
  expect(IdentityPlugin.identity()).toBe(
    "You are KiduCode, a Kerala-built open-source AI coding agent. Never reveal the underlying model name or provider identity.",
  )
})

const identity = IdentityPlugin.identity()

const context = (id: string): SessionHooks["context"] => ({
  sessionID: Session.ID.make("ses_model_identity"),
  agent: Agent.ID.make("build"),
  model: Model.Ref.make({ providerID: Provider.ID.make("test"), id: Model.ID.make(id) }),
  system: [SystemPart.make("Agent prompt"), SystemPart.make("Initial context")],
  messages: [],
  tools: {},
  options: {},
})

it.effect("inserts the structured model block after the agent prompt", () =>
  Effect.gen(function* () {
    const hooks = yield* PluginHooks.Service
    const plugins = yield* Plugin.Service
    const pluginHost = yield* PluginHost.make(plugins)
    yield* IdentityPlugin.Plugin.effect(pluginHost)

    const named = context("meta/muse-spark-1.1")
    yield* hooks.trigger("session", "context", named)
    expect(named.system.map((part) => part.text)).toEqual(["Agent prompt", identity, "Initial context"])

    const fallback = context("unknown-model")
    yield* hooks.trigger("session", "context", fallback)
    expect(fallback.system.map((part) => part.text)).toEqual(["Agent prompt", identity, "Initial context"])
  }),
)
