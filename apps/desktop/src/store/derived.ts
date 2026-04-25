import type {
  DesktopAppState,
  WorkspaceRecord,
  WorktreeRecord,
} from "../desktop-state";
import { buildThreadGroups, type ThreadGroup } from "../thread-groups";

/**
 * Memoized helpers that compute derived collections from a snapshot. Each
 * helper holds a single-slot cache keyed on its input *references*, so
 * consumers can call `useMemo([state.revision], () => buildThreadGroupsCached(...))`
 * and rely on referential stability when the underlying slices haven't changed.
 *
 * Why module-scope and not per-instance: the snapshot is a singleton (one
 * desktop window owns one state). Caching at module scope lets multiple
 * components share the same derived result without recomputation.
 */

interface ThreadGroupsCache {
  workspaces: readonly WorkspaceRecord[];
  worktreesByWorkspace: Readonly<Record<string, readonly WorktreeRecord[]>>;
  lastViewedAtBySession: Readonly<Record<string, string>>;
  workspaceOrder: readonly string[];
  result: readonly ThreadGroup[];
}
let threadGroupsCache: ThreadGroupsCache | null = null;

export function buildThreadGroupsCached(state: DesktopAppState): readonly ThreadGroup[] {
  const cache = threadGroupsCache;
  if (
    cache &&
    cache.workspaces === state.workspaces &&
    cache.worktreesByWorkspace === state.worktreesByWorkspace &&
    cache.lastViewedAtBySession === state.lastViewedAtBySession &&
    cache.workspaceOrder === state.workspaceOrder
  ) {
    return cache.result;
  }
  const result = buildThreadGroups(state);
  threadGroupsCache = {
    workspaces: state.workspaces,
    worktreesByWorkspace: state.worktreesByWorkspace,
    lastViewedAtBySession: state.lastViewedAtBySession,
    workspaceOrder: state.workspaceOrder,
    result,
  };
  return result;
}
