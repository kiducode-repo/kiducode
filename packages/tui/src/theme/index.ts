import { migrateV1, parseThemeDocument, type ThemeDocument, type ModeDefinition } from "@opencode/theme/tui"
import { resolveThemeColors } from "./resolve"
import { type Theme, type ThemeV1Json } from "./v1"
import mintKiducode from "./assets/mint-kiducode.json" with { type: "json" }
import orangeKiducode from "./assets/orange-kiducode.json" with { type: "json" }

export { DEFAULT_THEMES, type Theme, type ThemeV1Json } from "./v1"

export type ThemeDocumentSource = Record<string, unknown>

const listeners = new Set<(themes: Record<string, ThemeDocumentSource>) => void>()
const parsed = new WeakMap<object, ThemeDocument>()
let kiducodeTheme:
  | (ThemeDocument & {
      readonly light: ModeDefinition
      readonly dark: ModeDefinition
    })
  | undefined

export function getOpenCodeTheme() {
  if (kiducodeTheme) return kiducodeTheme
  const document = migrateV1(mintKiducode as ThemeV1Json) as NonNullable<typeof kiducodeTheme>
  kiducodeTheme = document
  return document
}

export function getOpenCode2Theme() {
  return migrateV1(orangeKiducode as ThemeV1Json)
}

function listThemes(): Record<string, ThemeDocumentSource> {
  return {
    "mint-kiducode": mintKiducode,
    "orange-kiducode": orangeKiducode,
  }
}

function syncThemes() {
  const themes = listThemes()
  for (const listener of listeners) listener(themes)
}

export function allThemes() {
  return listThemes()
}

export function isThemeSource(source: unknown): source is ThemeDocumentSource {
  if (typeof source !== "object" || source === null || Array.isArray(source)) return false
  return "theme" in source || "base" in source
}

export function parseTheme(source: ThemeDocumentSource, name = "theme") {
  const cached = parsed.get(source)
  if (cached) return cached

  const document = "theme" in source ? migrateV1(source as ThemeV1Json) : parseThemeDocument(source, name)

  parsed.set(source, document)
  return document
}

export function subscribeThemes(listener: (themes: Record<string, ThemeDocumentSource>) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setCustomThemes(_themes: Record<string, unknown>) {
  syncThemes()
}

export function setSystemTheme(_theme: ThemeDocumentSource | undefined) {
  syncThemes()
}

export function hasTheme(name: string) {
  if (!name) return false
  return allThemes()[name] !== undefined
}

export function resolveTheme(theme: ThemeV1Json, mode: "dark" | "light"): Theme {
  const resolved = resolveThemeColors(theme, mode)
  return {
    ...resolved.theme,
    _hasSelectedListItemText: resolved.hasSelectedListItemText,
    thinkingOpacity: resolved.thinkingOpacity,
  }
}
