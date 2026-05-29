import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.KIDUCODE_CHANNEL ?? process.env.OPENCODE_CHANNEL ?? "dev"}`

await $`cd ../kiducode && bun script/build-node.ts`
