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
}

/** Physical terminal columns; narrow terminals retain readable, stacked panes. */
export function NexusSplitGrid(props: {
  panes: readonly NexusPane[]
  width: number
  height: number
  color?: RGBA
  borderColor?: RGBA
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
                      {pane.text || "Waiting for public response…"}
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
