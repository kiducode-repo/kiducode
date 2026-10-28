import { createMemo, For, Show } from "solid-js"
import { Option, Schema } from "effect"
import { KiduNexus } from "@opencode/schema/kidunexus"
import type { RGBA } from "@opentui/core"

const decode = Schema.decodeUnknownOption(KiduNexus.Progress)

export function NexusProgress(props: { value: unknown; details?: boolean; color?: RGBA }) {
  const progress = createMemo(() => Option.getOrUndefined(decode(props.value)))
  return (
    <Show when={progress()} fallback={<text fg={props.color}>KiduNexus · preparing workflow</text>}>
      {(value) => (
        <box flexDirection="column">
          <text fg={props.color} wrapMode="word">
            {`KiduNexus · ${value().phase} · ${value().completed}/${value().total} nodes · ${Math.round(value().elapsedMs / 1000)}s`}
          </text>
          <text fg={props.color} wrapMode="word">
            {`${value().tokens} recorded tokens · ${value().reservedTokens} reserved · ${value().estimatedCost === null ? "cost unknown" : `$${value().estimatedCost?.toFixed(4)} estimated`}`}
          </text>
          <Show when={props.details}>
            <For each={value().nodes}>
              {(node) => <text fg={props.color} wrapMode="word">{`${node.id} [${node.role}] ${node.status}${node.dependencies.length ? ` ← ${node.dependencies.join(", ")}` : ""}`}</text>}
            </For>
          </Show>
        </box>
      )}
    </Show>
  )
}
