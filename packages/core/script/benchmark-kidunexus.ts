import { Schema } from "effect"
import { NexusBenchmark } from "../src/kidunexus/benchmark"

const file = Bun.argv[2]
if (!file || file === "--help") {
  console.log("Usage: bun run script/benchmark-kidunexus.ts <graded-samples.json>\nSummarizes recorded runs; does not call providers or fabricate task grades.")
} else {
  const samples = Schema.decodeUnknownSync(Schema.fromJsonString(NexusBenchmark.Samples))(await Bun.file(file).text())
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), results: NexusBenchmark.summarize(samples) }, null, 2))
}
