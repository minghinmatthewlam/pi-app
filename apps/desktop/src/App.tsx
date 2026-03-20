import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  getSelectedSession,
  getSelectedWorkspace,
  type DesktopAppState,
  type SessionRecord,
  type WorkspaceRecord,
} from "./desktop-state";

function useDesktopAppState() {
  const [snapshot, setSnapshot] = useState<DesktopAppState | null>(null);

  useEffect(() => {
    let active = true;
    const api = window.piApp;
    if (!api) {
      return undefined;
    }

    void api.getState().then((state) => {
      if (active) {
        setSnapshot(state);
      }
    });

    const unsubscribe = api.onStateChanged((state) => {
      if (active) {
        setSnapshot(state);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return [snapshot, setSnapshot] as const;
}

function statusLabel(status: SessionRecord["status"]): string {
  if (status === "running") return "running";
  if (status === "failed") return "error";
  return "idle";
}

function formatRelativeTime(value: string): string {
  if (!value) {
    return "";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return new Date(timestamp).toLocaleDateString();
}

function updateSnapshot(
  api: NonNullable<typeof window.piApp>,
  setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>,
  action: () => Promise<DesktopAppState>,
) {
  return action().then((state) => {
    setSnapshot(state);
    return state;
  });
}

function Icon({ children }: { readonly children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      {children}
    </svg>
  );
}

function PlusIcon() {
  return (
    <Icon>
      <path d="M10 4.25v11.5M4.25 10h11.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </Icon>
  );
}

function FolderIcon() {
  return (
    <Icon>
      <path
        d="M2.75 6.5a1.75 1.75 0 0 1 1.75-1.75h3.1l1.5 1.7h6.4a1.75 1.75 0 0 1 1.75 1.75v5.3a1.75 1.75 0 0 1-1.75 1.75H4.5a1.75 1.75 0 0 1-1.75-1.75V6.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </Icon>
  );
}

function RefreshIcon() {
  return (
    <Icon>
      <path
        d="M15.75 7.25A5.75 5.75 0 1 0 17 10.89M15.75 4.75v2.5h-2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </Icon>
  );
}

function ClockIcon() {
  return (
    <Icon>
      <circle cx="10" cy="10" r="6.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.8v3.55l2.3 1.35" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </Icon>
  );
}

function SparkIcon() {
  return (
    <Icon>
      <path
        d="m10 3.1 1.55 3.66 3.66 1.55-3.66 1.55L10 13.5l-1.55-3.64L4.8 8.3l3.65-1.55L10 3.1Zm5 8.6.72 1.58 1.58.72-1.58.72L15 16.3l-.72-1.58-1.58-.72 1.58-.72.72-1.58Z"
        fill="currentColor"
      />
    </Icon>
  );
}

function SlidersIcon() {
  return (
    <Icon>
      <path
        d="M4 5.75h12M4 10h12M4 14.25h12M7 4v3.5M12.5 8.25v3.5M9 12.5V16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.55"
      />
    </Icon>
  );
}

function SettingsIcon() {
  return (
    <Icon>
      <path
        d="M8.8 3.6h2.4l.4 1.6 1.5.62 1.42-.85 1.7 1.7-.86 1.43.63 1.5 1.6.4v2.4l-1.6.4-.63 1.5.86 1.43-1.7 1.7-1.42-.85-1.5.62-.4 1.6H8.8l-.4-1.6-1.5-.62-1.42.85-1.7-1.7.86-1.43-.63-1.5-1.6-.4v-2.4l1.6-.4.63-1.5-.86-1.43 1.7-1.7 1.42.85 1.5-.62.4-1.6Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.25"
      />
      <circle cx="10" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.25" />
    </Icon>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useDesktopAppState();
  const [composerDraft, setComposerDraft] = useState("");
  const api = window.piApp;

  const selectedWorkspace = snapshot ? (getSelectedWorkspace(snapshot) ?? snapshot.workspaces[0]) : undefined;
  const selectedSession = snapshot ? (getSelectedSession(snapshot) ?? selectedWorkspace?.sessions[0]) : undefined;
  const selectedSessionKey = `${selectedWorkspace?.id ?? ""}:${selectedSession?.id ?? ""}`;

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    setComposerDraft(snapshot.composerDraft);
  }, [selectedSessionKey, snapshot]);

  useEffect(() => {
    if (!api || !snapshot || composerDraft === snapshot.composerDraft) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      void updateSnapshot(api, setSnapshot, () => api.updateComposerDraft(composerDraft));
    }, 350);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [api, composerDraft, setSnapshot, snapshot]);

  if (!api || !snapshot) {
    return (
      <div className="shell shell--loading">
        <main className="loading-card">
          <div className="loading-card__eyebrow">pi-app</div>
          <h1>Loading sessions</h1>
          <p>The desktop shell is restoring folder and thread state from the main process.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__top">
          <button
            className="sidebar__new"
            type="button"
            disabled={!selectedWorkspace}
            onClick={() => {
              if (!selectedWorkspace) {
                return;
              }
              void updateSnapshot(api, setSnapshot, () =>
                api.createSession({ workspaceId: selectedWorkspace.id, title: "New thread" }),
              );
            }}
          >
            <PlusIcon />
            <span>New thread</span>
          </button>

          <nav className="rail" aria-label="Primary">
            <button className="rail__item rail__item--active" disabled type="button">
              <FolderIcon />
              <span>Threads</span>
            </button>
            <button className="rail__item" disabled type="button">
              <ClockIcon />
              <span>Automations</span>
            </button>
            <button className="rail__item" disabled type="button">
              <SparkIcon />
              <span>Skills</span>
            </button>
          </nav>
        </div>

        <div className="sidebar__section">
          <div className="section__head">
            <span>Threads</span>
            <div className="section__tools">
              <button
                aria-label="Open folder"
                className="icon-button"
                type="button"
                onClick={() => {
                  void updateSnapshot(api, setSnapshot, () => api.pickWorkspace());
                }}
              >
                <FolderIcon />
              </button>
              <button
                aria-label="Sync workspace"
                className="icon-button"
                disabled={!selectedWorkspace}
                type="button"
                onClick={() => {
                  void updateSnapshot(api, setSnapshot, () => api.syncCurrentWorkspace());
                }}
              >
                <SlidersIcon />
              </button>
            </div>
          </div>

          {snapshot.workspaces.length === 0 ? (
            <div className="empty-state" data-testid="empty-state">
              <h2>No folders yet</h2>
              <p>Open a project folder to start building a workspace and session list.</p>
              <button
                className="button button--primary"
                type="button"
                onClick={() => {
                  void updateSnapshot(api, setSnapshot, () => api.pickWorkspace());
                }}
              >
                Open first folder
              </button>
            </div>
          ) : (
            <div className="workspace-list" data-testid="workspace-list">
              {snapshot.workspaces.map((workspace: WorkspaceRecord) => {
                const workspaceActive = workspace.id === selectedWorkspace?.id;
                return (
                  <section key={workspace.id} className="workspace-group">
                    <button
                      className={`workspace-row ${workspaceActive ? "workspace-row--active" : ""}`}
                      onClick={() => {
                        void updateSnapshot(api, setSnapshot, () => api.selectWorkspace(workspace.id));
                      }}
                      type="button"
                    >
                      <span className="workspace-row__icon" aria-hidden="true">
                        <FolderIcon />
                      </span>
                      <span className="workspace-row__name">{workspace.name}</span>
                      <span className="workspace-row__time">{formatRelativeTime(workspace.lastOpenedAt)}</span>
                    </button>
                    <div className="session-list">
                      {workspace.sessions.map((session) => {
                        const active = workspace.id === selectedWorkspace?.id && session.id === selectedSession?.id;
                        return (
                          <button
                            key={session.id}
                            className={`session-row ${active ? "session-row--active" : ""}`}
                            onClick={() => {
                              void updateSnapshot(api, setSnapshot, () =>
                                api.selectSession({ workspaceId: workspace.id, sessionId: session.id }),
                              );
                            }}
                            type="button"
                          >
                            <span className={`session-row__status session-row__status--${session.status}`} />
                            <span className="session-row__body">
                              <span className="session-row__title">{session.title}</span>
                              <span className="session-row__preview">{session.preview}</span>
                            </span>
                            <span className="session-row__time">{formatRelativeTime(session.updatedAt)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="sidebar__footer">
          <div className="sidebar__settings">
            <span className="sidebar__settings-mark">
              <SettingsIcon />
            </span>
            <span>Settings</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar__title">
            {selectedWorkspace && selectedSession ? (
              <>
                <span className="topbar__workspace">{selectedWorkspace.name}</span>
                <span className="topbar__separator">/</span>
                <span className="topbar__session">{selectedSession.title}</span>
              </>
            ) : (
              <span className="topbar__workspace">Open a folder to begin</span>
            )}
          </div>

          <div className="topbar__actions">
            <button
              className="button button--ghost"
              disabled={!selectedWorkspace}
              type="button"
              onClick={() => {
                void updateSnapshot(api, setSnapshot, () => api.syncCurrentWorkspace());
              }}
            >
              <RefreshIcon />
              <span>Sync</span>
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => {
                void updateSnapshot(api, setSnapshot, () => api.pickWorkspace());
              }}
            >
              <FolderIcon />
              <span>Add folder</span>
            </button>
          </div>
        </header>

        {selectedWorkspace && selectedSession ? (
          <>
            <section className="canvas">
              <div className="session-header">
                <div className="session-header__copy">
                  <div className="session-header__eyebrow">Session</div>
                  <h1>{selectedSession.title}</h1>
                  <p>{selectedSession.preview}</p>
                </div>

                <div className="session-header__meta">
                  <span className="meta-chip">Local</span>
                  <span className="meta-chip">{statusLabel(selectedSession.status)}</span>
                  <span className="meta-chip meta-chip--path">{selectedWorkspace.path}</span>
                </div>
              </div>

              {snapshot.lastError ? <div className="error-banner">{snapshot.lastError}</div> : null}

              <div className="timeline-pane">
                <div className="timeline" data-testid="transcript">
                  {selectedSession.transcript.length === 0 ? (
                    <article className="message message--assistant">
                      <div className="message__role">assistant</div>
                      <p>Start with a prompt to continue this thread.</p>
                    </article>
                  ) : (
                    selectedSession.transcript.map((message) => (
                      <article className={`message message--${message.role}`} key={message.id}>
                        <div className="message__meta">
                          <span className="message__role">{message.role}</span>
                          <span className="message__time">{formatRelativeTime(message.createdAt)}</span>
                        </div>
                        <p>{message.text}</p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </section>

            <footer className="composer">
              <div className="composer__prompt">
                <textarea
                  aria-label="Composer"
                  data-testid="composer"
                  value={composerDraft}
                  onChange={(event) => {
                    setComposerDraft(event.target.value);
                  }}
                  placeholder="Ask pi to inspect the repo, run a fix, or continue the current thread..."
                />
              </div>

              <div className="composer__bar">
                <div className="composer__meta">
                  <span className="meta-chip">{api.platform}</span>
                  <span className="meta-chip">Revision {snapshot.revision}</span>
                  <span className="meta-chip">{formatRelativeTime(selectedSession.updatedAt)}</span>
                </div>

                <div className="composer__buttons">
                  <button className="button button--ghost" disabled type="button">
                    Attach
                  </button>
                  <button
                    className="button button--primary"
                    data-testid="send"
                    type="button"
                    onClick={() => {
                      void (async () => {
                        if (composerDraft !== snapshot.composerDraft) {
                          await updateSnapshot(api, setSnapshot, () => api.updateComposerDraft(composerDraft));
                        }
                        const nextState = await updateSnapshot(api, setSnapshot, () => api.submitComposerDraft());
                        setComposerDraft(nextState.composerDraft);
                      })();
                    }}
                  >
                    Send
                  </button>
                </div>
              </div>
            </footer>
          </>
        ) : selectedWorkspace ? (
          <section className="canvas canvas--empty">
            <div className="empty-panel">
              <div className="session-header__eyebrow">Workspace</div>
              <h1>{selectedWorkspace.name}</h1>
              <p>Create a thread for this folder, then jump between sessions from the sidebar.</p>
              <div className="empty-panel__meta">
                <span className="meta-chip meta-chip--path">{selectedWorkspace.path}</span>
                <span className="meta-chip">{formatRelativeTime(selectedWorkspace.lastOpenedAt)}</span>
              </div>
              <div className="empty-panel__actions">
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => {
                    void updateSnapshot(api, setSnapshot, () =>
                      api.createSession({ workspaceId: selectedWorkspace.id, title: "New thread" }),
                    );
                  }}
                >
                  New thread
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="canvas canvas--empty">
            <div className="empty-panel">
              <div className="session-header__eyebrow">Workspace</div>
              <h1>Open a folder to start</h1>
              <p>Add project folders, group sessions under them, and jump between threads from the sidebar.</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
