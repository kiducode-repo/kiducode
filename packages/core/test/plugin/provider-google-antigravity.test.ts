import { describe, expect, test } from "bun:test"
import {
  antigravityModels,
  accountModels,
  prepareRequest,
  routeModel,
  unwrapEvent,
} from "../../src/plugin/provider/google-antigravity"

describe("Google Antigravity provider", () => {
  test.each([
    ["gemini-3.1-pro-high", "gemini-3.1-pro-low"],
    ["gemini-3.8-flash-high", "gemini-3.8-flash-high"],
    ["gemini-3.8-flash-medium", "gemini-3.8-flash-medium"],
    ["gemini-3.8-flash-low", "gemini-3.8-flash-low"],
    ["claude-sonnet-5-5-high", "claude-sonnet-5-5-high"],
    ["claude-opus-5-5-high", "claude-opus-5-5-high"],
    ["deepseek-v4-flash", "deepseek-v4-flash"],
  ])("routes %s to %s", (input, expected) => {
    expect(routeModel(input)).toBe(expected)
  })

  test("publishes the current Gemini and Claude Antigravity catalog", () => {
    expect(antigravityModels.map((model) => model.id)).toEqual([
      "gemini-3.8-flash-high",
      "gemini-3.8-flash-medium",
      "gemini-3.8-flash-low",
      "gemini-3.1-pro-low",
      "gemini-3.1-pro-high",
      "claude-sonnet-4-6",
      "claude-opus-4-6-thinking",
      "claude-sonnet-5-5-high",
      "claude-opus-5-5-high",
    ])
  })

  test.each(["low", "medium", "high"] as const)("adds Gemini 3.8 %s thinking level", (level) => {
    expect(prepareRequest({ contents: [] }, `gemini-3.8-flash-${level}`)).toEqual({
      contents: [],
      generationConfig: { thinkingConfig: { includeThoughts: true, thinkingLevel: level } },
    })
  })

  test("uses only selectable models returned by the connected account", () => {
    expect(
      accountModels({
        models: {
          "claude-sonnet-4-6": { displayName: "Claude Sonnet 4.6", maxTokens: 200_000 },
          "gemini-3.8-flash-high": { displayName: "Gemini 3.8 Flash (High)", maxTokens: 1_048_576 },
          "gemini-3.8-flash-medium": { displayName: "Gemini 3.8 Flash (Medium)" },
          "internal-completion": { displayName: "Internal" },
        },
        agentModelSorts: [{ groups: [{ modelIds: ["claude-sonnet-4-6", "gemini-3.8-flash-high"] }] }],
      }).map((model) => model.id),
    ).toEqual(["claude-sonnet-4-6", "gemini-3.8-flash-high"])
  })

  test("unwraps gateway SSE responses and supplies the Gemini model role", () => {
    expect(
      unwrapEvent(
        `data: ${JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: "hello" }] } }] } })}`,
      ),
    ).toBe(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "hello" }], role: "model" } }] })}\n\n`)
  })

  test("passes through non-envelope SSE events", () => {
    expect(unwrapEvent("event: ping\ndata: [DONE]")).toBe("event: ping\ndata: [DONE]\n\n")
  })
})
