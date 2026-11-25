import { createMemo, createSignal, onMount } from "solid-js"
import { SshConfig } from "@opencode/core/ssh/config"
import { SshClient } from "@opencode/core/ssh/client"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DIALOG_LIST_INSET, useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { useToast } from "../ui/toast"

export function DialogSsh() {
  const dialog = useDialog()
  const theme = useTheme()
  const toast = useToast()
  dialog.setSize("large")

  const [version, setVersion] = createSignal(0)

  onMount(() => {
    // Ensure initial template exists
    SshConfig.ensureConfigFile()
  })

  const servers = createMemo(() => {
    version() // dependency to trigger re-reads
    return SshConfig.listPublicServers()
  })

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const list = servers()
    const result: DialogSelectOption<string>[] = [
      {
        title: "+ Add SSH connection",
        description: "Open secure folder and edit ssh.json credentials",
        category: "Actions",
        value: "__action_add__",
        onSelect: async () => {
          try {
            const res = await SshConfig.openConfigFolder()
            toast.show({
              title: "SSH Folder Opened",
              message: `Opened ${res.dir}. Add server credentials to ssh.json.`,
              variant: "info",
            })
            setVersion((v) => v + 1)
          } catch (err: unknown) {
            toast.show({
              title: "Failed to Open Folder",
              message: err instanceof Error ? err.message : String(err),
              variant: "error",
            })
          }
        },
      },
    ]

    for (const server of list) {
      result.push({
        title: server.name,
        description: `${server.username}@${server.host}:${server.port}${server.description ? ` · ${server.description}` : ""}`,
        category: "Configured Servers",
        footer: server.hasKey ? "Key ✓" : server.hasPassword ? "Password ✓" : "Default",
        footerColor: theme.text.feedback.success.base,
        value: server.name,
        onSelect: async () => {
          toast.show({
            title: "Testing Connection...",
            message: `Connecting to ${server.name} via OpenSSH...`,
            variant: "info",
          })
          const fullServer = SshConfig.getServer(server.name)
          if (!fullServer) return
          const testResult = await SshClient.testConnection(fullServer)
          if (testResult.success) {
            toast.show({
              title: "SSH Connection Success",
              message: testResult.message,
              variant: "success",
            })
          } else {
            toast.show({
              title: "SSH Connection Failed",
              message: testResult.message,
              variant: "error",
            })
          }
        },
      })
    }

    return result
  })

  return (
    <DialogSelect
      title="SSH Connections"
      options={options()}
      flat={false}
      emptyView={
        <box paddingLeft={DIALOG_LIST_INSET} paddingRight={DIALOG_LIST_INSET}>
          <text fg={theme.text.muted}>No SSH connections available</text>
        </box>
      }
      noMatchView={
        <box paddingLeft={DIALOG_LIST_INSET} paddingRight={DIALOG_LIST_INSET}>
          <text fg={theme.text.muted}>No matching SSH connections</text>
        </box>
      }
    />
  )
}
