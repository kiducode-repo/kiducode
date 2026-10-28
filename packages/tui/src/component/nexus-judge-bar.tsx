import { For, Show } from "solid-js"
import type { RGBA } from "@opentui/core"
import type { NexusPane } from "./nexus-split-grid"

export function NexusJudgeBar(props: {
  panes: readonly NexusPane[]
  state: string
  color?: RGBA
  onInspect: (pane: NexusPane) => void
  onAction: (action: "question" | "revise" | "verdict" | "cancel") => void
  onFocus: () => void
}) {
  return (
    <box flexDirection="column" flexShrink={0}>
      <text fg={props.color} onMouseUp={props.onFocus}>
        Human judge · {props.state} · /nexus-judge for keyboard actions
      </text>
      <box flexDirection="row" flexWrap="wrap">
        <For each={props.panes}>
          {(pane, index) => (
            <text fg={props.color} onMouseUp={() => props.onInspect(pane)}>{` [${index() + 1}: ${pane.id}] `}</text>
          )}
        </For>
        <Show when={props.state === "awaiting_judge_input"}>
          <For each={["question", "revise", "verdict", "cancel"] as const}>
            {(action) => <text fg={props.color} onMouseUp={() => props.onAction(action)}>{` [${action}] `}</text>}
          </For>
        </Show>
      </box>
    </box>
  )
}
