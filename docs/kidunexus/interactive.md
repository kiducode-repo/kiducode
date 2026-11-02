# Interactive Nexus: human judge and worker panes

Enable `kidunexus.enabled` in the project configuration, select a connected model, and open a session.

## Start a run

Cycle into **Nexus** with **Shift+Tab** to open setup directly. Esc cancels setup and continues to the next agent in the cycling direction, preserving your existing prompt. `/nexus` reopens the same dialog; dismissing that shortcut keeps your current agent.

In setup:

1. Choose manual assignments or ask the coordinator to propose a plan.
2. Choose **Human judge** or **Autonomous synthesis**.
3. For manual setup, select 2, 3, or 4 workers, their roles, connected models, and individual objectives.
4. Enter the overall task. Setup submits the request to the Nexus coordinator.
5. Review the native confirmation form before any workers start. Cancel and reopen `/nexus` to change the plan.

The agent-driven path uses `nexus_models` to discover available model references. `nexus_run` validates assignments and resolves omitted models before asking for plan confirmation. Both setup paths use the same runtime and permission gates.

## Split view and judge console

Two workers appear side by side. Three or four workers use two rows, with an empty fourth cell for a three-worker plan. Terminals narrower than 72 content columns stack the panes; short viewports scroll. Each pane has a model label, recorded token count, status, public response stream, and tool activity. Select its header to inspect the native child session.

### Chat Mode vs. Agent Logs

By default, the panes display in **Chat Mode**, rendering worker speech naturally rather than showing raw JSON objects:

- `💬 Position`: the core argument or rebuttal.
- `📌 Core Arguments`: bulleted claims with sources.
- `🔍 Evidence Cited`: excerpts and direct source references.
- `⚔️ Challenges to Peer`: explicit counter-arguments addressing peer claims.
- `⚖️ Verification` and `❓ Open Questions`: verification checks and remaining uncertainties.
- During generation, live partial summaries stream as readable text rather than raw JSON syntax.

Click **`[📋 Agent logs]`** (or press **T** in `/nexus-judge`) to switch to **Agent logs**, which displays the raw JSON envelope and raw tool executions (`[tool: ... · completed]`). Click **`[💬 Chat mode]`** to return to the conversational view.

### Peer Communication

Workers talk to each other via explicit graph dependencies. When a worker depends on earlier nodes (e.g. `agent2` opponent depending on `agent1` proponent), `agent1`'s public findings are passed directly into `agent2`'s handoff under `untrusted_peer_findings` alongside peer context instructions to address, challenge, and counter `agent1`'s exact propositions.

`/nexus-view` toggles the grid. `/nexus-judge` opens the judge console. Within that console:

- **1–4:** inspect a worker.
- **T:** toggle Chat Mode / Agent logs view.
- **Q:** ask a follow-up question.
- **R:** request revision.
- **V:** deliver a final verdict, optionally identifying a winning worker.
- **C:** cancel the paused run.

Question/revision/verdict/cancel actions become available at the `awaiting_judge_input` boundary. Choose a worker or all workers, then enter guidance or a decision. The coordinator relays it through `nexus_judge`; a native confirmation form requires the human to approve the exact action. During active generation, use the normal session interrupt control to stop work.

Keyboard shortcuts are scoped to the judge dialog so typing in the normal prompt is unaffected. Panes show public output, not private reasoning content. A verdict records the human's decision and retains unresolved concerns; it does not prove a claim or authorize edits.

## Runtime contracts

`nexus_run` accepts:

```json
{
  "task": "Compare two designs and identify failure modes",
  "mode": "human_judge",
  "judge": "human",
  "nodes": [
    { "id": "design", "role": "creative", "task": "Propose alternatives" },
    { "id": "audit", "role": "skeptic", "task": "Challenge assumptions", "dependencies": ["design"] }
  ]
}
```

