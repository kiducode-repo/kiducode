export type ManglishStyle = "english" | "malayalam" | "plain_manglish" | "genz_manglish" | "mixed"

export type CodingIntent =
  | "feature_creation"
  | "ui_interaction"
  | "ui_polish"
  | "bug_fix"
  | "auth_flow"
  | "backend_api"
  | "database"
  | "deployment"
  | "refactor"
  | "explain"
  | "test"
  | "unknown"

export interface ManglishPreprocessResult {
  original: string
  normalized: string
  instruction: string
  style: ManglishStyle
  intent: CodingIntent
  confidence: number
  changed: boolean
  signals: string[]
}

export interface ManglishPreprocessOptions {
  enabled?: boolean
  minConfidence?: number
}

type Rule = {
  intent: CodingIntent
  confidence: number
  patterns: RegExp[]
  build: (match: RegExpMatchArray, cleaned: string) => string
  signals?: string[]
}

const MALAYALAM_SCRIPT = /[\u0d00-\u0d7f]/

const GENZ_WORDS = [
  "bro",
  "broo",
  "bruh",
  "da",
  "daa",
  "dei",
  "machane",
  "aliyaa",
  "aliya",
  "pls",
  "plz",
  "scene",
  "poli",
  "kidilam",
  "set",
]

const MANGLISH_WORDS = [
  "oru",
  "ee",
  "ith",
  "entha",
  "enth",
  "evde",
  "ivde",
  "onnu",
  "kurach",
  "undakku",
  "aakku",
  "aakk",
  "aakki",
  "akkanam",
  "aavanam",
  "aavum",
  "aavunnilla",
  "cheyyu",
  "cheyy",
  "chey",
  "cheytha",
  "cheythal",
  "kazhinja",
  "kazhinjal",
  "ilek",
  "il",
  "tharuo",
  "pokanam",
  "varanam",
  "nokki",
  "sheriyakku",
  "maattu",
  "paranju",
  "sugamano",
  "sukhamano",
  "sughano",
  "sughamano",
  "sugamalle",
  "sukhamalle",
  "nanni",
]

const CODING_WORDS = [
  "api",
  "auth",
  "backend",
  "button",
  "component",
  "css",
  "dashboard",
  "database",
  "deploy",
  "endpoint",
  "error",
  "fix",
  "form",
  "frontend",
  "function",
  "home",
  "homepage",
  "jwt",
  "layout",
  "login",
  "modal",
  "mongodb",
  "navbar",
  "page",
  "responsive",
  "schema",
  "server",
  "test",
  "ui",
  "vercel",
]

const FILLER_WORDS = new Set([
  "bro",
  "broo",
  "bruh",
  "da",
  "daa",
  "dei",
  "machane",
  "aliyaa",
  "aliya",
  "pls",
  "plz",
  "please",
  "kindly",
  "just",
  "onnu",
  "kurach",
  "ok",
  "okay",
])

