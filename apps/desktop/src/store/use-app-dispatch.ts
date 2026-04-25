import { useMemo } from "react";
import type { PiDesktopApi } from "../ipc";
import type { DesktopAppState } from "../desktop-state";
import { appStore } from "./app-store";

/**
 * Returns the live `window.piApp` surface. Most state-mutating methods on the
 * main process emit `stateChanged` after applying their effect, which the
 * store subscription picks up automatically — so callers can fire-and-forget
 * (`void dispatch.pickWorkspace()`) and the UI will update.
 *
 * For paths that *do* care about the returned state synchronously (e.g.
 * optimistic UI), use `applyStateFromIpc(returnedState)` to push it to the
 * store ahead of the IPC echo, or call the method, await the result, and
 * call `appStore.applyState(result)`.
 */
export function useAppDispatch(): PiDesktopApi {
  return useMemo(() => {
    const api = window.piApp;
    if (!api) {
      // Renderer in a context without preload (e.g. test harness without
      // preload). Return a throwing stub.
      return new Proxy({} as PiDesktopApi, {
        get() {
          throw new Error("window.piApp is not available");
        },
      });
    }
    return api;
  }, []);
}

/** Apply a snapshot returned from an IPC call directly to the store. */
export function applyStateFromIpc(state: DesktopAppState): void {
  appStore.applyState(state);
}
