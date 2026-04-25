import { useMemo } from "react";
import type { PiDesktopApi } from "../ipc";
import type { DesktopAppState } from "../desktop-state";
import { appStore } from "./app-store";

/**
 * Returns a frozen object mirroring the `window.piApp` surface. Methods that
 * resolve to a `DesktopAppState` (the dispatch-pattern ones) automatically
 * apply the returned state to the store before returning. Other methods pass
 * through unchanged.
 */
export function useAppDispatch(): PiDesktopApi {
  return useMemo(() => buildDispatch(), []);
}

function buildDispatch(): PiDesktopApi {
  const api = window.piApp;
  if (!api) {
    // Renderer in a context without preload (test harness, SSR). Return a
    // proxy that throws on use; the caller code should be guarded by an
    // `if (!api)` check anyway.
    return new Proxy({} as PiDesktopApi, {
      get() {
        throw new Error("window.piApp is not available");
      },
    });
  }

  return new Proxy(api, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }
      // Wrap callables so a returned DesktopAppState is applied to the store.
      // We can't statically know which methods return state at this layer, so
      // we apply heuristically: if the result is a Promise that resolves to an
      // object with a `revision` field, treat it as a snapshot.
      return (...args: unknown[]) => {
        const result = (value as (...a: unknown[]) => unknown).apply(target, args);
        if (result instanceof Promise) {
          return result.then((resolved) => {
            if (isDesktopAppState(resolved)) {
              appStore.applyState(resolved);
              return resolved;
            }
            // Methods like navigateSessionTree return { state, result }; apply
            // the embedded state when present.
            if (
              resolved !== null &&
              typeof resolved === "object" &&
              "state" in resolved &&
              isDesktopAppState((resolved as { state: unknown }).state)
            ) {
              appStore.applyState((resolved as { state: DesktopAppState }).state);
            }
            return resolved;
          });
        }
        return result;
      };
    },
  });
}

function isDesktopAppState(value: unknown): value is DesktopAppState {
  return (
    value !== null &&
    typeof value === "object" &&
    "revision" in value &&
    typeof (value as { revision: unknown }).revision === "number" &&
    "workspaces" in value &&
    Array.isArray((value as { workspaces: unknown }).workspaces)
  );
}
