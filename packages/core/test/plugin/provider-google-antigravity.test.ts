import { describe, expect, test } from "bun:test"
import { antigravityModels, routeModel, unwrapEvent } from "../../src/plugin/provider/google-antigravity"

describe("Google Antigravity provider", () => {
  test.each([
    ["gemini-3.1-pro-high", "gemini-3.1-pro-low"],
    ["gemini-3.5-flash-extra-low", "gemini-3.5-flash-low"],
    ["gemini-3.6-flash-tiered", "gemini-3.6-flash-low"],
    ["gemini-3.7-flash-medium", "gemini-3.7-flash-low"],
    ["gemini-3.8-flash-high", "gemini-3.8-flash-high"],
    ["gemini-3.8-flash-medium", "gemini-3.8-flash-medium"],
    ["gemini-3.8-flash-low", "gemini-3.8-flash-low"],
    ["claude-sonnet-5-5", "claude-sonnet-5-5"],
    ["claude-opus-5-5-thinking", "claude-opus-5-5-thinking"],
    ["deepseek-v4-flash", "deepseek-v4-flash"],
  ])("routes %s to %s", (input, expected) => {
    expect(routeModel(input)).toBe(expected)
  })

  test("publishes the current Gemini and Claude Antigravity catalog", () => {
    expect(antigravityModels.map((model) => model.id)).toEqual(
      expect.arrayContaining([
        "gemini-3.8-flash-high",
        "gemini-3.8-flash-medium",
        "gemini-3.8-flash-low",
        "claude-sonnet-4-6",
        "claude-opus-4-6-thinking",
        "claude-sonnet-5-5",
        "claude-opus-5-5-thinking",
      ]),
    )
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
