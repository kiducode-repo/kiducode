# KiduNexus (experimental)

KiduNexus runs bounded reasoning workflows through native child sessions. Crew remains a separate, prompt-directed mode.

Use `/nexus` inside a session for configurable worker panes and human judging. See the [interactive workflow guide](interactive.md).

## Enable and run

Add this to your project `kiducode.json` (preserving other settings):

```json
{
  "kidunexus": {
    "enabled": true,
    "mode": "adaptive",
    "max_concurrent_agents": 4,
    "max_total_tokens": 100000,
    "max_task_duration_seconds": 600
  }
}
```

Select **Nexus** with the agent picker or Shift+Tab, select a model, and describe the task. The coordinator calls `nexus_run`. Expand its TUI tool card to inspect node dependencies and the result. Ask Nexus to call `nexus_report` to list saved runs, or supply a run ID to inspect one. Reports are scoped to the current parent session.

For editing, additionally set `allow_execution: true` and explicitly request `execute` mode. Workers use ordinary tool permissions; edit and shell operations require approval. Shell execution uses the local environment, not an OS sandbox. Evaluation may run shell commands, so it is not a read-only security boundary.

## Modes

| Mode | Workflow |
| --- | --- |
| `standard` | One synthesis worker |
| `adaptive` | Classifier selects simple synthesis, moderate logical analysis, or complex collaborative debate |
| `collaborative` | Independent creative/logical proposals, optional exchange, verification, synthesis |
| `adversarial` | Independent proposals, exchange, bounded proponent/opponent/judge rounds, synthesis |
| `research` | Adversarial workflow with an additional research worker |
| `execute` | Collaborative planning, authorized execution, evaluation |
| `human_judge` | 2–4 custom reasoning workers, persisted pause, human-confirmed questions/revisions/verdict |

Independent workers receive the decomposer's result, not peer proposals. Later nodes receive structured dependency findings. Verification is a model assessment, not independent proof; unresolved concerns and challenges remain in the report.

## Configuration

The contract is in `packages/schema/src/config/kidunexus.ts`; unsupported options are rejected.

| Setting | Default | Accepted range |
| --- | --- | --- |
| `max_concurrent_agents` | 4 | 1–8, per workflow |
| `max_iterations` | 2 | 1–3 |
| `max_debate_rounds` | 2 | 0–3 |
| `max_task_duration_seconds` | 600 | 5–3600 |
| `max_total_tokens` | 100000 | 1000–2000000 |
| `max_output_tokens` | 2048 | 256–16000, per worker request |
| `max_worker_steps` | 4 | 1–10 |
| `max_estimated_cost_usd` | unset | 0–100 |
| `allow_execution` | false | boolean |
| `cross_pollination` | true | boolean |
| `independent_verification` | true | boolean |

`independent_verification: false` omits standalone verification; debate judge nodes still assess arguments. `role_models` accepts partial overrides for `orchestrator`, `creative`, `logical`, `research`, `skeptic`, `proponent`, `opponent`, `verification`, `synthesis`, `execution`, and `evaluation`. Each value is a model reference such as `{ "providerID": "configured-provider", "id": "available-model" }`. Unspecified roles use the parent model. The initial graph does not schedule a separate skeptic node.

`fallback_models` accepts up to three model references; the current single retry uses only the first fallback. Reasoning nodes receive at most two attempts. Execution and evaluation nodes are never automatically retried. Across configuration documents, numeric ceilings take the lowest explicit value; explicit disable/deny settings prevail.

## Accounting and recovery

- Request reservations use UTF-8 input bytes plus an envelope allowance and capped output. They are conservative estimates, not exact tokenization or billing guarantees. Failed requests retain their reservations.
- Recorded worker usage is separate from reservations. Coordinator usage is excluded. Unknown model pricing is reported as unknown and prevents requests when an estimated cost ceiling is set.
- Reports checkpoint into existing KV; child sessions retain their normal histories. Parent-session deletion removes associated reports.
- Cancellation and deadlines interrupt active workers. A crash may leave a checkpoint marked running; `nexus_report` also exposes whether a workflow is active in the current process.
- Cleanly paused human-judge runs accept bounded follow-ups through `nexus_judge`. Crash-interrupted execution has no scheduler resume/replay command; inspect existing work before explicitly starting another run.
- Common secret patterns are redacted from findings. This is not comprehensive secret detection, and ordinary child-session history still persists according to existing Session behavior.

See [implementation status](implementation-report.md) and [benchmark protocol](benchmarks.md).
