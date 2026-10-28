/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import { KiduNexus } from "@opencode/schema/kidunexus"
import { NexusProgress } from "../../src/component/nexus-progress"

for (const width of [44, 100]) {
  test(`Nexus streamed progress and graph update at width ${width}`, async () => {
    const [progress, setProgress] = createSignal<KiduNexus.Progress>({
      id: "run", state: "running", phase: "VERIFY", completed: 2, total: 3,
      tokens: 300, estimatedCost: null, reservedTokens: 2000, elapsedMs: 5000,
      nodes: [{ id: "verify", role: "verification", status: "running", dependencies: ["ideas"] }],
    })
    const app = await testRender(() => <NexusProgress value={progress()} details />, { width, height: 12 })
    try {
      await app.renderOnce()
      expect(app.captureCharFrame()).toContain("VERIFY")
      expect(app.captureCharFrame().replace(/\s+/g, " ")).toContain("cost unknown")
      expect(app.captureCharFrame()).toContain("verification")
      setProgress({ ...progress(), state: "completed", phase: "completed", completed: 3 })
      await app.renderOnce()
      expect(app.captureCharFrame()).toContain("completed")
      expect(app.captureCharFrame()).toContain("3/3")
    } finally {
      app.renderer.destroy()
    }
  })
}
