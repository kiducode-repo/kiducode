/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import { DialogNexusSetup } from "../../src/component/dialog-nexus-setup"
import { model, renderLocal } from "../fixture/local"
import type { KiduNexus } from "@opencode/schema/kidunexus"

test("manual Nexus setup selects real models and launches two assigned workers", async () => {
  await using app = await renderLocal({ models: [model("connected-model")] })
  const launches: { task: string; judge: "human" | "model"; nodes?: readonly KiduNexus.CustomNode[] }[] = []
  app.dialog.replace(() => (
    <DialogNexusSetup
      onLaunch={(input) => {
        launches.push(input)
        app.dialog.clear()
      }}
    />
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Assign workers manually"))
  app.mockInput.pressEnter()
  await app.waitForFrame((frame) => frame.includes("Who judges"))
  app.mockInput.pressEnter()
  await app.waitForFrame((frame) => frame.includes("Number of workers"))
  app.mockInput.pressEnter()
  for (const index of [1, 2]) {
    await app.waitForFrame((frame) => frame.includes(`Worker ${index}: role`))
    app.mockInput.pressEnter()
    await app.waitForFrame(
      (frame) => frame.includes(`Worker ${index}: connected model`) && frame.includes("connected-model"),
    )
    app.mockInput.pressEnter()
    await app.waitForFrame((frame) => frame.includes(`Worker ${index}: objective`))
    await app.waitFor(() => app.renderer.currentFocusedRenderable instanceof TextareaRenderable)
    await app.mockInput.typeText(`Objective ${index}`)
    app.mockInput.pressEnter()
  }
  await app.waitForFrame((frame) => frame.includes("Nexus task"))
  await app.waitFor(() => app.renderer.currentFocusedRenderable instanceof TextareaRenderable)
  await app.mockInput.typeText("Compare architectures")
  app.mockInput.pressEnter()
  await app.waitFor(() => launches.length === 1)
  expect(launches[0]).toMatchObject({
    task: "Compare architectures",
    judge: "human",
    nodes: [
      { id: "agent1", model: { id: "connected-model", providerID: "provider" }, task: "Objective 1" },
      { id: "agent2", model: { id: "connected-model", providerID: "provider" }, task: "Objective 2" },
    ],
  })
})
