# Desktop Test Guidelines

Apply these rules under `apps/desktop/tests/`.

- Use the lane scripts in `apps/desktop/package.json` before inventing ad hoc Playwright commands.
- Pick the smallest lane that matches the changed surface:
- `core`: background-friendly UI flows inside the Electron window. Default for renderer, sidebar, composer, session, persistence, and worktree UI changes.
- `live`: real provider/runtime runs. Use for transcript, tool-call, parallel-run, and notification behavior that depends on actual agent execution.
- `native`: macOS OS-surface flows such as folder pickers, image pickers, and real clipboard paste. These are foreground-only and focus-sensitive.
- `production`: opt-in higher-fidelity smokes such as real-auth `live`, packaged-app launch, and real macOS open-panel coverage. Keep these out of the default `core` and `native` globs so fast lanes stay stable.
- `pnpm --filter @pi-gui/desktop run test:e2e` currently runs only `core`. Use `test:e2e:all` only when you need all lanes.
- For `native`, prefer the targeted native spec by default. Expand to `test:e2e:native` only when the change touches shared native helpers, multiple native specs, or lane-wide native behavior.
- Keep `tests/production` behind dedicated scripts or direct `test:e2e:runner` invocations; do not place those specs under `tests/core` or `tests/native`.
- Prefer repo lanes over manual Computer Use. If the local Codex skill `$pi-gui-computer-use-smoke` is installed, use it only for release-readiness sweeps on the real installed app or for focus-hostile native surfaces where Playwright is the wrong proof shape.
- The reasoning is the same as the global agent philosophy: optimize for tools plus clear success criteria, not ad hoc manual steps. Playwright remains the deterministic regression signal; Computer Use is an opt-in complement for believable real-surface proof.
- Prefer shared helpers in `tests/helpers/electron-app.ts`; extend them instead of adding a second harness or new IPC glue.
- Simulate user behavior through Playwright first. Do not add IPC/state shortcuts for visible behavior unless the product surface does not exist yet; if you need one, document the gap in the spec.
- `pasteTinyPng()` proves the renderer paste handler and is suitable for background/core coverage.
- `pasteTinyPngViaClipboard()` proves real Electron clipboard paste and belongs in foreground/native coverage.
- Native failures can be environmental. Before treating a native failure as a product regression, rerun with a clean foreground window and no competing keyboard or mouse input.
- Real-auth `live` specs must opt in explicitly via `PI_APP_REAL_AUTH=1` plus `PI_APP_REAL_AUTH_SOURCE_DIR=/absolute/path/to/agent`; otherwise they should skip cleanly.
