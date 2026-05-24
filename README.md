# KiduCode

KiduCode is a Kerala-built open-source AI coding agent, forked from OpenCode, designed for local-first developer workflows and future Manglish/Malayalam prompt support.

**Naadan prompts. Production code.**

Website: https://kiducode.com

## Status

This repository is being rebranded from the official OpenCode upstream into an independent KiduCode fork. Some internal package names, implementation paths, and compatibility references may still use OpenCode naming while the fork stays mergeable with upstream.

## Installation

```bash
# TODO: Update hosted install script after kiducode.com deployment is ready.
curl -fsSL https://kiducode.com/install | bash

# Package managers, after package publishing is configured
npm i -g kiducode@latest
```

## Usage

```bash
kiducode --help
kiducode serve
kiducode web
kiducode <directory>
```

During development from this repository:

```bash
bun install
bun dev --help
bun dev serve
bun dev web
bun dev <directory>
```

## KiduCode Focus

KiduCode will build on the OpenCode agent runtime while adding local-first workflows and Malayalam/Manglish-aware developer ergonomics for Kerala developers.

Planned areas include:

- Manglish prompt preprocessing
- Malayalam/Manglish explanation mode
- Kerala-focused developer templates
- Local-first provider configuration
- Team and enterprise-ready deployment options

See [KIDUCODE.md](./KIDUCODE.md) for the roadmap.

## Disclaimer

KiduCode is an independent open-source fork of OpenCode. It is not affiliated with, endorsed by, or sponsored by the OpenCode team, Anomaly, or the original OpenCode maintainers. Original OpenCode license notices and attribution are preserved where required.

## Upstream

KiduCode repo
https://github.com/Aromal11534/Kiducode.git

We may periodically merge upstream changes while maintaining KiduCode-specific branding and features.

Original upstream project: https://github.com/anomalyco/opencode

## License

KiduCode preserves the original OpenCode license attribution. See [LICENSE](./LICENSE).