const rules: Rule[] = [
  {
    intent: "ui_polish",
    confidence: 0.96,
    patterns: [
      /\b(.+?)\s+sticky\s+aakki\s+mobile\s+i?l?um\s+set\s+aakk(?:anam|u)?\b/i,
      /\b(.+?)\s+sticky\s+aakk(?:u|anam)?\s+mobile\s+i?l?um\s+set\s+aakk(?:anam|u)?\b/i,
    ],
    build: (match) => `Make ${withDefiniteArticle(cleanObject(match[1]))} sticky and ensure it works well on mobile screens.`,
    signals: ["ui_polish", "responsive"],
  },
  {
    intent: "ui_interaction",
    confidence: 0.96,
    patterns: [
      /\bbutton\s+click\s+cheytha(?:l)?\s+(.+?)\s+(?:open\s+)?aav(?:anam|um)\b/i,
      /\bbutton\s+click\s+cheytha(?:l)?\s+(.+?)\s+(?:varanam|kanikkanam)\b/i,
    ],
    build: (match) => `Update the button click handler so ${cleanObject(match[1])} opens when clicked.`,
    signals: ["ui_interaction", "button_click"],
  },
  {
    intent: "auth_flow",
    confidence: 0.95,
    patterns: [/\blogin\s+kazhinja(?:l)?\s+(.+?)(?:ilek|ilekk|lek)?\s+(?:redirect\s+)?(?:aavanam|pokanam)\b/i],
    build: (match) => `After login, redirect the user to ${cleanObject(match[1])}.`,
    signals: ["auth_flow", "redirect"],
  },
  {
    intent: "backend_api",
    confidence: 0.94,
    patterns: [
      /\b(?:oru\s+)?(.+?)\s+(?:api\s+endpoint|endpoint|api)\s+undakku\b/i,
      /\b(.+?)\s+(?:inu|in)\s+(?:oru\s+)?(?:api\s+endpoint|endpoint|api)\s+undakku\b/i,
    ],
    build: (match) => `Create an API endpoint for ${cleanObject(match[1])}.`,
    signals: ["backend_api"],
  },
  {
    intent: "auth_flow",
    confidence: 0.94,
    patterns: [/\b(?:backend\s+il\s+)?jwt\s+auth\s+add\s+cheyyu?\b/i, /\bauth\s+il\s+jwt\s+add\s+cheyyu?\b/i],
    build: () => "Add JWT authentication to the backend.",
    signals: ["auth", "jwt"],
  },
  {
    intent: "database",
    confidence: 0.92,
    patterns: [
      /\bmongodb\s+connect\s+aakki\s+schema\s+set\s+cheyyu?\b/i,
      /\b(.+?)\s+schema\s+(?:set|create|add)\s+cheyyu?\b/i,
    ],
    build: (match) =>
      match[1] ? `Create or update the ${cleanObject(match[1])} schema.` : "Connect MongoDB and set up the schema.",
    signals: ["database"],
  },
  {
    intent: "deployment",
    confidence: 0.93,
    patterns: [/\b(?:project\s+)?(.+?)?\s*(?:vercel\s+il|vercelil)\s+deploy\s+(?:cheyyu|aakki\s+tharuo)\b/i],
    build: () => "Deploy the project to Vercel.",
    signals: ["deployment", "vercel"],
  },
  {
    intent: "bug_fix",
    confidence: 0.92,
    patterns: [
      /\bee\s+bug\s+fix\s+cheyyu?\b/i,
      /\bee\s+error\s+(?:fix\s+cheyyu?|sheriyakku|nokki\s+fix\s+cheyyu?)\b/i,
      /\bee\s+(?:error|bug)\s+.*?(?:fix\s+cheyyu?|sheriyakku|nokki\s+fix\s+cheyyu?)\b/i,
      /\b(?:error|bug)\s+.*?(?:varunnu|undu|aavunnilla).*?(?:fix\s+cheyyu?|sheriyakku|nokki)\b/i,
      /\b(.+?)\s+work\s+aavunnilla\b/i,
    ],
    build: bugFixInstruction,
    signals: ["bug_fix"],
  },
  {
    intent: "ui_polish",
    confidence: 0.9,
    patterns: [
      /\b(.+?)\s+(?:kurach\s+)?modern\s+look\s+aakk(?:u)?\b/i,
      /\b(.+?)\s+(?:poli|kidilam|vere\s+level)\s+(?:look\s+)?aakk(?:u)?\b/i,
      /\b(.+?)\s+set\s+aakki\s+tharuo\b/i,
    ],
    build: (match) => `Improve and polish ${cleanObject(match[1])}.`,
    signals: ["ui_polish"],
  },
  {
    intent: "feature_creation",
    confidence: 0.9,
    patterns: [
      /\boru\s+(.+?)\s+undakku\b/i,
      /\b(.+?)\s+(?:create|build)\s+cheyyu?\b/i,
      /\b(.+?)\s+set\s+aakku\b/i,
    ],
    build: (match) => `Create ${withArticle(cleanObject(match[1]))}.`,
    signals: ["feature_creation"],
  },
  {
    intent: "ui_polish",
    confidence: 0.89,
    patterns: [/\b(.+?)\s+responsive\s+aakk(?:u|anam)?\b/i],
    build: (match) => `Make ${cleanObject(match[1])} responsive.`,
    signals: ["responsive"],
  },
  {
    intent: "refactor",
    confidence: 0.88,
    patterns: [/\b(.+?)\s+(?:kurach\s+)?clean\s+aakk(?:u)?\b/i, /\b(.+?)\s+refactor\s+cheyyu?\b/i],
    build: (match) => `Refactor and clean up ${cleanObject(match[1])} without changing behavior.`,
    signals: ["refactor"],
  },
  {
    intent: "explain",
    confidence: 0.9,
    patterns: [
      /\b(.+?)\s+explain\s+cheyyu?\b/i,
      /\b(.+?)\s+entha\s+cheyyunne\s+paranju\s+tharuo\b/i,
      /\b(.+?)\s+paranju\s+tharuo\b/i,
    ],
    build: (match) => `Explain ${cleanObject(match[1])} in simple terms.`,
    signals: ["explain"],
  },
  {
    intent: "test",
    confidence: 0.88,
    patterns: [/\b(.+?)\s+(?:test|tests)\s+(?:add|write)\s+cheyyu?\b/i],
    build: (match) => `Add tests for ${cleanObject(match[1])}.`,
    signals: ["test"],
  },
]

