# KiduCode OpenCode 2.1.3 Migration

## Purpose

This migration updates the isolated KiduCode CLI repository to OpenCode 2.1.3 architecture while preserving KiduCode-specific behavior. It does not modify the Cloud Console backend or frontend.

## Repositories And Recovery Points

- Original checkout: `kiducode-cli/kiducode`
- Migration worktree: `kiducode-cli/kiducode-opencode-sync`
- Migration branch: `opencode-sync`
- Original KiduCode commit: `dbe569fd1a`
- Rollback branch: `pre-opencode-sync`
- Previous synchronization base: `430e3db423`
- Integrated OpenCode commit: `4535146139`

The original checkout and its uncommitted changes were not modified. At migration start those changes were:

- `bun.lock`
- `packages/kiducode/package.json`
- `packages/kiducode/src/session/system.ts`

## Upstream Systems Integrated

- Event-sourced session runtime, durable inbox, background execution, compaction, and current tool runtime.
- Current desktop and web application functionality. KiduCode-specific UI redesign is deferred.
- Current plugin host, provider plugins, typed hooks, MCP runtime, and plugin management.
- Current SQLite storage, typed Protocol/Server APIs, and generated clients.

## KiduCode Features Preserved

### Product And Runtime Identity

- Root project metadata identifies KiduCode while internal `@opencode/*` package names remain for upstream compatibility.
- The CLI exposes `kiducode` and builds `kiducode-*` artifacts.
- `KIDUCODE_*` environment variables are translated to legacy `OPENCODE_*` variables before CLI modules initialize.
- KiduCode uses its own XDG data, cache, config, state, log, temporary, and repository directories.
- `kiducode.json`, `kiducode.jsonc`, and `.kiducode` are discovered alongside their OpenCode compatibility names.
- KiduCode database names are used, with an existing OpenCode database selected as a migration fallback.
- KiduCode web origins and `kiducode://renderer` are accepted in addition to legacy OpenCode origins.

### Manglish

- The existing lightweight Manglish normalizer now runs at current durable prompt admission.
- The original and normalized instructions remain available in `kiducodeManglish` metadata.
- Set `KIDUCODE_MANGLISH_PREPROCESS=0` to disable preprocessing.

### Google Antigravity

- Browser and headless OAuth methods are registered through the current integration system.
- OAuth refresh, account-project discovery, model routing, gateway request wrapping, and streaming response unwrapping are ported to the current provider plugin system.
- Project discovery is cached per access token and failed lookups are evicted.
- The catalog includes Gemini 3.8 Flash High/Medium/Low, Claude Sonnet 5.5, Claude Opus 5.5 Thinking, and the retained Claude 4.6 models.
- The existing distributed-client OAuth credentials remain in source. They must be reviewed and rotated if they are not intended to be public installed-app credentials.

### File-Scoped Revert

- Upstream's event-sourced snapshot/revert implementation remains authoritative.
- The revert-stage API now accepts `files: boolean | string[]`.
- A selected path list reverts only those files while preserving unselected edits.
- Generated clients were regenerated from the Protocol definition.
- The old KiduCode selection dialog was not copied into the new TUI because UI work is deferred; the API capability is available for the later UI implementation.

### Other Preserved Behavior

- Model/provider identity is omitted from agent system context.
- `mint-kiducode` and `orange-kiducode` remain available as built-in GUI themes.
- KiduCode desktop product names, application IDs, artifact names, CLI package coordinates, and deep-link scheme are defined while the legacy `opencode` deep-link scheme remains accepted.
- The TUI homepage restores the original six-row KiduCode ASCII wordmark, theme-colored outline, wide-screen spacing, highlighted Tip row, and KiduCode product labels.
- Full TUI and GUI theme selectors expose only the original `mint-kiducode` and `orange-kiducode` themes.
- Previous Git caches were not ported because upstream session affinity and caching supersede them, while the old unbounded caches could become stale.

### Cloud Console Runner Compatibility

- Legacy unprefixed runner endpoints are implemented as an adapter over the current event-sourced runtime.
- Legacy message/model payloads and response envelopes are translated without changing Cloud Console callers.
- The compatibility SSE route exposes top-level `sessionID` and delta fields plus the historical `properties` object.
- Docker-mode requests bypass Basic authentication only for the exact legacy runner routes.
- `OPENCODE_AUTH_CONTENT`, `OPENCODE_PURE`, and external-skill suppression are restored for isolated runners.
- Model-executed shell commands use a filtered environment and `setpriv` demotion in Docker isolation mode.
- The old `packages/kiducode/src/index.ts` invocation forwards to the current CLI entrypoint.

## Verification

The following checks passed during migration:

- Core typecheck.
- CLI typecheck.
- Protocol typecheck.
- Server typecheck.
- Client typecheck after generation.
- TUI typecheck.
- Desktop typecheck.
- UI typecheck.
- Manglish unit tests.
- Identity plugin tests.
- Session revert tests, including selected-file preservation.
- Server CORS tests.
- Desktop packaging configuration tests.
- Full `bun run check`: completed with 34/34 typecheck tasks successful and no lint errors. The imported upstream tree reports existing advisory lint warnings.
- Windows x64 CLI smoke build and execution: the generated `kiducode.exe --version` completed successfully.
- Source CLI help smoke test: usage, executable name, root description, upgrade, uninstall, and run commands identify KiduCode.
- Exact legacy Cloud runner startup and unauthenticated `/global/health` smoke test completed successfully in Docker isolation mode.

## Deferred Work And Known Risks

- Remaining desktop/web KiduCode copy, localization, logos, and visual polish are intentionally deferred.
- The new TUI still needs a selected-file revert dialog wired to the migrated API.
- Antigravity OAuth and inference require live validation with a disposable account; static checks cannot prove external gateway compatibility.
- Installer, updater, package publication, and all release workflows need an end-to-end release rehearsal before publishing 2.1.3-based artifacts.
- Legacy desktop data should remain readable before any existing OpenCode storage keys or internal protocol names are renamed.
- The Cloud Console runner image must be tested against the new CLI artifact before changing its pinned runner revision.
- Cloud runner source-lock and Docker capability configuration remain deployment-owned; the CLI cannot update those without modifying Cloud Console files.

## Rollback

No rollback operation should touch the original dirty checkout.

To abandon the migration completely, run these commands from `kiducode-cli/kiducode` after ensuring no needed work exists only in the migration worktree:

```powershell
git -C "..\kiducode-opencode-sync" merge --abort
git worktree remove "..\kiducode-opencode-sync"
git branch -D opencode-sync
```

The original code remains available on `main` and at `pre-opencode-sync`:

```powershell
git switch main
git diff pre-opencode-sync
```

If the migration is committed later and an individual migration commit causes a regression, use a normal revert commit rather than rewriting shared history:

```powershell
git revert <commit>
```

Before replacing `main`, create a release tag on the old version and verify that `pre-opencode-sync` still resolves to `dbe569fd1a`.

## Promotion Checklist

1. Run the full repository check and focused test suites.
2. Build and smoke-test the Windows CLI artifact.
3. Test Antigravity browser login, headless login, refresh, and one inference request.
4. Start the Cloud Console development runner with the new CLI without modifying Cloud Console source.
5. Exercise session creation, prompt streaming, MCP, plugins, revert, restart recovery, and database migration.
6. Build the desktop package and verify KiduCode identity and sidecar startup.
7. Review the complete range diff against `pre-opencode-sync`.
8. Commit and promote only after the remaining known risks are accepted or resolved.
