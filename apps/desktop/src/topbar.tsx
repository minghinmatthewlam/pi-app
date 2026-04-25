import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import { getSelectedSession, getSelectedWorkspace, type AppView, type WorktreeRecord } from "./desktop-state";
import { DiffIcon, FolderIcon } from "./icons";
import type { WorkspaceMenuState } from "./hooks/use-workspace-menu";
import { useAppDispatch, useAppSnapshot, shallowEqualArray } from "./store";
import { resolveRepoWorkspaceId } from "./workspace-roots";

interface TopbarProps {
  readonly wsMenu: WorkspaceMenuState;
  readonly showDiffPanel: boolean;
  readonly onToggleDiffPanel: () => void;
}

export function Topbar({ wsMenu, showDiffPanel, onToggleDiffPanel }: TopbarProps) {
  const dispatch = useAppDispatch();

  const activeView = useAppSnapshot((state) => state?.activeView ?? "threads") as AppView;
  const workspaces = useAppSnapshot(
    (state) => state?.workspaces ?? EMPTY_WORKSPACES,
  );
  const selectedWorkspace = useAppSnapshot(
    (state) => (state ? getSelectedWorkspace(state) ?? state.workspaces[0] : undefined),
  );
  const selectedSession = useAppSnapshot(
    (state) => (state ? getSelectedSession(state) ?? getSelectedWorkspace(state)?.sessions[0] : undefined),
  );
  const worktreesByWorkspace = useAppSnapshot(
    (state) => state?.worktreesByWorkspace ?? EMPTY_WORKTREE_MAP,
  );

  const rootWorkspace = useMemo(() => {
    if (!selectedWorkspace) return undefined;
    const id = resolveRepoWorkspaceId(workspaces, selectedWorkspace.id);
    return id ? workspaces.find((workspace) => workspace.id === id) ?? selectedWorkspace : selectedWorkspace;
  }, [workspaces, selectedWorkspace]);

  const activeWorktrees = useAppSnapshot<readonly WorktreeRecord[]>(
    (state) => {
      if (!state || !rootWorkspace) return EMPTY_WORKTREES;
      return state.worktreesByWorkspace[rootWorkspace.id] ?? EMPTY_WORKTREES;
    },
    shallowEqualArray,
  );

  const linkedWorktreeForSelection = useMemo(() => {
    if (!selectedWorkspace) return undefined;
    return Object.values(worktreesByWorkspace)
      .flat()
      .find((worktree) => worktree.linkedWorkspaceId === selectedWorkspace.id);
  }, [worktreesByWorkspace, selectedWorkspace]);

  const sessionExtensionUi = useAppSnapshot((state) => {
    if (!state || !selectedWorkspace || !selectedSession) return undefined;
    return state.sessionExtensionUiBySession[`${selectedWorkspace.id}:${selectedSession.id}`];
  });
  const selectedSessionTitle = sessionExtensionUi?.title ?? selectedSession?.title;

  const handleDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.closest(".topbar__actions")) {
      return;
    }
    void dispatch.toggleWindowMaximize();
  };

  return (
    <header className="topbar" data-testid="topbar" onDoubleClick={handleDoubleClick}>
      <div className="topbar__title">
        <span className="topbar__workspace">
          {rootWorkspace ? rootWorkspace.name : "Open a folder to begin"}
        </span>
        {selectedWorkspace && activeView === "threads" ? (
          <>
            <span className="topbar__separator">/</span>
            <div className="environment-picker" ref={wsMenu.environmentMenuRef}>
              <button
                aria-expanded={wsMenu.environmentMenuOpen}
                aria-haspopup="menu"
                className="environment-picker__button"
                type="button"
                onClick={() => wsMenu.setEnvironmentMenuOpen((current) => !current)}
              >
                {selectedWorkspace.kind === "worktree"
                  ? linkedWorktreeForSelection?.name ?? selectedWorkspace.name
                  : "Local"}
              </button>
              {wsMenu.environmentMenuOpen && rootWorkspace ? (
                <div className="workspace-menu environment-picker__menu">
                  <button
                    className="workspace-menu__item"
                    type="button"
                    onClick={() => wsMenu.selectWorkspace(rootWorkspace.id)}
                  >
                    Local
                  </button>
                  {activeWorktrees.map((worktree) => {
                    const linkedWorkspace = workspaces.find(
                      (workspace) => workspace.id === worktree.linkedWorkspaceId,
                    );
                    const worktreeSelectable = Boolean(linkedWorkspace) && worktree.status === "ready";
                    return (
                      <button
                        className="workspace-menu__item"
                        key={worktree.id}
                        type="button"
                        disabled={!worktreeSelectable}
                        onClick={() => {
                          if (worktreeSelectable && linkedWorkspace) {
                            wsMenu.selectWorkspace(linkedWorkspace.id);
                          }
                        }}
                      >
                        {worktree.name}
                        {!worktreeSelectable ? ` (${worktree.status !== "ready" ? worktree.status : "unavailable"})` : ""}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        {selectedWorkspace && activeView === "threads" && selectedSession ? (
          <>
            <span className="topbar__separator">/</span>
            <span className="topbar__session">{selectedSessionTitle ?? selectedSession.title}</span>
          </>
        ) : activeView === "new-thread" && rootWorkspace ? (
          <>
            <span className="topbar__separator">/</span>
            <span className="topbar__session">New thread</span>
          </>
        ) : null}
      </div>

      <div className="topbar__actions">
        <button
          aria-label="Toggle diff panel"
          className={`icon-button topbar__icon ${showDiffPanel ? "icon-button--active" : ""}`}
          type="button"
          onClick={onToggleDiffPanel}
        >
          <DiffIcon />
        </button>
        <button
          aria-label="Add folder"
          className="icon-button topbar__icon"
          type="button"
          onClick={() => {
            void dispatch.pickWorkspace();
          }}
        >
          <FolderIcon />
        </button>
      </div>
    </header>
  );
}

const EMPTY_WORKSPACES: readonly never[] = [];
const EMPTY_WORKTREES: readonly never[] = [];
const EMPTY_WORKTREE_MAP: Readonly<Record<string, readonly never[]>> = {};
