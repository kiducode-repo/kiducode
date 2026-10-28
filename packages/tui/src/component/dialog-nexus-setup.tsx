import { createSignal, Match, Switch } from "solid-js"
import { KiduNexus } from "@opencode/schema/kidunexus"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { useData } from "../context/data"
import { useLocation } from "../context/location"
import { DialogSelect } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"

export function DialogNexusSetup(props: {
  onLaunch: (input: { task: string; judge: "human" | "model"; nodes?: readonly KiduNexus.CustomNode[] }) => void
}) {
  const data = useData()
  const location = useLocation()
  const [step, setStep] = createSignal("method")
  const [manual, setManual] = createSignal(true)
  const [count, setCount] = createSignal(2)
  const [judge, setJudge] = createSignal<"human" | "model">("human")
  const [nodes, setNodes] = createSignal<KiduNexus.CustomNode[]>([])
  const [role, setRole] = createSignal<KiduNexus.CustomNode["role"]>("creative")
  const [model, setModel] = createSignal<KiduNexus.CustomNode["model"]>()
  return (
    <Switch>
      <Match when={step() === "method"}>
        <DialogSelect
          title="Nexus setup"
          options={[
            { title: "Assign workers manually", value: true },
            { title: "Ask coordinator to propose a plan", value: false },
          ]}
          onSelect={(item) => {
            setManual(item.value)
            setStep("judge")
          }}
        />
      </Match>
      <Match when={step() === "judge"}>
        <DialogSelect
          title="Who judges the findings?"
          options={[
            { title: "Human judge", value: "human" as const },
            { title: "Autonomous synthesis", value: "model" as const },
          ]}
          onSelect={(item) => {
            setJudge(item.value)
            setStep(manual() ? "count" : "task")
          }}
        />
      </Match>
      <Match when={step() === "count"}>
        <DialogSelect
          title="Number of workers"
          options={[2, 3, 4].map((value) => ({ title: `${value} workers`, value }))}
          onSelect={(item) => {
            setCount(item.value)
            setStep("role")
          }}
        />
      </Match>
      <Match when={step() === "role"}>
        <DialogSelect
          title={`Worker ${nodes().length + 1}: role`}
          options={(
            [
              "creative",
              "logical",
              "research",
              "skeptic",
              "proponent",
              "opponent",
              "verification",
              "synthesis",
            ] as const
          ).map((value) => ({ title: value, value }))}
          onSelect={(item) => {
            setRole(item.value)
            setStep("model")
          }}
        />
      </Match>
      <Match when={step() === "model"}>
        <DialogSelect
          title={`Worker ${nodes().length + 1}: connected model`}
          options={(data.location.model.list(location.ref) ?? []).map((item) => ({
            title: item.name,
            description: `${item.providerID}/${item.id}`,
            value: item,
          }))}
          onSelect={(item) => {
            setModel({ providerID: Provider.ID.make(item.value.providerID), id: Model.ID.make(item.value.id) })
            setStep("objective")
          }}
        />
      </Match>
      <Match when={step() === "objective"}>
        <DialogPrompt
          title={`Worker ${nodes().length + 1}: objective`}
          placeholder="Optional specific objective"
          onConfirm={(task) => {
            setNodes([
              ...nodes(),
              { id: `agent${nodes().length + 1}`, role: role(), model: model(), task: task.slice(0, 4000) },
            ])
            setStep(nodes().length === count() ? "task" : "role")
          }}
        />
      </Match>
      <Match when={step() === "task"}>
        <DialogPrompt
          title="Nexus task"
          placeholder="Describe the task and acceptance criteria"
          onConfirm={(task) => {
            if (!task.trim() || task.length > 12000) return
            props.onLaunch({ task, judge: judge(), nodes: manual() ? nodes() : undefined })
          }}
        />
      </Match>
    </Switch>
  )
}
