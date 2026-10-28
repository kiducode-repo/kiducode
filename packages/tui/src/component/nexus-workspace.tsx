import { createEffect, createMemo, on } from "solid-js"
import { Option, Schema } from "effect"
import { KiduNexus } from "@opencode/schema/kidunexus"
import { TokenUsage } from "@opencode/schema/token-usage"
import { useData } from "../context/data"
import { useClient } from "../context/client"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useDialog } from "../ui/dialog"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogSelect } from "../ui/dialog-select"
import { useToast } from "../ui/toast"
import { NexusSplitGrid, type NexusPane } from "./nexus-split-grid"
import { NexusJudgeBar } from "./nexus-judge-bar"

export function NexusWorkspace(props: {
  parentID: string
  progress: KiduNexus.Progress
  width: number
  height: number
  judgeRequest: number
  onJudge: (input: KiduNexus.JudgeInput) => void
}) {
  const data = useData()
  const client = useClient()
  const theme = useTheme()
  const route = useRoute()
  const dialog = useDialog()
  const toast = useToast()
  const children = createMemo(() => {
    const entries = data.session
      .family(props.parentID)
      .flatMap((id) => {
        const session = data.session.get(id)
        const marker = Option.getOrUndefined(Schema.decodeUnknownOption(KiduNexus.Worker)(session?.metadata?.kidunexus))
        return session && marker?.pane && marker.parentID === props.parentID && marker.runID === props.progress.id
          ? [{ session, marker }]
          : []
      })
      .sort((a, b) => a.session.time.created - b.session.time.created)
    return Array.from(new Map(entries.map((entry) => [entry.marker.nodeID, entry])).values()).slice(0, 4)
  })
  createEffect(
    on(
      [
        () =>
          children()
            .map((entry) => entry.session.id)
            .join(","),
        () => client.connection.status(),
      ],
      () => {
        if (client.connection.status() !== "connected") return
        void Promise.all(
          children().flatMap((entry) => [
            data.session.sync(entry.session.id),
            data.session.message.sync(entry.session.id),
          ]),
        ).catch((error) => toast.error(error))
      },
    ),
  )
  const panes = createMemo<NexusPane[]>(() =>
    children().map(({ session, marker }) => ({
      id: marker.nodeID,
      sessionID: session.id,
      role: marker.role,
      model: session.model ? `${session.model.providerID}/${session.model.id}` : "Selecting model",
      status: data.session.status(session.id),
      tokens: TokenUsage.total(session.tokens),
      text: data.session.message
        .list(session.id)
        .flatMap((message) =>
          message.type === "assistant"
            ? message.content.flatMap((part) => {
                if (part.type === "text") return [part.text]
                if (part.type === "tool") return [`[tool: ${part.name} · ${part.state.status}]`]
                return []
              })
            : [],
        )
        .join("\n"),
    })),
  )
  const inspect = (pane: NexusPane) => route.navigate({ type: "session", sessionID: pane.sessionID })
  const action = (action: KiduNexus.JudgeInput["action"]) => {
    if (props.progress.state !== "awaiting_judge_input") return
    const prompt = (target?: string) =>
      dialog.replace(() => (
        <DialogPrompt
          title={`Nexus ${action}${target ? `: ${target}` : ": all workers"}`}
          placeholder="Your question, guidance, or final decision"
          onConfirm={(feedback) => {
            if (!feedback.trim() || feedback.length > 12000) return
            dialog.clear()
            props.onJudge({ id: props.progress.id, action, target, feedback })
          }}
        />
      ))
    dialog.replace(() => (
      <DialogSelect
        title="Judge target"
        options={[
          { title: "All workers / combined decision", value: "" },
          ...panes().map((pane) => ({ title: pane.id, value: pane.id })),
        ]}
        onSelect={(item) => prompt(item.value || undefined)}
      />
    ))
  }
  const focus = () =>
    dialog.replace(() => (
      <DialogSelect
        title="Human judge console"
        description="1–4 inspect · Q question · R revise · V verdict · C cancel"
        options={[
          ...panes().map((pane) => ({
            title: `Inspect ${pane.id}`,
            value: pane.id,
            onSelect: () => {
              dialog.clear()
              inspect(pane)
            },
          })),
          ...(["question", "revise", "verdict", "cancel"] as const)
            .filter(() => props.progress.state === "awaiting_judge_input")
            .map((value) => ({ title: value, value, onSelect: () => action(value) })),
        ]}
        bindings={[
          ...panes().map((pane, index) => ({
            bind: String(index + 1),
            title: `Inspect ${pane.id}`,
            group: "Nexus",
            run: () => {
              dialog.clear()
              inspect(pane)
            },
          })),
          ...(
            [
              ["q", "question"],
              ["r", "revise"],
              ["v", "verdict"],
              ["c", "cancel"],
            ] as const
          ).map(([bind, value]) => ({ bind, title: value, group: "Nexus", run: () => action(value) })),
        ]}
      />
    ))
  createEffect(
    on(
      () => props.judgeRequest,
      (value) => {
        if (value) focus()
      },
    ),
  )
  return (
    <box flexDirection="column" flexShrink={0}>
      <NexusSplitGrid
        panes={panes()}
        width={props.width}
        height={props.height}
        color={theme.text.base}
        borderColor={theme.border.base}
        onInspect={inspect}
      />
      <NexusJudgeBar
        panes={panes()}
        state={props.progress.state}
        color={theme.text.action.secondary.base}
        onInspect={inspect}
        onAction={action}
        onFocus={focus}
      />
    </box>
  )
}
