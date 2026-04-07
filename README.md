# pi-gui

Electron desktop shell for `pi` sessions.

This repo packages a desktop UI around `@mariozechner/pi-coding-agent`. It is not a standalone coding agent runtime. The app depends on the upstream `pi` package for session management, model/auth setup, and agent execution.

![pi-gui demo](./docs/readme/demo.gif)

## Status

- Beta (macOS arm64, Linux x64 AppImage)
- Public source repo

## Install

### From GitHub Releases

Download the latest `.dmg` or `.AppImage` from [Releases](https://github.com/minghinmatthewlam/pi-gui/releases).

macOS releases are signed and notarized. Linux releases ship as AppImages.

### With Homebrew

Homebrew installation will be published from [`minghinmatthewlam/homebrew-tap`](https://github.com/minghinmatthewlam/homebrew-tap) once the first signed release artifacts are available.

```bash
brew tap minghinmatthewlam/tap
brew install --cask pi-gui
```

### From Source

See [Development](#development) below.

## What It Does

- Opens local workspaces in a desktop shell
- Lists and resumes `pi` sessions associated with each workspace
- Creates new sessions and sends prompts through the `pi` runtime
- Persists desktop UI state such as selected workspace, selected session, and composer draft

## Prerequisites

- Valid model/provider authentication supported by `pi`

On first launch, go to **Settings > Providers** to connect your AI provider via OAuth.

## Development

Install dependencies:

```bash
corepack enable
pnpm install
```

Run the desktop app in development:

```bash
pnpm dev
```

Build everything:

```bash
pnpm build
```

Run the default test suite:

```bash
pnpm test
```

Desktop E2E lanes and setup are documented in [`apps/desktop/README.md`](./apps/desktop/README.md). The default desktop test command runs the `core` lane; use `pnpm --filter @pi-gui/desktop run test:e2e:all` when you need `core`, `live`, and `native`.

Package a Linux AppImage locally:

```bash
pnpm --filter @pi-gui/desktop run package:linux
```

Production-like packaged-app checks:

```bash
pnpm --filter @pi-gui/desktop run test:prod:packaged-smoke
```

Release automation expects these GitHub Actions secrets for signed/notarized macOS builds:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Regenerate the README demo assets:

```bash
pnpm --filter @pi-gui/desktop demo:readme
```

## Repository Layout

- `apps/desktop`: Electron app and renderer UI
- `packages/session-driver`: shared session driver types
- `packages/catalogs`: lightweight workspace/session catalog state
- `packages/pi-sdk-driver`: adapter from the desktop app to `@mariozechner/pi-coding-agent`

## Known Limitations

- The app currently relies on upstream `pi` behavior and local auth state.
- Live end-to-end validation may require model credentials not stored in this repo.
- Package manifests remain `private: true`; this repo is intended for source collaboration first.

## Acknowledgements

- Built on top of [`@mariozechner/pi-coding-agent`](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)
- Upstream runtime and ecosystem by [`badlogic/pi-mono`](https://github.com/badlogic/pi-mono)

## License

MIT. See [LICENSE](./LICENSE).
