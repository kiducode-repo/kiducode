import { expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { TerminalColors } from "@opentui/core"
import { allThemes, hasTheme, getOpenCodeTheme, parseTheme, resolveTheme } from "../src/theme"
import { discoverThemes } from "../src/theme/discovery"
import { configDirectories } from "../src/util/config-directories"
import { terminalMode } from "../src/theme/system"
import kiducodeSource from "../src/theme/assets/mint-kiducode.json" with { type: "json" }
import opencodeV2Source from "../src/theme/assets/v2/opencode.json" with { type: "json" }
import type { ThemeV1Json } from "@opencode/theme/tui/v1"
import { tmpdir } from "./fixture/fixture"

const kiducodeV1 = kiducodeSource as ThemeV1Json

test("rejects unrecognized theme structures", () => {
  expect(() => parseTheme({})).toThrow()
  expect(() => parseTheme({ version: 3 })).toThrow("Invalid theme")
})

test("registers only KiduCode themes", () => {
  expect(Object.keys(allThemes())).toEqual(["mint-kiducode", "orange-kiducode"])
  expect(parseTheme(getOpenCodeTheme()).base).toBeDefined()
})

test("keeps upstream themes out of the global theme list", () => {
  expect(allThemes().opencode).toBeUndefined()
  expect(allThemes().opencode2).toBeUndefined()
  expect(hasTheme("opencode")).toBe(false)
  expect(hasTheme("opencode2")).toBe(false)
})

test("detects V1 themes from their theme field and caches migrations", () => {
  const unversioned = structuredClone(kiducodeV1)
  const explicit = { ...structuredClone(kiducodeV1), version: 1 }
  const first = parseTheme(unversioned, "unversioned")
  const second = parseTheme(explicit, "explicit")

  expect(first.base).toBeDefined()
  expect(second.base).toBeDefined()
  expect(parseTheme(unversioned, "unversioned")).toBe(first)
  expect(parseTheme(explicit, "explicit")).toBe(second)
})

test("decodes native V2 themes lazily once", () => {
  const opencodeV2 = parseTheme(opencodeV2Source)
  const source = {
    base: opencodeV2.base,
    light: { ...opencodeV2.light, categorical: ["red"] },
  } as const

  const document = parseTheme(source)
  expect(document.light?.categorical).toEqual(["red"])
  expect(parseTheme(source)).toBe(document)
})

test("rejects invalid V2 themes when parsing", () => {
  expect(() => parseTheme({ light: { categorical: [] } }, "invalid-v2")).toThrow("Invalid theme: invalid-v2")
})

test("rejects invalid V1 themes when parsing", () => {
  const source = structuredClone(kiducodeV1)
  source.defs = { ...source.defs, one: "two", two: "one" }
  source.theme.primary = "one"

  expect(() => parseTheme(source)).toThrow("Circular color reference")
})

test("replacement sources receive independent parse caches", () => {
  const first = structuredClone(kiducodeV1)
  const second = structuredClone(kiducodeV1)
  second.theme.primary = "#123456"

  const previous = parseTheme(first)
  const next = parseTheme(second)
  expect(next).not.toBe(previous)
  expect(parseTheme(second)).toBe(next)
})

test("hasTheme checks theme presence", () => {
  expect(hasTheme("missing-theme")).toBe(false)
  expect(hasTheme("mint-kiducode")).toBe(true)
  expect(hasTheme("orange-kiducode")).toBe(true)
})

test("resolveTheme rejects circular color refs", () => {
  const item = structuredClone(kiducodeV1)
  item.defs = { ...item.defs, one: "two", two: "one" }
  item.theme.primary = "one"
  expect(() => resolveTheme(item, "dark")).toThrow("Circular color reference")
})

test("resolveTheme preserves full theme numeric color and marker semantics", () => {
  const item = structuredClone(kiducodeV1)
  item.theme.primary = 6
  delete item.theme.selectedListItemText

  const theme = resolveTheme(item, "dark")
  expect(theme.primary.intent).toBe("rgb")
  expect(theme.selectedListItemText).toBe(theme.background)
  expect(theme._hasSelectedListItemText).toBe(false)
})

function terminalColors(defaultBackground: string | null, palette: Array<string | null> = []): TerminalColors {
  return {
    palette,
    defaultForeground: null,
    defaultBackground,
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: null,
    highlightForeground: null,
  }
}

test("terminalMode derives mode from refreshed background", () => {
  expect(terminalMode(terminalColors("#fbf1c7"))).toBe("light")
  expect(terminalMode(terminalColors("#1a1b26"))).toBe("dark")
})

test("terminalMode does not derive mode from ANSI slot zero", () => {
  expect(terminalMode(terminalColors(null, ["#000000"]))).toBeUndefined()
})

test("custom theme precedence follows directory order", async () => {
  await using tmp = await tmpdir()
  const global = path.join(tmp.path, "global")
  const project = path.join(tmp.path, "project")
  await mkdir(path.join(global, "themes"), { recursive: true })
  await mkdir(path.join(project, "themes"), { recursive: true })
  await writeFile(path.join(global, "themes", "custom.json"), JSON.stringify({ source: "global" }))
  await writeFile(path.join(project, "themes", "custom.json"), JSON.stringify({ source: "project" }))

  await expect(discoverThemes([global, project])).resolves.toEqual({ custom: { source: "project" } })
})

test("theme directories include global config before project directories", async () => {
  await using tmp = await tmpdir()
  const global = path.join(tmp.path, "global")
  const project = path.join(tmp.path, "repo", "package")
  await mkdir(path.join(global, "themes"), { recursive: true })
  await mkdir(path.join(project, ".opencode", "themes"), { recursive: true })
  await writeFile(path.join(global, "themes", "global.json"), JSON.stringify({ source: "global" }))
  await writeFile(path.join(project, ".opencode", "themes", "project.json"), JSON.stringify({ source: "project" }))

  await expect(discoverThemes(configDirectories(global, project))).resolves.toEqual({
    global: { source: "global" },
    project: { source: "project" },
  })
})
