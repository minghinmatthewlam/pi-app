# Driver Guidelines

Apply these rules for changes under `packages/pi-sdk-driver/`.

- Keep this package a thin compatibility layer over `pi-mono`; reuse `pi` session/runtime behavior instead of reimplementing it.
- Preserve event ordering and per-session isolation; desktop parallel sessions must not bleed state across sessions.
- Treat session config as session-local unless `pi` itself defines broader scope.
- Prefer cache-first desktop reopen behavior; raw session-log reprocessing is a fallback, not the default path.
- Don’t pull desktop-only presentation concerns into driver contracts unless they are required for correctness.
