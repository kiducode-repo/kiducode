# KiduCode Rebranding Audit

Last updated: 2026-05-30

This audit separates OpenCode references that are currently useful for upstream compatibility from references that should be reviewed before KiduCode is published as an independent product.

## Status Summary

KiduCode is partially rebranded. The primary CLI command, root package name, database name, config schema URL, docs, and several runtime paths already use KiduCode. Many internal package names, service tags, SDK type names, environment flag names, and protocol names still use OpenCode terminology.

The current approach is valid if the goal is to stay mergeable with upstream OpenCode, but there are user-facing leftovers that should be cleaned up or explicitly documented.

## Safe Pass Completed

The following low-risk changes have been applied without removing OpenCode compatibility paths:

| Area | Change |
| --- | --- |
| Public OpenAPI copy | API group titles and upgrade endpoint copy now say KiduCode. |
| CORS | `*.kiducode.com` is allowed in addition to the legacy `*.opencode.ai` origin. |
| Server auth env | `KIDUCODE_SERVER_PASSWORD` and `KIDUCODE_SERVER_USERNAME` are accepted before legacy `OPENCODE_*` names in the server auth config. |
| Web fetch tool | Cloudflare fallback user agent now identifies as `kiducode`. |
| PR helper | Session import now tries `kiducode import` first and falls back to `opencode import`. |
| GitHub command logs | Runtime logs now say KiduCode instead of OpenCode where no protocol behavior changes. |

## Release Pass Completed

The following release-facing changes were applied after the safe pass:

| Area | Change |
| --- | --- |
| Publish workflow | Main publish workflow now targets `Aromal11534/Kiducode`, KiduCode CLI artifact names, and KiduCode desktop asset names. |
| CLI package | `packages/kiducode/package.json` is publishable with `private: false`. |
| Desktop build | Desktop build scripts now consume the KiduCode server build from `packages/kiducode`. |
| Desktop updater | Desktop build/runtime channel resolution accepts `KIDUCODE_CHANNEL` before legacy `OPENCODE_CHANNEL`. |
| Console downloads | Download routes and install snippets now point at KiduCode packages, assets, and repository URLs. |
| TUI home screen | The home prompt hides provider labels while leaving provider/model visibility available elsewhere. |

## Already Rebranded

| Area | Current state | Reference |
| --- | --- | --- |
| Root package | Root package is named `kiducode`. | `package.json` |
| CLI package | Main CLI package is named `kiducode`; binary is `kiducode`. | `packages/kiducode/package.json` |
| CLI script name | yargs script name is `kiducode`. | `packages/kiducode/src/index.ts` |
| Runtime env aliasing | `KIDUCODE_*` env vars are copied to legacy `OPENCODE_*` vars. | `packages/kiducode/src/index.ts` |
| Config files | Global config prefers `kiducode.jsonc` and `kiducode.json` before legacy OpenCode files. | `packages/kiducode/src/config/config.ts` |
| Project config | Project lookup supports both `kiducode.*` and legacy `opencode.*`. | `packages/kiducode/src/config/config.ts` |
| Data file | SQLite path prefers `kiducode.db` with legacy `opencode.db` fallback. | `packages/kiducode/src/storage/db.ts` |
| Install/upgrade user agent | Installation user agent starts with `kiducode`. | `packages/kiducode/src/installation/index.ts` |
| Main README | README describes KiduCode and states that OpenCode naming remains for mergeability. | `README.md` |
| Roadmap | Roadmap captures KiduCode-specific goals. | `KIDUCODE.md` |

## Intentional Compatibility Surface

Do not blindly rename these until publishing, upstream merge strategy, and external compatibility are decided.

