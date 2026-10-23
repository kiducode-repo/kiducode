/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { ConfigProvider, useConfig, type Info } from "../../src/config"
import { ThemeProvider, useThemes } from "../../src/context/theme"
import { emptyThemeSource, tmpdir } from "../fixture/fixture"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

test("offers only KiduCode themes when experiments change", async () => {
  await using temporary = await tmpdir()
  const settings: Info = {}
  let config!: ReturnType<typeof useConfig>
  let themes!: ReturnType<typeof useThemes>
  function Probe() {
    config = useConfig()
    themes = useThemes()
    return null
  }
  const app = await testRender(() => (
    <TestTuiContexts paths={{ state: temporary.path }}>
      <ConfigProvider
        config={createTuiResolvedConfig(settings)}
        service={{
          get: async () => settings,
          update: async (update) => {
            update(settings)
            return settings
          },
        }}
      >
        <ThemeProvider mode="dark" source={emptyThemeSource}>
          <Probe />
        </ThemeProvider>
      </ConfigProvider>
    </TestTuiContexts>
  ))

  try {
    app.renderer.start()
    await app.waitForFrame(() => themes !== undefined)
    expect(themes.has("opencode2")).toBeFalse()
    expect(Object.keys(themes.all())).toEqual(["mint-kiducode", "orange-kiducode"])
    expect(themes.set("opencode2")).toBeFalse()

    await config.update((draft) => {
      draft.experimental = { "new-designs": true }
    })
    expect(themes.has("opencode2")).toBeFalse()
    expect(Object.keys(themes.all())).toEqual(["mint-kiducode", "orange-kiducode"])

    await config.update((draft) => {
      draft.experimental = { "new-designs": false }
    })
    expect(themes.has("opencode2")).toBeFalse()
    expect(themes.selected).toBe("mint-kiducode")
  } finally {
    app.renderer.destroy()
  }
})
