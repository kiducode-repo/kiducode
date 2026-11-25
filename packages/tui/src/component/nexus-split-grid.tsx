import { createMemo, For } from "solid-js"
import type { RGBA } from "@opentui/core"

export interface NexusPane {
  id: string
  sessionID: string
  role: string
  model: string
  status: string
  tokens: number
  text: string
  peers?: readonly string[]
}

/** Formats structured findings into conversational chat messages. */
export function formatChatSpeech(text: string): string {
  if (!text || !text.trim()) return "Waiting for response…"

  const lines = text.split("\n")
  const toolLines = lines.filter((l) => l.trim().startsWith("[tool:"))
  const nonToolText = lines
    .filter((l) => !l.trim().startsWith("[tool:"))
    .join("\n")
    .trim()

  if (!nonToolText) {
    return toolLines.length ? `${toolLines.join("\n")}\n\n[Working with tools…]` : text
  }

  try {
    const data = JSON.parse(nonToolText)
    if (data && typeof data === "object" && typeof data.summary === "string") {
      const sections: string[] = []
      if (toolLines.length) sections.push(toolLines.join("\n"))
      sections.push(`💬 Position:\n${data.summary}`)
      if (Array.isArray(data.hypotheses) && data.hypotheses.length > 0) {
        const claims = data.hypotheses
          .map(
            (h: { text: string; sources?: string[] }) =>
              `• ${h.text}${Array.isArray(h.sources) && h.sources.length ? ` (${h.sources.join(", ")})` : ""}`,
          )
          .join("\n")
        sections.push(`📌 Core Arguments:\n${claims}`)
      }
      if (Array.isArray(data.evidence) && data.evidence.length > 0) {
        const ev = data.evidence
          .map((e: { excerpt: string; source: string }) => `• "${e.excerpt}" — ${e.source}`)
          .join("\n")
        sections.push(`🔍 Evidence Cited:\n${ev}`)
      }
      if (Array.isArray(data.challenges) && data.challenges.length > 0) {
        const ch = data.challenges
          .map((c: { target: string; reason: string }) => `• To ${c.target}: ${c.reason}`)
          .join("\n")
        sections.push(`⚔️ Challenges to Peer:\n${ch}`)
      }
      if (Array.isArray(data.verifications) && data.verifications.length > 0) {
        const v = data.verifications
          .map(
            (item: { target: string; verdict: string; reason: string }) =>
              `• Check ${item.target} [${item.verdict}]: ${item.reason}`,
          )
          .join("\n")
        sections.push(`⚖️ Verification:\n${v}`)
      }
      if (Array.isArray(data.unresolved) && data.unresolved.length > 0) {
        const un = data.unresolved.map((u: string) => `• ${u}`).join("\n")
        sections.push(`❓ Open Questions:\n${un}`)
      }
      return sections.join("\n\n")
    }
  } catch {
    const summaryMatch = nonToolText.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)/)
    if (summaryMatch) {
      const summary = summaryMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n")
      const prefix = toolLines.length ? `${toolLines.join("\n")}\n\n` : ""
      return `${prefix}💬 Position (streaming…):\n${summary}`
    }
  }

  return text
}

/** Physical terminal columns; narrow terminals retain readable, stacked panes. */
export function NexusSplitGrid(props: {
  panes: readonly NexusPane[]
  width: number
  height: number
  color?: RGBA
  borderColor?: RGBA
  viewMode?: "chat" | "logs"
  onInspect?: (pane: NexusPane) => void
}) {
  const columns = () => (props.width < 72 ? 1 : 2)
  const rows = createMemo(() =>
    Array.from({ length: Math.ceil(props.panes.length / columns()) }, (_, index) =>
      props.panes.slice(index * columns(), (index + 1) * columns()),
    ),
  )
  return (
    <scrollbox width={props.width} height={props.height} minHeight={0}>
      <For each={rows()}>
        {(row) => (
          <box
            flexDirection="row"
            flexShrink={0}
            height={Math.max(7, Math.floor(props.height / Math.max(1, rows().length)))}
            minHeight={0}
          >
            <For each={row}>
              {(pane) => (
                <box
                  width={columns() === 2 ? "50%" : "100%"}
                  minWidth={0}
                  minHeight={0}
                  border
                  borderColor={props.borderColor}
                  flexDirection="column"
                >
                  <text
                    height={1}
                    flexShrink={0}
                    fg={props.color}
                    wrapMode="none"
                    truncate
                    onMouseUp={() => props.onInspect?.(pane)}
                  >{`${pane.id} · ${pane.role} · ${pane.status}`}</text>
                  <text
                    height={1}
                    flexShrink={0}
                    fg={props.color}
                    wrapMode="none"
                    truncate
                  >{`${pane.tokens} tokens · ${pane.model}`}</text>
                  <scrollbox flexGrow={1} minHeight={0} stickyScroll stickyStart="bottom">
                    <text fg={props.color} wrapMode="word">
                      {(props.viewMode ?? "chat") === "chat"
                        ? formatChatSpeech(pane.text)
                        : pane.text || "Waiting for public response…"}
                    </text>
                  </scrollbox>
                </box>
              )}
            </For>
          </box>
        )}
      </For>
    </scrollbox>
  )
}
