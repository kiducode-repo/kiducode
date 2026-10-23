# KiduCode Migration Context

## Current State

KiduCode is being migrated to the OpenCode 2.1.3 architecture in this isolated worktree:

```text
Kiducode-Cloud-Console/kiducode-cli/kiducode-opencode-sync
```

- Migration branch: `opencode-sync`
- Rollback branch: `pre-opencode-sync`
- Original KiduCode commit: `dbe569fd1a`
- Integrated OpenCode commit: `4535146139`
- The merge is staged but not committed.
- The original `kiducode-cli/kiducode` checkout and its local changes remain untouched.
- Do not modify the Cloud Console backend or frontend as part of this migration.

See `docs/kiducode-opencode-2.1.3-migration.md` for implementation details, verification results, known risks, and rollback commands.

## Scope Chosen

The selected OpenCode feature areas were:

1. Agent runtime and tools.
2. Desktop and web functionality, with KiduCode UI polish deferred.
3. Plugins and MCP.
4. Storage and API architecture.

At the earlier feature-grouping level, these represent approximately 36 major features and 88 medium enhancements.

## KiduCode Features Preserved

- Manglish prompt preprocessing and metadata.
- Google Antigravity provider, browser OAuth, headless OAuth, token refresh, project routing, and SSE transformation.
- Antigravity catalog entries for Gemini 3.8 Flash High/Medium/Low, Claude Sonnet 5.5, Claude Opus 5.5 Thinking, and retained Claude 4.6 models.
- File-scoped revert API on top of the current event-sourced snapshot implementation.
- KiduCode executable and build artifact identity.
- `KIDUCODE_*` environment compatibility.
- `kiducode.json`, `kiducode.jsonc`, and `.kiducode` discovery with OpenCode fallback.
- KiduCode XDG paths and database names with legacy OpenCode database fallback.
- KiduCode desktop identity, CORS origins, deep-link support, and built-in themes.
- The TUI homepage uses the KiduCode wordmark and product labels.
- Theme selectors expose only `mint-kiducode` and `orange-kiducode`; legacy upstream theme names remain hidden compatibility inputs in mini mode.
- Agent system context does not disclose the underlying model or provider.

## Areas Not Selected

These areas were not selected for KiduCode-specific completion:

### CLI And TUI Product Features

The upstream source is present because the architecture was integrated, but KiduCode-specific review and adaptation remain incomplete for:

- Persistent terminal panes.
- Multi-session tab behavior and tab history.
- Session movement and project-copy workflows.
- Prompt queueing, steering, and replay UX.
- Diff and review navigation.
- Pairing and remote connection UX.
- KiduCode copy, logo, shortcuts, and TUI visual identity.

### Provider And Model Expansion

Upstream providers are present, but KiduCode has not completed provider-specific validation for:

- Snowflake Cortex.
- Cerebras.
- Together AI.
- DeepInfra.
- Groq and Mistral.
- Alibaba, Meta, MiniMax, Moonshot, Z.AI, Venice, and Cohere.
- Ollama, LM Studio, and vLLM discovery.
- OpenAI WebSocket transport.
- Speech, transcription, image, PDF, and video workflows.

### Distribution And Releases

The upstream release infrastructure exists, but KiduCode-specific publication is not complete for:

- Installer and updater behavior.
- Homebrew, AUR, and WinGet.
- Stable and beta channels.
- Hosted update service and rollout controls.
- CLI and desktop release workflows.
- Checksums, signing, artifact naming, and repository destinations.

Do not publish a release until all distribution paths are reviewed against KiduCode repositories and package ownership.

## Deferred Work Within Selected Areas

- Complete the remaining desktop/web KiduCode copy, localization, logos, and visual polish beyond the migrated TUI homepage.
- Add a current-TUI selected-file revert dialog using the migrated `files: string[]` API.
- Live-test Antigravity browser login, headless login, refresh, project discovery, and inference with a disposable account.
- Verify the public OAuth client credentials are intended for installed-client distribution; rotate them otherwise.
- Test the Cloud Console runner image against the new CLI without changing Cloud Console source.
- Exercise restart recovery, background jobs, MCP, plugin loading, session migration, and database fallback in a realistic project.
- Build and smoke-test desktop installers on supported operating systems.
- Rehearse installer, updater, package publication, and release workflows.
- Review the full staged merge before committing and promoting it to `main`.

## Verification Already Completed

- Full repository check completed with 34 of 34 typecheck tasks successful and no lint errors.
- Core, CLI, Protocol, Server, Client, TUI, Desktop, and UI typechecks passed.
- Manglish, identity, selected-file revert, CORS, Antigravity transformation, and desktop packaging tests passed.
- Windows x64 `kiducode.exe` built and returned its version successfully.
- Source CLI help identifies KiduCode.
- No unresolved or untracked migration paths remain after staging.

## Safe Continuation

1. Work only in `kiducode-opencode-sync` until promotion is approved.
2. Confirm `git diff --name-only` is empty and `git diff --name-only --diff-filter=U` is empty before continuing.
3. Re-run focused tests after each change.
4. Run `bun run check` before promotion.
5. Do not rename internal `@opencode/*` packages, headers, Effect tags, or persisted compatibility keys without a migration requirement.
6. Do not commit, merge, or push until explicitly requested.

## Rollback

While the merge remains uncommitted:

```powershell
git -C "..\kiducode-opencode-sync" merge --abort
```

To remove the migration worktree afterward, run from `kiducode-cli/kiducode`:

```powershell
git worktree remove "..\kiducode-opencode-sync"
git branch -D opencode-sync
```

The original state remains available on `main` and `pre-opencode-sync` at `dbe569fd1a`.
