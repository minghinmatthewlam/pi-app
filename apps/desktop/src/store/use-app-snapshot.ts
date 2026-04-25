import { useCallback, useRef, useSyncExternalStore } from "react";
import type { DesktopAppState } from "../desktop-state";
import { appStore } from "./app-store";

/**
 * Subscribe to a slice of the app snapshot.
 *
 * Selector contract:
 *  - The selector MUST be pure and side-effect free.
 *  - Selectors that return primitives or stable references work with the
 *    default `Object.is` equality.
 *  - Selectors that derive a fresh object/array on every call MUST pass a
 *    custom `equality` function (e.g. `shallowEqualArray`) — otherwise this
 *    hook will trigger unbounded re-renders, because `useSyncExternalStore`
 *    bails out of an update only when the new value is `Object.is` equal to
 *    the prior one.
 *  - Better still: keep selectors flat (return one field at a time) and do the
 *    derivation inside the consumer with `useMemo` keyed on `state.revision`
 *    plus the source slice. That way the derivation runs at most once per
 *    revision, and per-render selector calls stay free.
 */
export function useAppSnapshot<T>(
  selector: (state: DesktopAppState | null) => T,
  equality: (a: T, b: T) => boolean = Object.is,
): T {
  // Cache the last (snapshot, result) pair so we don't re-run the selector on
  // every React render. useSyncExternalStore calls the snapshot getter on
  // every render to compare against the prior value; without caching, an
  // inline selector that returns a fresh object would loop.
  const cacheRef = useRef<{
    snapshot: DesktopAppState | null;
    result: T;
    initialized: boolean;
  }>({ snapshot: null, result: undefined as never, initialized: false });

  const getSnapshot = useCallback(() => {
    const snapshot = appStore.getSnapshot();
    const cached = cacheRef.current;
    if (cached.initialized && cached.snapshot === snapshot) {
      return cached.result;
    }
    const next = selector(snapshot);
    if (cached.initialized && equality(cached.result, next)) {
      // Snapshot reference changed but the selected value didn't; keep the
      // prior result so React bails out of the re-render.
      cached.snapshot = snapshot;
      return cached.result;
    }
    cacheRef.current = { snapshot, result: next, initialized: true };
    return next;
  }, [selector, equality]);

  return useSyncExternalStore(appStore.subscribe, getSnapshot, getSnapshot);
}

export function shallowEqualArray<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

export function shallowEqualObject(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}
