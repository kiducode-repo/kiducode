import { Effect } from "effect"
import { PluginV2 } from "../../plugin"
import { ProviderV2 } from "../../provider"
import { ModelV2 } from "../../model"

const MODELS = [
  { id: "gemini-3.5-flash-medium", name: "Gemini 3.5 Flash (Medium)", input: ["text", "image", "audio", "video", "pdf"] },
  { id: "gemini-3.5-flash-high", name: "Gemini 3.5 Flash (High)", input: ["text", "image", "audio", "video", "pdf"] },
  { id: "gemini-3.5-flash-low", name: "Gemini 3.5 Flash (Low)", input: ["text", "image", "audio", "video", "pdf"] },
  { id: "gemini-3.1-pro-low", name: "Gemini 3.1 Pro (Low)", input: ["text", "image", "audio", "video", "pdf"] },
  { id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro (High)", input: ["text", "image", "audio", "video", "pdf"] },
  { id: "claude-sonnet-4.6-thinking", name: "Claude Sonnet 4.6 (Thinking)", input: ["text", "image", "pdf"] },
  { id: "claude-opus-4.6-thinking", name: "Claude Opus 4.6 (Thinking)", input: ["text", "image", "pdf"] },
  { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)", input: ["text"] },
]

export const GoogleAntigravityPlugin = PluginV2.define({
  id: PluginV2.ID.make("google-antigravity"),
  effect: Effect.gen(function* () {
    return {
      "aisdk.sdk": Effect.fn(function* (evt) {
        if (evt.package !== "@ai-sdk/openai" || evt.model.providerID !== ProviderV2.ID.make("google-antigravity")) return
        const mod = yield* Effect.promise(() => import("@ai-sdk/openai"))
        evt.sdk = mod.createOpenAI(evt.options)
      }),
      "aisdk.language": Effect.fn(function* (evt) {
        if (evt.model.providerID !== ProviderV2.ID.make("google-antigravity")) return
        evt.language = evt.sdk.chat(evt.model.apiID)
      }),
      "catalog.transform": Effect.fn(function* (evt) {
        evt.provider.update(ProviderV2.ID.make("google-antigravity"), (draft) => {
          draft.name = "Google Antigravity"
          draft.endpoint = {
            type: "aisdk",
            package: "@ai-sdk/openai",
            url: "https://antigravity.google/api/v1",
          }
        })

        for (const model of MODELS) {
          evt.model.update(ProviderV2.ID.make("google-antigravity"), ModelV2.ID.make(model.id), (draft) => {
            draft.name = model.name
            draft.capabilities.input = model.input
            draft.capabilities.output = ["text"]
          })
        }
      }),
    }
  }),
})