| Area | Why it may stay temporarily | Reference |
| --- | --- | --- |
| Workspace package names like `@opencode-ai/core`, `@opencode-ai/sdk`, `@opencode-ai/ui` | Renaming would touch most imports and package dependencies. It creates large merge conflicts and may break plugin consumers. | `packages/*/package.json` |
| Type names like `createOpencodeClient`, `OpencodeClient`, `OpenCodeHttpApi` | These are SDK/API compatibility names. Rename only with SDK regeneration and compatibility review. | `packages/kiducode/src/cli/cmd/run.ts`, `packages/kiducode/src/server/routes/instance/httpapi/api.ts` |
| Effect service tags like `@opencode/Config` | Mostly internal tracing/service identifiers. Low user impact but broad churn. | `packages/kiducode/src/**/*.ts` |
| Legacy config paths `.opencode`, `opencode.json`, `opencode.jsonc` | Needed for migration and existing user configs. Keep as fallback even after KiduCode-first paths are stable. | `packages/kiducode/src/config/*` |
| Legacy environment flags `OPENCODE_*` | Useful for backwards compatibility. Prefer adding `KIDUCODE_*` primary names while keeping `OPENCODE_*` fallback. | `packages/core/src/flag/flag.ts` |
| HTTP headers like `x-opencode-directory`, `x-opencode-workspace`, `x-opencode-ticket` | SDK/protocol compatibility. Add `x-kiducode-*` aliases first if changing. | `packages/kiducode/src/server/**` |
| Bundler defines like `OPENCODE_VERSION`, `OPENCODE_MIGRATIONS`, `OPENCODE_WORKER_PATH` | Internal compile-time constants. Rename only with full build/test coverage. | `packages/kiducode/script/build.ts` |

## User-Facing Cleanup Candidates

These should be prioritized because they are visible to users, generated docs, install paths, CI, or external integrations.

| Priority | Issue | Suggested direction | Reference |
| --- | --- | --- | --- |
| P0 | GitHub Action generated workflow still needed KiduCode repository wiring. | Completed in release pass: generated workflow now uses `Aromal11534/Kiducode/github@latest`. | `packages/kiducode/src/cli/cmd/github.ts` |
| P0 | GitHub Action package and standalone action still says `opencode` and invokes `opencode`. | Decide whether this action is still supported in KiduCode. If yes, rename action metadata, command, trigger phrases, API URLs, and bot identity. | `github/action.yml`, `github/index.ts` |
| P0 | CI publish workflow still targets `anomalyco/opencode`, `packages/opencode`, and `opencode-*` artifacts. | Completed in release pass for the main publish workflow. Review other automation workflows separately. | `.github/workflows/publish.yml` |
| P0 | Review, triage, and automation workflows install/run `opencode`. | Convert to `kiducode` or mark as upstream-only workflows. | `.github/workflows/review.yml`, `.github/workflows/triage.yml`, `.github/workflows/opencode.yml` |
| P1 | API docs titles still say `opencode experimental HttpApi`. | Completed in safe pass; preserve internal type names unless a later SDK migration changes them. | `packages/kiducode/src/server/routes/instance/httpapi/groups/*.ts` |
| P1 | Server mDNS name is `opencode-${port}`. | Change to `kiducode-${port}` or publish both names temporarily. | `packages/kiducode/src/server/mdns.ts` |
| P1 | CORS allowlist still explicitly accepts `*.opencode.ai`. | Completed in safe pass: `*.kiducode.com` was added while keeping `*.opencode.ai`. | `packages/kiducode/src/server/cors.ts` |
| P1 | Server auth config only reads `OPENCODE_SERVER_PASSWORD` and `OPENCODE_SERVER_USERNAME` through Effect config. | Completed in safe pass: `KIDUCODE_*` is primary with `OPENCODE_*` fallback. | `packages/kiducode/src/server/auth.ts` |
| P1 | Provider flow fetches `/.well-known/opencode`. | Decide whether KiduCode should use `/.well-known/kiducode`, keep OpenCode for provider compatibility, or support both. | `packages/kiducode/src/cli/cmd/providers.ts`, `packages/kiducode/src/config/config.ts` |
| P1 | Tool web fetch user agent is `opencode`. | Completed in safe pass: changed to `kiducode`. | `packages/kiducode/src/tool/webfetch.ts` |
| P1 | PR command tries `opencode import` before launching KiduCode. | Completed in safe pass: tries `kiducode import` first and falls back to `opencode import`. | `packages/kiducode/src/cli/cmd/pr.ts` |
| P2 | Default TUI sound pack is `opencode.default`. | Decide whether this is a stable plugin ID or should become `kiducode.default`. | `packages/kiducode/src/cli/cmd/tui/attention.ts`, `packages/kiducode/src/cli/cmd/tui/config/tui.ts` |
| P2 | Managed config directories use `/etc/opencode`, `/Library/Application Support/opencode`, and `ProgramData/opencode`. | Add KiduCode managed config directories first, keep OpenCode as fallback. | `packages/kiducode/src/config/managed.ts` |
| P2 | Tests and fixtures still use `opencode-test-*` temp prefixes and `opencode.json` examples. | Low priority. Rename only when test churn is acceptable. | `packages/kiducode/test/AGENTS.md` |