export function preprocessManglishPrompt(
  input: string,
  options: ManglishPreprocessOptions = {},
): ManglishPreprocessResult {
  const original = input
  const minConfidence = options.minConfidence ?? 0.62
  if (options.enabled === false || !input.trim()) {
    return unchanged(original, "english", "unknown", [])
  }

  const compact = compactWhitespace(input)
  const cleaned = stripFillerWords(compact)
  const style = detectStyle(compact)
  const signals = collectSignals(compact)
  const rule = matchRule(cleaned)
  const codingScore = scoreWords(compact, CODING_WORDS)
  const manglishScore = scoreWords(compact, MANGLISH_WORDS)
  const genzScore = scoreWords(compact, GENZ_WORDS)

  if (rule) {
    const confidence = clamp(rule.rule.confidence + Math.min(0.04, codingScore * 0.01))
    const instruction = rule.rule.build(rule.match, cleaned)
    return {
      original,
      normalized: instruction,
      instruction,
      style,
      intent: rule.rule.intent,
      confidence,
      changed: confidence >= minConfidence,
      signals: unique([...signals, ...(rule.rule.signals ?? [])]),
    }
  }

  const fallback = fallbackInstruction(cleaned)
  const fallbackConfidence = clamp(0.34 + codingScore * 0.08 + manglishScore * 0.04 + genzScore * 0.02)
  return {
    original,
    normalized: fallback,
    instruction: fallback,
    style,
    intent: inferIntent(cleaned),
    confidence: fallbackConfidence,
    changed: style !== "english" && fallbackConfidence >= minConfidence,
    signals,
  }
}

export function formatForAgent(result: ManglishPreprocessResult): string {
  if (!result.changed) return result.original
  return [
    "Original user prompt:",
    result.original,
    "",
    "Normalized developer instruction:",
    result.instruction,
  ].join("\n")
}

function detectStyle(input: string): ManglishStyle {
  const hasMalayalam = MALAYALAM_SCRIPT.test(input)
  const manglishScore = scoreWords(input, MANGLISH_WORDS)
  const genzScore = scoreWords(input, GENZ_WORDS)
  const codingScore = scoreWords(input, CODING_WORDS)

  if (hasMalayalam && (manglishScore > 0 || codingScore > 0)) return "mixed"
  if (hasMalayalam) return "malayalam"
  if (genzScore > 0 && manglishScore > 0) return "genz_manglish"
  if (manglishScore >= 2) return "plain_manglish"
  if (manglishScore > 0 && codingScore > 0) return "plain_manglish"
  if (manglishScore > 0) return "plain_manglish"
  return "english"
}

function matchRule(input: string) {
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const match = input.match(pattern)
      if (match) return { rule, match }
    }
  }
}

function fallbackInstruction(input: string) {
  const intent = inferIntent(input)
  const cleaned = cleanObject(input)
  switch (intent) {
    case "bug_fix":
      return `Investigate and fix this issue: ${cleaned}.`
    case "deployment":
      return `Deploy the project: ${cleaned}.`
    case "explain":
      return `Explain this in simple terms: ${cleaned}.`
    case "refactor":
      return `Refactor this without changing behavior: ${cleaned}.`
    case "test":
      return `Add or update tests for: ${cleaned}.`
    case "database":
      return `Update the database-related implementation: ${cleaned}.`
    case "auth_flow":
      return `Update the authentication flow: ${cleaned}.`
    case "backend_api":
      return `Update the backend API implementation: ${cleaned}.`
    case "ui_interaction":
    case "ui_polish":
    case "feature_creation":
      return `Implement this UI/task request: ${cleaned}.`
    default:
      return cleaned
  }
}

