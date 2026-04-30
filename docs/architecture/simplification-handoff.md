# Architecture Simplification — Handoff

For the next agent picking up this work after PR #16 (`Phase 0+1 simplification: hygiene + renderer selector store + worktree isolation`) lands.

This is a **briefing**, not a plan. The intent is for you to re-audit the relevant surfaces in their post-PR-#16 state, decide what still applies, and produce your own plan via `plan-loop`. Codebases drift; numbered findings below are anchors for verification, not prescriptions.

---

## Context

A full read-only `audit-loop` against `pi-gui` (~24k LOC, Electron desktop shell around `@mariozechner/pi-coding-agent`) identified 12 simplification candidates ranked by `confidence × impact`. The audit was native-Claude only — Codex MCP was unavailable for cross-model review the entire session (rejected every model the ChatGPT account could reach with `"gpt-5.5 model requires a newer version of Codex"`). Recommend re-running with a working Codex CLI before committing to the structural moves below.

**The product invariants you must preserve** (from CLAUDE.md):
- Codex-style streaming feel — transcript deltas must not cause UI jank.
- Per-session isolation — parallel sessions must not bleed state across each other.
- Verify on the real Electron surface (Playwright lanes), not just unit tests.
- `pi-sdk-driver` should stay a thin compatibility layer over `pi-mono`; don't reimplement pi runtime behavior.

---

## What PR #16 shipped (8 commits)

| Wave | Commit | What |
|---|---|---|
| P0.1 | `chore(driver): delete unused vendor session-driver.d.ts` | 454 LOC ambient `declare module` shadow deleted; verified zero refs across imports + `<reference>` directives + tsconfig include |
| P0.2 | `refactor(electron): consolidate window-activation event wiring` | 3 near-duplicate `trackWindow` blocks share `WindowActivationTracker`. Per-subsystem instances; subsystems own their own seed-on-attach. notification-permission's app-level `activate` + `browser-window-focus` listeners stay in place |
| P0.3 | `refactor(electron): centralize git subprocess + harden argv with -- separator` | `git-runner.ts` owns `execFile`. `runGit` returns `{ ok, stdout, stderr, error }` (never throws) so `getFileDiff` fallback chain stays explicit. Per-call-site maxBuffer preserved. `--` argv separator + `assertNoLeadingDash` defense-in-depth on user-supplied positional args to git |
| P1.1 | `feat(renderer): add selector-based app store + hooks` | `useSyncExternalStore`-backed singleton wrapping the existing IPC subscriptions. `useAppSnapshot(selector, equality?)` caches per-render to avoid re-running selectors. Module-scope memoized derivation helpers in `derived.ts` |
| P1.2 | `refactor(renderer): migrate Sidebar + Topbar to selector store` | Combined wave (shared `wsMenu`). Sidebar drops 9 props, Topbar drops 11. **Note: caught a real bug here** — the initial `useAppDispatch` Proxy implementation broke `contextBridge` function dispatch for `window.toggleWindowMaximize`. Simplified to passthrough; trust `onStateChanged` IPC subscription to keep store synced |
| P1.3 | `refactor(renderer): migrate ConversationTimeline to selector store` | Reads transcript via `useSelectedTranscript()`, derives `isTranscriptLoading` internally |
| P1.4 (reduced) | `refactor(renderer): migrate ComposerPanel snapshot reads to selector store` | ComposerPanel reads selectedSession / lastError / runtime / attachments / queuedComposerMessages / editingQueuedMessageId via selectors. **Composer textarea (`composerDraft` + `setComposerDraft`) deliberately remains controlled-from-App.tsx** to preserve the in-flight typing race protection at `App.tsx:779-800` verbatim |
| QoL | `feat(desktop): auto-isolate Electron userData per git worktree in dev` | `dev.mjs` detects worktree, sets `PI_APP_USER_DATA_DIR=~/.pi-gui-worktrees/<sha1-hash>`. Multiple worktrees can run concurrently without singleton-lock collision |

