# Benchmark protocol

No live-provider quality, cost, or latency improvements have been measured. Deterministic TestLLM integration tests validate runtime behavior only.

`benchmark-tasks.json` contains task descriptions and grading criteria, not a complete executable fixture suite. `packages/core/script/benchmark-kidunexus.ts` aggregates externally recorded and graded samples; it does not run tasks or perform ablations.

From `packages/core`:

```sh
bun run script/benchmark-kidunexus.ts graded-samples.json
```

The input is an array conforming to `NexusBenchmark.Samples` in `src/kidunexus/benchmark.ts`. Each sample records task, repetition, system, policy identifier, source revision, runtime, a Nexus report, success, test/claim/verification/recovery counts, and nonempty grading evidence. Unknown costs remain null. Completion alone is not a passing grade.

## Procedure for future measured runs

1. Freeze repository fixtures, dependency versions, model access, tool permissions, and resource ceilings. Record these in the policy identifier and preserve the full configuration with artifacts.
2. Run each task repeatedly under single-agent, collaborative, and Nexus configurations. Use identical fixtures and independent grader tests. Capture the parent coordinator's usage separately because current reports contain worker usage only.
3. Collect no-mindstorm, no-debate, no-verification, no-cross-pollination, and no-adaptive ablations. These labels are accepted by the aggregator but are not automatic execution switches. Verify the actual resulting graph for each run; disabling standalone verification does not remove debate judges.
4. Grade sources and claims independently of model consensus. Record supporting artifacts, test output, unauthorized actions, and induced failures.
5. Aggregate only comparable task/repetition sets and inspect per-task outcomes. The aggregator rejects mixed policy identifiers and duplicate samples, but cannot verify policy truthfulness or enforce balanced experimental groups.

Metrics include success rate, test pass rate, assessed verification accuracy, unsupported-claim rate, estimated worker cost per success, worker tokens, mean latency, coordination-node count, and failure recovery rate. Coordination-node count is a structural proxy, not measured orchestration overhead. Report missing evidence and unknown pricing rather than imputing zero.

Automated provider execution, executable benchmark fixtures, paired statistical analysis, and complete ablation support remain future work.