function bugFixInstruction(match: RegExpMatchArray, cleaned: string) {
  if (/^ee bug fix cheyyu?$/i.test(cleaned)) return "Investigate and fix the reported bug."
  if (/^ee error/i.test(cleaned)) return "Investigate and fix the reported error."
  if (match[1] && !isFiller(match[1])) {
    return `Investigate why ${cleanObject(match[1])} is not working and fix it.`
  }
  return `Investigate and fix the issue: ${cleaned}.`
}

function inferIntent(input: string): CodingIntent {
  const text = input.toLowerCase()
  if (/\b(error|bug|fix|aavunnilla|sheriyakku)\b/.test(text)) return "bug_fix"
  if (/\b(click|modal|open|varanam)\b/.test(text)) return "ui_interaction"
  if (/\b(modern|responsive|poli|layout|style|css|look)\b/.test(text)) return "ui_polish"
  if (/\b(login|auth|jwt|redirect)\b/.test(text)) return "auth_flow"
  if (/\b(api|endpoint|backend|server)\b/.test(text)) return "backend_api"
  if (/\b(database|mongodb|schema)\b/.test(text)) return "database"
  if (/\b(deploy|vercel|host)\b/.test(text)) return "deployment"
  if (/\b(refactor|clean)\b/.test(text)) return "refactor"
  if (/\b(explain|paranju|entha)\b/.test(text)) return "explain"
  if (/\b(test|tests)\b/.test(text)) return "test"
  if (/\b(undakku|create|build|add|set)\b/.test(text)) return "feature_creation"
  return "unknown"
}

function collectSignals(input: string) {
  const signals = []
  if (MALAYALAM_SCRIPT.test(input)) signals.push("malayalam_script")
  if (scoreWords(input, GENZ_WORDS) > 0) signals.push("genz_chat")
  if (scoreWords(input, MANGLISH_WORDS) > 0) signals.push("manglish")
  if (scoreWords(input, CODING_WORDS) > 0) signals.push("coding")
  return signals
}

function stripFillerWords(input: string) {
  return compactWhitespace(
    words(input)
      .filter((word) => !FILLER_WORDS.has(word.toLowerCase()))
      .join(" "),
  )
}

function cleanObject(value: string | undefined) {
  const cleaned = compactWhitespace((value ?? "").replace(/\b(ilek|ilekk|lek|inu|in|il)$/i, ""))
  return cleaned || "the requested item"
}

function isFiller(value: string) {
  return words(value).every((word) => FILLER_WORDS.has(word.toLowerCase()))
}

function withArticle(value: string) {
  if (/^(a|an|the)\s+/i.test(value)) return value
  return /^[aeiou]/i.test(value) ? `an ${value}` : `a ${value}`
}

function withDefiniteArticle(value: string) {
  if (/^(a|an|the)\s+/i.test(value)) return value
  return `the ${value}`
}

function scoreWords(input: string, dictionary: string[]) {
  const set = new Set(words(input).map((word) => word.toLowerCase()))
  let score = 0
  for (const item of dictionary) {
    if (item.includes(" ")) {
      if (input.toLowerCase().includes(item)) score++
      continue
    }
    if (set.has(item)) score++
  }
  return score
}

function words(input: string) {
  return input.match(/[a-zA-Z0-9]+/g) ?? []
}

function compactWhitespace(input: string) {
  return input.replace(/\s+/g, " ").trim()
}

function clamp(input: number) {
  return Math.max(0, Math.min(1, Number(input.toFixed(2))))
}

function unique(input: string[]) {
  return Array.from(new Set(input))
}

function unchanged(
  original: string,
  style: ManglishStyle,
  intent: CodingIntent,
  signals: string[],
): ManglishPreprocessResult {
  return {
    original,
    normalized: original,
    instruction: original,
    style,
    intent,
    confidence: 0,
    changed: false,
    signals,
  }
}

export * as ManglishPreprocess from "./preprocess"