**Architectural goal achieved by P1.x:** Sidebar / Topbar / ConversationTimeline / ComposerPanel each subscribe to disjoint snapshot slices via the selector store. Transcript deltas no longer fan out to non-timeline components. Selector-store contract documented inline (selectors must return primitives or memoize derivations in the consumer; `shallowEqualArray` / `shallowEqualObject` helpers exported).

**Unaddressed audit items (that's the rest of this doc).**

---

## Audit findings (anchors — verify against current state, don't assume)

Numbers are from the original audit; file paths / line numbers reflect state before PR #16.

### S1 (highest leverage, deferred to Phase 2) — collapse `SessionStateMap` + `ManagedSessionRecord` into one `Session` type

- `apps/desktop/electron/session-state-map.ts:35-50` holds **16 unrelated `Map<sessionKey, X>`** indexed by `${workspaceId}:${sessionId}` strings. Pruning is manual (`prune()`/`deleteSession()`); adding any new per-session field touches multiple sites.
- `packages/pi-sdk-driver/src/session-supervisor.ts:90-118` has **`ManagedSessionRecord` with 18 fields**. `syncRecordAfterSessionMutation` (`session-supervisor.ts:1244-1251`) reassigns ~7 fields after every navigateTree/compact/reload — manual invariant maintenance, easy to miss a field.

**Why deferred:** highest-leverage, highest-risk. Per-session isolation is a CLAUDE.md product invariant. A long-lived `Session` reference held across an `await` and then mutated after a session switch silently breaks isolation. Mitigation pattern: keep the `selectionEpoch` guards (`apps/desktop/electron/app-store.ts:151,308`); forbid storing `Session` references outside the SessionService.

### S2 — composer state collapse (six places → one source of truth)

After PR #16, composer state still lives in:
1. `state.composerDraft` (global current, in DesktopAppState)
2. `sessionState.composerDraftsBySession` (per-session, in SessionStateMap)
3. `sessionState.composerAttachmentsBySession` (per-session)
4. `attachmentStore` on disk (per-session)
5. `QueuedComposerEditState.restoreDraft/restoreAttachments` (snapshot for cancel)
6. App.tsx local `composerDraft` `useState` (still controlled-from-App.tsx — the deferred P1.4 piece)

Most of this falls out of S1 once `Session` exists.

### S4 — split `app-store.ts` by responsibility, retire `AppStoreInternals`

- `apps/desktop/electron/app-store.ts` is ~2434 LOC, ~129 method-like definitions, owns mutable `state` + 16-Map `SessionStateMap` + 3 listener sets.
- Method-group files (`app-store-workspace.ts`, `-worktree.ts`, `-composer.ts`, `-timeline.ts`, `-utils.ts`) communicate via an `AppStoreInternals` interface (`app-store-internals.ts:24`) that re-exposes nearly every private of `DesktopAppStore`. **Split is by file, not responsibility** — every method group depends on the entire store surface.
- Pattern target: `SessionService` / `ComposerService` / `TimelineService` / `RuntimeService`, each owning its slice with a narrow public surface. `main.ts` wires IPC handlers to services.

### S6 — extract extension-UI bridge from `session-supervisor.ts`

- `packages/pi-sdk-driver/src/session-supervisor.ts` is 1980 LOC. Contains:
  - `createExtensionUiContext` — 150 LOC at lines 838-1020
  - `mapAgentEvent` — 86 LOC with record state mutations at lines 1289-1388
  - Per-record FIFO event queue via Promise chaining (lines 1269-1277)
  - Dialog promise factory with timeout/abort (lines 841-891)
  - Queued-message reconciliation
  - Model resolution / thinking-level clamping
- AGENTS.md says "thin compatibility layer over pi-mono" — it isn't.
- Cuts ~250 LOC from the supervisor; clear seam.

### S8 — scroll restoration

- `apps/desktop/src/App.tsx` has 11 useRefs forming an ad-hoc scroll-restoration state machine (scroll top, pinned, bottom alignment, deferred alignment, pending behavior, etc.).
- Timeline virtualization has a hack: `disableTimelineVirtualization` flips on first load when prose > 2000 chars or attachments are present, then re-enables (App.tsx:190, 1976; conversation-timeline.tsx:50-57).
- Likely path: evaluate `react-virtuoso` (built-in stick-to-bottom + pin-on-scroll-up) vs. encapsulating the existing logic behind a single hook. The streaming-feel risk requires manual smoke before merge regardless.

### S10 — push `SettingsManager` private-method casts upstream into `pi-mono`

- `packages/pi-sdk-driver/src/runtime-supervisor.ts:134-152` casts `SettingsManager` to `unknown` to call private methods. Right fix is upstream: a real `setProjectSetting` API in pi-mono. Out-of-repo work; don't block on it.

### S11 — macOS notification permission test seams

- `apps/desktop/electron/notification-permission.ts` is 359 LOC, spawns a macOS native helper, polls 20×500ms. Test mode driven by 4 env vars + a mutable `testPermissionStatus` global. Replace with injectable doubles.

### S12 — collapse `session-driver` export entry points

- `packages/session-driver` exports `.`, `/types`, `/runtime-types`. Split exists but isn't enforced at consumers. Verify-then-collapse — only safe if runtime-only code doesn't leak into the renderer bundle.

---

## Deferred from Phase 1 tail (fold into Phase 2)

These were in the R2 plan but deliberately deferred because they pair naturally with S1:

- **`useSlashMenu` / `useMentionMenu` `DraftHandle` rewrite.** 446-LOC `apps/desktop/src/hooks/use-slash-menu.tsx`. Today both hooks take `composerDraft`, `setComposerDraft`, `setSnapshot`, `updateSnapshot` as parameters — coupling them to App.tsx's state shape. Plan was to introduce a `DraftHandle` interface (`getDraft`, `setDraft(value, syncSource)`, `dispatch`) with separate handle implementations for the live composer (uncontrolled-with-ref + nonce-bump) vs new-thread (local state). Each consumer constructs its own.
- **New-thread fields → local `useState` inside `NewThreadView`.** Today at App.tsx:147-155: `newThreadPrompt`, `newThreadProvider`, `newThreadModelId`, `newThreadThinkingLevel`, `newThreadEnvironment`, `newThreadAttachments`, `newThreadComposerError`, `pendingNewThreadWorkspaceId`, `newThreadRootWorkspaceId`. All consumed exclusively by `NewThreadView` + `newThreadSlashMenu`; reset on view exit; no IPC persistence. Move into `NewThreadView` as `useState`.
- **Composer textarea uncontrolled-with-ref + nonce-gated external sync.** Today the threads composer is controlled from App.tsx and the existing nonce/source machinery at App.tsx:779-800 (`composerDraftSyncSource` + `composerDraftSyncNonce`) protects the in-flight typing race. Plan: relocate the same conditions verbatim into a `use-composer-sync.ts` hook inside `ComposerPanel`; make the textarea uncontrolled with `composerRef`. The race protection is load-bearing — `apps/desktop/tests/core/composer-draft-sync.spec.ts` ("ignores stale persisted draft acknowledgements while typing") is the gate. Don't switch without preserving the conditions.
- **`useDesktopAppState` + `updateSnapshot` removal in App.tsx.** Currently blocked by remaining `setSnapshot` consumers in slash/mention/workspace-menu hooks. Lands once their `DraftHandle`/dispatch migration completes. Final grep gate: `grep -rn "setSnapshot\|updateSnapshot\|useDesktopAppState" apps/desktop/src` returns zero hits in non-deleted code.
- **Optional: `streaming-render-isolation.spec.ts`.** Originally planned as a dev-only render-counter probe asserting Sidebar/Topbar re-render ≤ 2 times per N transcript deltas. Deferred — the per-selector subscription model enforces the guarantee structurally. Manual smoke covers it. If you want belt-and-suspenders, build a probe gated by `process.env.NODE_ENV !== "production"` AND a body data-attr set only by the test harness (so production bundle is unaffected).

---

## Recommended phasing

This is one suggestion. You may decide differently after re-auditing.

**Phase 2 (highest leverage):** S1 + S2 + S4 + Phase 1 deferred tail, as one branch with multiple commits.
- Rationale: S1 dissolves about half the audit. S2 falls out of S1. S4 needs S1 first or it just shuffles dependencies. The deferred Phase 1 tail (`DraftHandle`, new-thread relocation, composer uncontrolled-with-ref, `useDesktopAppState` removal) pairs naturally because they all touch composer state coordination.
- Risk gate: parallel-runs / extension-session-isolation / queued-messages live lanes pass; `composer-draft-sync` core lane passes (the nonce machinery must survive); manual streaming smoke against a real `pi` run.
- Don't ship behind a feature flag — small enough codebase, single consumer (the desktop app), better to do it as one structural pass than maintain two state shapes.

**Phase 3 (medium leverage, parallel small PRs):**
- S6 — extract extension-UI bridge from `session-supervisor.ts`.
- S8 — scroll restoration / `react-virtuoso` evaluation.
- S11 — notification permission test seams.
- S12 — verify-then-collapse session-driver entry points (after bundle check).
- S10 — push SettingsManager API upstream into pi-mono (track separately; not blocking).

---

## Process notes

- **Pre-existing test flakes (not regressions):** `apps/desktop/tests/core/unread-state.spec.ts:52` and `provider-settings.spec.ts:117` fail on the pre-PR-#16 baseline (commit `fa3ab2f`). Don't waste time chasing them — they're load-bearing-bug-free in the sense that they pre-date this work. Investigate separately if you want them green.
- **Out-of-band test bug:** `apps/desktop/tests/core/worktrees.spec.ts:144` asserts `.toBe(true)` after a worktree-removal flow. Looks like a pre-existing bug — workspace should not exist after removal. Flagged but not silently fixed in PR #16. Either fix it independently or be aware that the worktree-remove path isn't actually verified by that assertion.
- **Verification surface = real Electron under Playwright.** Existing core/live lanes follow user-action → user-visible-result. For changes that touch state coordination, run `test:live:parallel-runs` and `test:live:extensions-session-isolation` *during* the wave that introduces them, not in a final cleanup wave — bisecting later is harder.
- **Worktree-isolated dev launches now Just Work** (per the QoL commit). Run `pnpm dev` in any worktree; each gets its own `~/.pi-gui-worktrees/<hash>` userData. Useful when running multiple agents on different feature branches in parallel.
- **Codex MCP cross-model coverage was unavailable** for the entire prior session. If you can get it working (try restarting Claude Code so the bundled MCP wrapper picks up your updated standalone `codex` CLI), use it — the audit + plan reviews benefit from a non-Claude voice.

---

## Suggested first move

Run `audit-loop` against the post-PR-#16 surface, scoped to:
- `apps/desktop/electron/app-store.ts` + method-group files + `session-state-map.ts`
- `packages/pi-sdk-driver/src/session-supervisor.ts` + `runtime-supervisor.ts`
- `apps/desktop/src/App.tsx` (residual local-shadow state + the slash/mention/workspace-menu hooks)
- `apps/desktop/src/hooks/use-slash-menu.tsx`, `use-mention-menu.tsx`

Validate which findings still apply, what the actual line numbers are now, and which are best to bundle. Then `plan-loop` for Phase 2 with whatever scope you decide.

Don't trust the line numbers above — verify. Don't trust the priorities above — re-rank with fresh eyes. The codebase has changed; your judgment on the current state is what matters.
