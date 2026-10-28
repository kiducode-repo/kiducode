# Implementation report

Status: experimental end-to-end increment, 2026-10-28. The complete requested subsystem is not yet implemented.

## Delivered

- Native Nexus agent and tools using existing Session, model, permission, plugin, KV, and progress infrastructure.
- Validated configuration with partial role-model overrides and restrictive resource-ceiling composition.
- Bounded dependency graph, independent proposals, exchange, adversarial rounds, model verification, synthesis, and optional execution/evaluation.
- Per-workflow concurrency, request reservations, worker-step and deadline limits, bounded reasoning retries, and cancellation finalizers.
- Runtime worker tool allowlists and originating-policy checks; recursive orchestration and detached shell requests are blocked.
- Persisted reports, source/node provenance, normalized exact-text hypothesis deduplication, unresolved issues, and TUI progress/expandable graph output.
- Deterministic real-session integration including an approved file edit and actual passing Bun test, plus a blocked injected reasoning-worker write.
- Benchmark task descriptions, typed grading inputs, and aggregation tooling.

## Verification

Commands run from their respective package directories on Windows with Bun 1.4.4:

| Check | Result |
| --- | --- |
| Core: `bun run script/test.ts test/kidunexus.test.ts test/kidunexus-integration.test.ts test/agent.test.ts test/tool-subagent.test.ts` | 38 passed, 0 failed; 255 assertions |
| TUI: `bun test --timeout 30000 test/component/nexus-progress.test.tsx` | 2 passed, 0 failed; widths 44 and 100 |
| Client: `bun run generate` | Passed after configuration schema update |
| Repository: `bun run check` | Passed |

Interactive TUI smoke testing was unavailable because `termctrl` was not installed. Renderer tests cover progress and wrapping, not the complete interactive session experience. No live-provider benchmark was run.

## Remaining acceptance gaps

- Crash-safe resumable scheduling and recovery ownership are absent; checkpoints support inspection only. Interrupted side effects must not be blindly replayed.
- Retry attempts retain child sessions, but the report node points to the latest attempt and does not contain a complete attempt/error lineage.
- Budgets cover estimated worker requests, not exact end-to-end tokens or billed spending. Concurrency is bounded per workflow, not globally across all parent sessions.
- Model routing is role override plus first fallback, not learned/adaptive quality, latency, or cost optimization.
- Hypothesis deduplication is normalized exact text, not semantic clustering. Verification does not mechanically prove claims or guarantee cited sources were checked.
- Durable approved knowledge and cross-run learning are absent.
- Benchmark execution and complete reproducible ablation fixtures remain incomplete; no measured quality or efficiency advantage is claimed.
- The TUI has progress and expandable text graph/report output. Dedicated web/desktop views and per-node pause, resume, reroute, and retry controls are absent.
- Redaction and filename read restrictions are limited safeguards, not a comprehensive secret-isolation boundary. Approved shell commands retain ordinary host capabilities.

The next implementation increment should address durable attempt provenance and explicit interrupted-run recovery, then executable benchmark fixtures and independently graded live comparisons.
