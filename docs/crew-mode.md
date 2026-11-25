# Crew mode

Crew is KiduCode's collaborative primary agent, selectable alongside Build and Plan in the agent picker. It uses the currently selected model as coordinator and the existing subagent runtime for workers.

## How it works

- Small tasks stay with the coordinator to avoid delegation overhead.
- For larger tasks, the coordinator assesses complexity, discovers available models and their catalog prices, and chooses models for focused planning, implementation, or review.
- Explore workers handle read-only research and review; General workers can implement changes. Independent work can run in parallel; overlapping edits should be serialized.
- Worker model IDs and variants are validated against available models by the existing subagent tool. Existing permissions, child-session lifecycle, and depth limits still apply.
- Without a model override, workers use their configured model or inherit the coordinator's model. Crew also works with a single connected model.

Example requests:

> Implement this feature in Crew mode. Prefer cheaper models for exploration, and use a stronger model only if the implementation needs it.

> Investigate the backend and frontend independently, then integrate the fix. Keep workers from editing the same files.

## Configuration

Crew uses the existing agent configuration. For example, make it the default in `kiducode.json`:

```json
{
  "default_agent": "crew"
}
```

The existing `agents.crew` settings can customize its coordinator model, instructions, permissions, and step allowance. Selecting Crew authorizes automatic worker model selection; ordinary agents still require an explicit model request before supplying a worker override.

## Current limits

Routing and task decomposition are model-driven instructions, not a deterministic optimizer. The coordinator is responsible for discovering prices and selecting suitable workers. Catalog pricing may not reflect subscription billing, and missing prices must not be treated as free.

Crew does not currently enforce a dollar budget or guarantee token savings. Its guidance to use at most two initial parallel workers is a prompt policy, not a scheduler limit. User budget preferences guide decisions but are not hard spending caps. Worker sessions share the project location; Crew does not create isolated worktrees automatically.
