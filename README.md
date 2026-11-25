# <img src="docs/kiducode-wordmark.svg" alt="KiduCode" width="320">

KiduCode is an open-source AI coding agent built in Kerala. Run it in your terminal to explore a codebase, plan a change, edit files, and run project checks with the model you choose.

## Install the CLI

Download the archive for your operating system and processor from the [KiduCode releases page](https://github.com/kiducode-repo/kiducode/releases/latest). Releases include macOS and Linux builds for x64 and arm64, and a Windows x64 build.

Extract the archive and put `kiducode` (or `kiducode.exe` on Windows) in a directory on your PATH. From the project you want to work on, run:

```sh
kiducode
```

In the terminal interface, use `/connect` to connect a provider and `/models` to choose a model.

## Work with the agent

- Use **Plan** to investigate a question and review a proposed change.
- Use **Build** to edit files and run project checks.
- Use **Crew** to delegate parts of a larger task to worker agents. See the [Crew guide](docs/crew-mode.md).
- Enable **KiduNexus** to try experimental workflows with multiple models and human review. See the [KiduNexus guide](docs/kidunexus/README.md).

## Run from source

Install Bun 1.4.4, then run these commands from the repository root:

```sh
bun install --frozen-lockfile
bun run dev
```

Pass a project directory to `bun run dev` to open it. For development and testing instructions, see [Contributing to KiduCode](CONTRIBUTING.md). Report CLI bugs and request features in the [KiduCode issue tracker](https://github.com/kiducode-repo/kiducode/issues).

## Project history and license

KiduCode builds on [OpenCode](https://github.com/anomalyco/opencode) and its contributors' work. The repository includes the upstream commit history, so GitHub's contributor list includes authors from both projects. KiduCode is distributed under the [MIT license](LICENSE).