## Package Naming Inventory

KiduCode-named packages currently include:

| Package | Reference |
| --- | --- |
| `kiducode` | `package.json`, `packages/kiducode/package.json`, `sdks/vscode/package.json` |
| `@kiducode/desktop` | `packages/desktop/package.json` |
| `@kiducode/web` | `packages/web/package.json` |

OpenCode-named packages currently include:

| Package family | Reference |
| --- | --- |
| `@opencode-ai/core`, `@opencode-ai/sdk`, `@opencode-ai/ui`, `@opencode-ai/plugin`, `@opencode-ai/script`, `@opencode-ai/llm` | `packages/*/package.json` |
| `@opencode-ai/app`, `@opencode-ai/storybook`, `@opencode-ai/slack`, `@opencode-ai/enterprise`, `@opencode-ai/function` | `packages/*/package.json` |
| `@opencode-ai/console-*` | `packages/console/*/package.json` |

Recommendation: keep `@opencode-ai/*` package names until the public package namespace strategy is decided. A package rename should be done as a dedicated migration, not mixed with user-facing copy changes.

## Environment Variable Strategy

Current state:

| Current behavior | Reference |
| --- | --- |
| `packages/kiducode/src/index.ts` copies all `KIDUCODE_*` env values into matching `OPENCODE_*` keys if unset. | `packages/kiducode/src/index.ts` |
| `packages/core/src/flag/flag.ts` exposes properties still named `OPENCODE_*`, but most read `KIDUCODE_*` first and `OPENCODE_*` second. | `packages/core/src/flag/flag.ts` |
| Some Effect `Config.string(...)` reads still target only `OPENCODE_*`. | `packages/kiducode/src/server/auth.ts` |

Recommended policy:

| Rule | Notes |
| --- | --- |
| Public docs should advertise `KIDUCODE_*`. | This establishes KiduCode as primary. |
| Runtime should keep accepting `OPENCODE_*`. | This preserves migration compatibility. |
| Internal property names can remain `OPENCODE_*` short-term. | Rename later only if it reduces confusion without massive churn. |
| Add tests for alias precedence. | `KIDUCODE_*` should win unless an explicit `OPENCODE_*` value is already set by compatibility code. |

## Config And Data Migration Strategy

Recommended policy:

| Area | Recommendation |
| --- | --- |
| Config files | Prefer `kiducode.jsonc` and `kiducode.json`; keep `opencode.jsonc` and `opencode.json` fallback. |
| Config directories | Prefer `.kiducode`; keep `.opencode` fallback. |
| Global config | Prefer KiduCode global file creation; keep OpenCode file loading. |
| SQLite DB | Keep current `kiducode.db` with `opencode.db` fallback. Add a migration note before changing any path behavior. |
| Managed config | Add KiduCode paths before OpenCode paths. Do not remove OpenCode managed paths without a migration period. |

## Suggested Cleanup Order

1. Fix release-blocking workflow references in `.github/workflows/publish.yml` or disable upstream-only publishing.
2. Decide the KiduCode GitHub Action story and update `github/action.yml`, `github/index.ts`, and `packages/kiducode/src/cli/cmd/github.ts` together.
3. Update public API docs titles and user-facing messages that say `opencode` but do not affect protocol compatibility.
4. Add KiduCode protocol aliases for server auth env vars, mDNS names, CORS origins, and `x-kiducode-*` headers while retaining legacy names.
5. Update low-risk strings such as user agents, test temp prefixes, demo fixture output, and docs examples.
6. Only after release flows are stable, decide whether to rename `@opencode-ai/*` workspace packages or keep them indefinitely as compatibility internals.

## Guardrails

Do not perform a global search-and-replace from `opencode` to `kiducode`. Many references are package names, protocol names, migration fallbacks, compatibility flags, or upstream merge anchors.

Prefer additive compatibility changes first: add KiduCode names as primary, keep OpenCode names as fallback, then document deprecation timing if a legacy name will ever be removed.

Any change to SDK names, HTTP headers, package names, database paths, or config lookup order should include tests and a migration note.
