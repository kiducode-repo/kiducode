import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { createMemo, For, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Locale } from "@/util/locale"
import { useTheme } from "@tui/context/theme"
import { usePathFormatter } from "@tui/context/path-format"
import { useTuiConfig } from "@tui/context/tui-config"
import { useDialog, type DialogContext } from "@tui/ui/dialog"
import { getScrollAcceleration } from "@tui/util/scroll"

export type RevertFileOption = {
  file: string
  patches: number
}

export function DialogRevertFiles(props: { files: RevertFileOption[]; onSelect: (files: string[]) => void }) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const pathFormatter = usePathFormatter()
  const tuiConfig = useTuiConfig()
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))
  const [store, setStore] = createStore({ selected: 0, picked: {} as Record<string, boolean> })
  const height = createMemo(() => Math.min(props.files.length, 10))
  const selected = createMemo(() => props.files[store.selected])
  const picked = createMemo(() => props.files.filter((file) => store.picked[file.file]).map((file) => file.file))

  function move(offset: number) {
    if (props.files.length === 0) return
    const next = store.selected + offset
    setStore("selected", next < 0 ? props.files.length - 1 : next >= props.files.length ? 0 : next)
  }

  function toggle(file = selected()) {
    if (!file) return
    setStore(
      "picked",
      produce((picked) => {
        picked[file.file] = !picked[file.file]
      }),
    )
  }

  function confirm() {
    const files = picked()
    if (files.length === 0) return
    props.onSelect(files)
    dialog.clear()
  }

  useKeyboard((evt) => {
    if (evt.name === "up") {
      evt.preventDefault()
      evt.stopPropagation()
      move(-1)
      return
    }
    if (evt.name === "down") {
      evt.preventDefault()
      evt.stopPropagation()
      move(1)
      return
    }
    if (evt.name === "space") {
      evt.preventDefault()
      evt.stopPropagation()
      toggle()
      return
    }
    if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      confirm()
    }
  })

  return (
    <box gap={1}>
      <box flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Revert Files
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <scrollbox
        height={height()}
        backgroundColor={theme.backgroundElement}
        scrollbarOptions={{ visible: false }}
        scrollAcceleration={scrollAcceleration()}
      >
        <For each={props.files}>
          {(item, index) => {
            const active = createMemo(() => index() === store.selected)
            const checked = createMemo(() => store.picked[item.file] === true)
            return (
              <box
                flexDirection="row"
                justifyContent="space-between"
                paddingLeft={2}
                paddingRight={2}
                backgroundColor={active() ? theme.backgroundPanel : undefined}
                onMouseUp={() => {
                  setStore("selected", index())
                  toggle(item)
                }}
              >
                <box flexDirection="row" minWidth={0} flexShrink={1} gap={1}>
                  <text fg={active() ? theme.primary : theme.textMuted}>{checked() ? "[x]" : "[ ]"}</text>
                  <text fg={active() ? theme.text : theme.textMuted} wrapMode="none">
                    {Locale.truncateLeft(pathFormatter.format(item.file), 54)}
                  </text>
                </box>
                <text fg={theme.textMuted}>{item.patches > 1 ? `${item.patches} patches` : "1 patch"}</text>
              </box>
            )
          }}
        </For>
      </scrollbox>
      <box paddingLeft={2} paddingRight={2}>
        <text fg={theme.textMuted} wrapMode="word">
          Space toggles files. Enter reverts selected files to their state before the AI changes.
        </text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingLeft={2} paddingRight={2} paddingBottom={1} gap={2}>
        <text fg={theme.textMuted}>{picked().length} selected</text>
        <box paddingLeft={2} paddingRight={2} backgroundColor={picked().length ? theme.primary : theme.backgroundPanel}>
          <text fg={picked().length ? theme.selectedListItemText : theme.textMuted}>revert</text>
        </box>
      </box>
      <Show when={props.files.length === 0}>
        <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
          <text fg={theme.textMuted}>No changed files found.</text>
        </box>
      </Show>
    </box>
  )
}

DialogRevertFiles.show = (dialog: DialogContext, files: RevertFileOption[]) => {
  return new Promise<string[] | undefined>((resolve) => {
    dialog.replace(() => <DialogRevertFiles files={files} onSelect={resolve} />, () => resolve(undefined))
  })
}
