import { describe, expect, test } from "bun:test"
import { ManglishPreprocess } from "@/manglish-preprocess/preprocess"

describe("ManglishPreprocess", () => {
  test("normalizes GenZ chat Manglish UI polish requests", () => {
    const result = ManglishPreprocess.preprocessManglishPrompt("bro navbar sticky aakki mobile ilum set aakkanam")

    expect(result.changed).toBe(true)
    expect(result.style).toBe("genz_manglish")
    expect(result.intent).toBe("ui_polish")
    expect(result.instruction).toBe("Make the navbar sticky and ensure it works well on mobile screens.")
    expect(result.signals).toContain("genz_chat")
  })

  test("normalizes plain Manglish feature creation requests", () => {
    const result = ManglishPreprocess.preprocessManglishPrompt("oru login page undakku")

    expect(result.changed).toBe(true)
    expect(result.style).toBe("plain_manglish")
    expect(result.intent).toBe("feature_creation")
    expect(result.instruction).toBe("Create a login page.")
  })

  test("normalizes coding-specific backend requests", () => {
    const result = ManglishPreprocess.preprocessManglishPrompt("backend il jwt auth add cheyyu")

    expect(result.changed).toBe(true)
    expect(result.intent).toBe("auth_flow")
    expect(result.instruction).toBe("Add JWT authentication to the backend.")
  })

  test("normalizes UI interaction requests", () => {
    const result = ManglishPreprocess.preprocessManglishPrompt("button click cheythal modal open aavanam")

    expect(result.changed).toBe(true)
    expect(result.intent).toBe("ui_interaction")
    expect(result.instruction).toBe("Update the button click handler so modal opens when clicked.")
  })

  test("keeps ordinary English prompts unchanged", () => {
    const result = ManglishPreprocess.preprocessManglishPrompt("Create a login page")

    expect(result.changed).toBe(false)
    expect(result.style).toBe("english")
    expect(ManglishPreprocess.formatForAgent(result)).toBe("Create a login page")
  })

  test("detects casual Manglish greetings without rewriting them as coding tasks", () => {
    const plain = ManglishPreprocess.preprocessManglishPrompt("sugamano")
    const genz = ManglishPreprocess.preprocessManglishPrompt("sugamano bro")

    expect(plain.changed).toBe(false)
    expect(plain.style).toBe("plain_manglish")
    expect(plain.intent).toBe("unknown")
    expect(ManglishPreprocess.formatForAgent(plain)).toBe("sugamano")

    expect(genz.changed).toBe(false)
    expect(genz.style).toBe("genz_manglish")
    expect(genz.intent).toBe("unknown")
  })

  test("formats changed prompts with original and normalized instruction", () => {
    const result = ManglishPreprocess.preprocessManglishPrompt("ee bug fix cheyyu")

    expect(ManglishPreprocess.formatForAgent(result)).toBe(
      [
        "Original user prompt:",
        "ee bug fix cheyyu",
        "",
        "Normalized developer instruction:",
        "Investigate and fix the reported bug.",
      ].join("\n"),
    )
  })
})
