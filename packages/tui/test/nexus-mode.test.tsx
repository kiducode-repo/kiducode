import { expect, test } from "bun:test"
import { createAppFixture } from "./fixture/app"
import { directory, json } from "./fixture/tui-client"

test("cycling into Nexus opens setup and dismissal preserves the prompt", async () => {
  await using app = await createAppFixture({
    width: 100,
    height: 30,
    fetch: (url) => {
      if (url.pathname === "/api/agent")
        return json({
          location: { directory },
          data: ["build", "nexus"].map((id) => ({
            id,
            name: id === "build" ? "Build" : "Nexus",
            mode: "primary",
            hidden: false,
            permissions: [],
          })),
        })
    },
  })
  await app.ready
  await app.waitForFrame((frame) => frame.includes("Build"))
  await app.mockInput.typeText("Keep my draft")
  app.mockInput.pressKey("TAB", { shift: true })
  await app.waitForFrame((frame) => frame.includes("Assign workers manually") && frame.includes("Ask coordinator"))
  app.mockInput.pressEscape()
  await app.waitForFrame((frame) => frame.includes("Build") && !frame.includes("Assign workers manually"))
  expect(app.captureCharFrame()).toContain("Keep my draft")
  app.mockInput.pressKey("TAB", { shift: true })
  await app.waitForFrame((frame) => frame.includes("Assign workers manually"))
  app.mockInput.pressEnter()
  await app.waitForFrame((frame) => frame.includes("Who judges the findings?"))
  app.mockInput.pressEscape()
  await app.waitForFrame((frame) => frame.includes("Build") && !frame.includes("Who judges the findings?"))
})
