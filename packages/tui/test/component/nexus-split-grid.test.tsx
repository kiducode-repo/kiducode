/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import { NexusSplitGrid, type NexusPane } from "../../src/component/nexus-split-grid"
import { NexusJudgeBar } from "../../src/component/nexus-judge-bar"

for (const count of [2, 3, 4]) {
  for (const width of [44, 100]) {
    test(`${count} Nexus panes stream at terminal width ${width}`, async () => {
      const [panes, setPanes] = createSignal<NexusPane[]>(
        Array.from({ length: count }, (_, index) => ({
          id: `agent${index + 1}`,
          sessionID: `child${index + 1}`,
          role: "creative",
          model: "test/model",
          status: "running",
          tokens: 10,
          text: `Public proposal ${index + 1}`,
        })),
      )
      const app = await testRender(() => <NexusSplitGrid panes={panes()} width={width} height={32} />, {
        width,
        height: 34,
      })
      try {
        await app.renderOnce()
        const lines = app.captureCharFrame().split("\n")
        expect(app.captureCharFrame()).toContain("agent1")
        const first = lines.findIndex((line) => line.includes("agent1"))
        const second = lines.findIndex((line) => line.includes("agent2"))
        expect(first).toBeGreaterThanOrEqual(0)
        if (width >= 72) expect(first).toBe(second)
        if (width < 72) expect(second).toBeGreaterThan(first)
        if (count > 2) expect(lines.findIndex((line) => line.includes("agent3"))).toBeGreaterThan(first)
        setPanes(
          panes().map((pane, index) =>
            index ? pane : { ...pane, text: "New response\n[tool: read · completed]", status: "idle", tokens: 42 },
          ),
        )
        await app.renderOnce()
        expect(app.captureCharFrame()).toContain("New response")
        expect(app.captureCharFrame()).toContain("42 tokens")
        expect(app.captureCharFrame()).toContain("[tool: read")
      } finally {
        app.renderer.destroy()
      }
    })
  }
}

test("judge actions appear only at the human decision boundary", async () => {
  const [state, setState] = createSignal("running")
  const app = await testRender(
    () => <NexusJudgeBar panes={[]} state={state()} onAction={() => {}} onInspect={() => {}} onFocus={() => {}} />,
    { width: 100, height: 6 },
  )
  try {
    await app.renderOnce()
    expect(app.captureCharFrame()).not.toContain("[verdict]")
    setState("awaiting_judge_input")
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("[verdict]")
    expect(app.captureCharFrame()).toContain("[question]")
  } finally {
    app.renderer.destroy()
  }
})
