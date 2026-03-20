import { Notification, type BrowserWindow } from "electron";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { DesktopAppStore } from "./app-store";
import type { DesktopAppState } from "../src/desktop-state";
import type { SessionDriverEvent, SessionRef } from "@pi-app/session-driver";
import { getSelectedSession } from "../src/desktop-state";

export class NotificationManager {
  private readonly completedRunKeys = new Set<string>();
  private readonly activeBySession = new Map<string, Electron.Notification>();
  private latestState: DesktopAppState | undefined;

  constructor(
    private readonly store: DesktopAppStore,
    private readonly getWindow: () => BrowserWindow | null,
  ) {}

  start(): () => void {
    const stopState = this.store.subscribe((state) => {
      this.latestState = state;
      const selectedSession = getSelectedSession(state);
      if (selectedSession) {
        this.dismissForSession({
          workspaceId: state.selectedWorkspaceId,
          sessionId: state.selectedSessionId,
        });
      }
    });
    const stopEvents = this.store.subscribeToSessionEvents((event, state) => {
      this.latestState = state;
      void this.handleEvent(event);
    });
    return () => {
      stopState();
      stopEvents();
    };
  }

  private async handleEvent(event: SessionDriverEvent): Promise<void> {
    if (!Notification.isSupported()) {
      return;
    }
    if (!this.shouldNotify(event)) {
      return;
    }

    if (event.type === "runCompleted") {
      const dedupeKey = `${sessionKey(event.sessionRef)}:${event.runId ?? "completed"}`;
      if (this.completedRunKeys.has(dedupeKey)) {
        return;
      }
      this.completedRunKeys.add(dedupeKey);
      await this.showNotification(event.sessionRef, event.snapshot.title, event.snapshot.preview || "Run completed");
      return;
    }

    if (event.type === "runFailed") {
      await this.showNotification(event.sessionRef, this.titleForSession(event.sessionRef), event.error.message);
      return;
    }

    if (event.type === "hostUiRequest" && requiresAttention(event)) {
      await this.showNotification(
        event.sessionRef,
        this.titleForSession(event.sessionRef),
        hostUiBody(event),
      );
    }
  }

  private shouldNotify(event: SessionDriverEvent): boolean {
    if (event.type !== "runCompleted" && event.type !== "runFailed" && event.type !== "hostUiRequest") {
      return false;
    }

    const preferences = this.latestState?.notificationPreferences;
    if (event.type === "runCompleted" && preferences && !preferences.backgroundCompletion) {
      return false;
    }
    if (event.type === "runFailed" && preferences && !preferences.backgroundFailure) {
      return false;
    }
    if (event.type === "hostUiRequest" && preferences && !preferences.attentionNeeded) {
      return false;
    }

    const window = this.getWindow();
    if (!window || window.isDestroyed()) {
      return true;
    }

    const selected = this.latestState
      ? {
          workspaceId: this.latestState.selectedWorkspaceId,
          sessionId: this.latestState.selectedSessionId,
        }
      : undefined;

    const isFocusedSession =
      selected &&
      selected.workspaceId === event.sessionRef.workspaceId &&
      selected.sessionId === event.sessionRef.sessionId;

    return !(window.isFocused() && isFocusedSession);
  }

  private async showNotification(sessionRef: SessionRef, title: string, body: string): Promise<void> {
    this.dismissForSession(sessionRef);
    await this.logNotification(sessionRef, title, body);
    const notification = new Notification({
      title,
      body,
      silent: false,
    });
    notification.on("click", () => {
      void this.openSession(sessionRef);
    });
    notification.on("close", () => {
      this.activeBySession.delete(sessionKey(sessionRef));
    });
    this.activeBySession.set(sessionKey(sessionRef), notification);
    notification.show();
  }

  private async logNotification(sessionRef: SessionRef, title: string, body: string): Promise<void> {
    const logPath = process.env.PI_APP_NOTIFICATION_LOG_PATH?.trim();
    if (!logPath) {
      return;
    }

    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(
      logPath,
      `${JSON.stringify({ sessionRef, title, body, timestamp: new Date().toISOString() })}\n`,
      "utf8",
    );
  }

  private async openSession(sessionRef: SessionRef): Promise<void> {
    await this.store.selectSession(sessionRef);
    const window = this.getWindow();
    if (!window || window.isDestroyed()) {
      return;
    }
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
    this.dismissForSession(sessionRef);
  }

  private dismissForSession(sessionRef: SessionRef): void {
    const key = sessionKey(sessionRef);
    const existing = this.activeBySession.get(key);
    existing?.close();
    this.activeBySession.delete(key);
  }

  private titleForSession(sessionRef: SessionRef): string {
    const state = this.latestState;
    const workspace = state?.workspaces.find((entry) => entry.id === sessionRef.workspaceId);
    const session = workspace?.sessions.find((entry) => entry.id === sessionRef.sessionId);
    return session?.title ?? "pi session";
  }
}

function sessionKey(sessionRef: SessionRef): string {
  return `${sessionRef.workspaceId}:${sessionRef.sessionId}`;
}

function requiresAttention(event: Extract<SessionDriverEvent, { type: "hostUiRequest" }>): boolean {
  return event.request.kind === "confirm" || event.request.kind === "input" || event.request.kind === "select";
}

function hostUiBody(event: Extract<SessionDriverEvent, { type: "hostUiRequest" }>): string {
  if (event.request.kind === "confirm" || event.request.kind === "input" || event.request.kind === "select") {
    return event.request.title;
  }
  return "Needs your input";
}
