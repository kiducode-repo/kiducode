/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { getOpenCodeTheme } from "../../../src/theme"
import { ConfigProvider } from "../../../src/config"
import { ThemeContextProvider, ThemeProvider, type ThemeError, useTheme, useThemes } from "../../../src/context/theme"

async function wait(fn: () => boolean) {
  const started = Date.now()
  while (!fn()) {
    if (Date.now() - started > 2000) throw new Error("timed out waiting for theme mode")
    await Bun.sleep(10)
  }
}

test("offers only KiduCode themes while retaining mode controls", async () => {
  let themes: ReturnType<typeof useThemes> | undefined

  function Probe() {
    const value = useThemes()
    themes = value
    return <text>{value.mode()}</text>
  }

  function current() {
    if (!themes) throw new Error("Theme provider is not mounted")
    return themes
  }

  const app = await testRender(
    () => (
      <ConfigProvider config={createTuiResolvedConfig({ theme: { name: "mint-kiducode", mode: "dark" } })}>
        <ThemeProvider mode="dark" source={{ discover: () => Promise.resolve({}) }}>
          <Probe />
        </ThemeProvider>
      </ConfigProvider>
    ),
    { width: 20, height: 2 },
  )
  app.renderer.start()

  try {
    await wait(() => themes?.ready === true)
    expect(current().selected).toBe("mint-kiducode")
    expect(current().modes()).toEqual(["dark"])
    expect(current().supports("dark")).toBeTrue()
    expect(current().set("orange-kiducode")).toBeTrue()
    expect(current().selected).toBe("orange-kiducode")
    expect(current().set("opencode")).toBeFalse()
  } finally {
    app.renderer.destroy()
  }
})

test.each([
  ["schema", { base: {}, light: {} }],
  ["partial mode", { base: { text: { base: "#ffffff" } }, light: {} }],
  [
    "token reference",
    {
      base: { ...getOpenCodeTheme().base, text: { ...getOpenCodeTheme().base.text, base: "$missing" } },
      light: getOpenCodeTheme().light,
    },
  ],
] as const)("falls back to KiduCode when configured V2 theme %s is unavailable", async (_label, source) => {
  let themes: ReturnType<typeof useThemes> | undefined
  let failure: ThemeError | undefined
  let unsubscribe: (() => void) | undefined
  const discovery = Promise.withResolvers<Record<string, unknown>>()

  function Probe() {
    const value = useThemes()
    themes = value
    unsubscribe = value.onError((error) => (failure = error))
    return <text>{value.selected}</text>
  }

  const app = await testRender(
    () => (
      <ConfigProvider config={createTuiResolvedConfig({ theme: { name: "invalid" } })}>
        <ThemeProvider mode="dark" source={{ discover: () => discovery.promise }}>
          <Probe />
        </ThemeProvider>
      </ConfigProvider>
    ),
    { width: 20, height: 2 },
  )
  app.renderer.start()
  discovery.resolve({ invalid: source })

  try {
    await wait(() => themes?.ready === true)
    expect(themes?.selected).toBe("mint-kiducode")
    expect(failure).toBeUndefined()
  } finally {
    unsubscribe?.()
    app.renderer.destroy()
  }
})

test("dialog surfaces are absolute and can be inherited through the theme context", async () => {
  let themes: ReturnType<typeof useThemes> | undefined
  let theme: ReturnType<typeof useTheme> | undefined
  let contextual: ReturnType<typeof useTheme> | undefined

  function ContextProbe() {
    contextual = useTheme()
    return <text>{contextual.text.base.toString()}</text>
  }

  function Probe() {
    themes = useThemes()
    theme = useTheme()
    return (
      <ThemeContextProvider context="dialog">
        <ContextProbe />
      </ThemeContextProvider>
    )
  }

  const app = await testRender(
    () => (
      <ConfigProvider config={createTuiResolvedConfig({ theme: { name: "opencode", mode: "dark" } })}>
        <ThemeProvider mode="dark" source={{ discover: async () => ({}) }}>
          <Probe />
        </ThemeProvider>
      </ConfigProvider>
    ),
    { width: 20, height: 2 },
  )
  app.renderer.start()

  try {
    await wait(() => themes?.ready === true)
    if (!themes || !theme || !contextual) throw new Error("Theme provider is not mounted")
    const dialog = theme.surface("dialog")
    expect(theme.surface("dialog")).toBe(dialog)
    expect(dialog.surface("dialog")).toBe(dialog)
    expect(dialog.background.base).toBe(themes.currentTokens().background.raised.base)
    expect(contextual.background.base).toBe(dialog.background.base)
    expect(contextual.text.base).toBe(dialog.text.base)
    expect(dialog.decrease(dialog.background.raised.base)).toBe(themes.currentTokens().hue.neutral[600])
  } finally {
    app.renderer.destroy()
  }
})
