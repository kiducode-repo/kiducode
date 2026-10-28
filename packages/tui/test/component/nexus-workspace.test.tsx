/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import type { SessionMessageInfo } from "@opencode/client"
import type { KiduNexus } from "@opencode/schema/kidunexus"
import { NexusWorkspace } from "../../src/component/nexus-workspace"
import { model, renderLocal, session } from "../fixture/local"
import { json } from "../fixture/tui-client"

test("workspace loads child transcripts, streams public text, isolates runs and accepts a human verdict", async () => {
  const parent = session("ses_nexus_parent")
  const children = ["agent1", "agent2", "unrelated"].map((id, index) => ({
    ...session(`ses_${id}`, { providerID: "provider", id: "connected" }),
    parentID: parent.id,
    metadata: {
      kidunexus: {
        parentID: parent.id,
        runID: index === 2 ? "other-run" : "run",
        nodeID: id,
        role: "creative",
        pane: true,
      },
    },
  }))
  const messages: SessionMessageInfo[] = children.map((child, index) => ({
    id: `msg_${child.id}`,
    type: "assistant",
    agent: "nexus-creative",
    model: { providerID: "provider", id: "connected" },
    time: { created: 1 },
    content: [
      { type: "text", text: `Public result ${index + 1}` },
      { type: "reasoning", text: "private reasoning must not appear" },
    ],
  }))
  await using app = await renderLocal({
    models: [model("connected")],
    sessions: [parent, ...children],
    fetch: (url) => {
      if (url.pathname === "/api/session") return json({ data: children, cursor: {} })
      const index = children.findIndex((child) => url.pathname === `/api/session/${child.id}/message`)
      if (index !== -1) return json({ data: [messages[index]], cursor: {} })
    },
  })
  await app.data.session.sync(parent.id, { children: true })
  const decisions: KiduNexus.JudgeInput[] = []
  app.dialog.replace(() => (
    <NexusWorkspace
      parentID={parent.id}
      progress={{
        id: "run",
        state: "awaiting_judge_input",
        phase: "awaiting_judge_input",
        completed: 2,
        total: 2,
        tokens: 0,
        estimatedCost: null,
        reservedTokens: 1000,
        elapsedMs: 10,
        interactive: true,
        nodes: [],
      }}
      width={60}
      height={16}
      judgeRequest={0}
      onJudge={(input) => decisions.push(input)}
    />
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Public result 1") && frame.includes("Public result 2"))
  expect(app.captureCharFrame()).not.toContain("Public result 3")
  expect(app.captureCharFrame()).not.toContain("private reasoning")
  app.events.emit({
    id: "evt_delta",
    created: 2,
    type: "session.text.delta",
    data: {
      sessionID: children[0].id,
      assistantMessageID: messages[0].id,
      ordinal: 0,
      delta: " LIVE",
    },
  })
  await app.waitForFrame((frame) => frame.includes("Public result 1 LIVE"))
  const lines = app.captureCharFrame().split("\n")
  const row = lines.findIndex((line) => line.includes("Human judge"))
  expect(row).toBeGreaterThanOrEqual(0)
  await app.mockMouse.click(lines[row].indexOf("Human judge") + 2, row)
  await app.waitForFrame((frame) => frame.includes("Human judge console"))
  app.mockInput.pressKey("v")
  await app.waitForFrame((frame) => frame.includes("Judge target"))
  app.mockInput.pressEnter()
  await app.waitForFrame((frame) => frame.includes("Nexus verdict"))
  await app.waitFor(() => app.renderer.currentFocusedRenderable instanceof TextareaRenderable)
  await app.mockInput.typeText("Use agent1 with agent2 safeguards")
  app.mockInput.pressEnter()
  await app.waitFor(() => decisions.length === 1)
  expect(decisions).toEqual([
    { id: "run", action: "verdict", target: undefined, feedback: "Use agent1 with agent2 safeguards" },
  ])
})