Each node may specify `model: { "providerID": "...", "id": "...", "variant": "..." }`. Omitted models resolve from role configuration, then the parent model. Dependencies must refer to earlier nodes. IDs are unique, start with a letter, and contain at most 40 letters, digits, underscores, or hyphens.

Allowed roles are `creative`, `logical`, `research`, `skeptic`, `proponent`, `opponent`, `verification`, and `synthesis`. Custom workers remain reasoning-only. Use a separate explicitly authorized `execute` run to implement an accepted proposal. With `judge: "model"`, custom workers feed an automatic synthesis; with `human_judge`, no automatic synthesis or verdict is scheduled.

`nexus_judge` accepts the saved run `id`, `action` (`question`, `revise`, `verdict`, or `cancel`), optional `target` worker ID, and `feedback`. It only acts on a paused human-judge report belonging to the current parent session.

Follow-ups create fresh child sessions for the selected logical workers and pass their previous findings plus the human feedback. Prior nodes and sessions remain inspectable. The report records the decision history, original policy agent, effective limits, and cumulative reservations. The grid switches each logical worker's pane to its latest child session.

## Troubleshooting failed workers

A provider quota rejection (for example HTTP 429 / free usage limit reached) fails the worker and skips workers that depend on it. The report and progress card retain the provider's error message. Select a model with available quota before starting a new run. Automatic plans prefer the parent-selected model unless you request another model; discovery does not verify remaining provider quota.

Progress metadata omits unavailable worker session/model fields so pending and skipped workers remain JSON-serializable. Regression coverage runs both successful and rate-limited dependent-worker workflows through the parent Session runner, then inspects the persisted tool outcomes and report.

Worker step and reservation-budget limits end the workflow with a saved `limited` report. Completed findings remain inspectable, unfinished nodes stop, and dependent pending nodes are skipped. These expected limits are recovered at the worker-session boundary; unrelated defects and interruptions are not converted into limit reports. Parent-runner regressions cover both limits and subsequent report inspection.

## Bounds and persistence

- `max_iterations` includes the initial round: the default of 2 permits one follow-up round; the maximum of 3 permits two. Verdict/cancel remain available after this allowance is used.
- Token/cost reservations accumulate across follow-ups and cannot be reset by issuing another judge action.
- The original wall-clock deadline includes time spent awaiting human input. An expired run starts no additional workers. A human can still record a final verdict or cancel a paused run.
- Progress, including `awaiting_judge_input`, uses existing tool progress events. KV stores the authoritative report; no additional server or event protocol is introduced.
- A cleanly paused run can be inspected with `nexus_report` and continued through `nexus_judge`, including after reconnecting. Inspecting a report restores its split-view metadata.
- Crash-interrupted running nodes are not replayed. This extension does not implement general crash recovery or exactly-once execution.

## Verification

Deterministic tests cover custom graph validation, human pause without automatic synthesis, targeted follow-up provenance, revision/deadline limits, plan and verdict refusal, same-session report access, cumulative reservations, real child sessions, public SSE transcript updates, run isolation, manual setup with connected models, judge keyboard routing, and 2/3/4-worker layouts at narrow/wide widths.

Verified on Windows with Bun 1.4.4:

| Check                                                                                                                                                                                              | Result                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Core: `bun run script/test.ts test/kidunexus.test.ts test/kidunexus-integration.test.ts test/agent.test.ts test/tool-subagent.test.ts`                                                             | 42 passed, 290 assertions |
| TUI: `bun test --timeout 30000 test/component/nexus-progress.test.tsx test/component/nexus-split-grid.test.tsx test/component/dialog-nexus-setup.test.tsx test/component/nexus-workspace.test.tsx` | 11 passed, 58 assertions  |
| Client: `bun run generate`                                                                                                                                                                         | Passed                    |
| Repository: `bun run check`                                                                                                                                                                        | Passed                    |
| Repository: `git diff --check`                                                                                                                                                                     | Passed                    |

Live-provider reasoning quality and an installed-terminal smoke test were not measured. The live-stream and keyboard checks above use the real TUI components with deterministic server fixtures.
