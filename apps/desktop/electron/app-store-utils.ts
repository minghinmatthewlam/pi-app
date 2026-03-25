import { randomUUID } from "node:crypto";
import type { SessionCatalogEntry, WorkspaceCatalogEntry, WorktreeCatalogEntry } from "@pi-gui/catalogs";
import { sessionKey } from "@pi-gui/pi-sdk-driver";
import type { SessionAttachment, SessionConfig, SessionRef } from "@pi-gui/session-driver";
import type {
  ComposerImageAttachment,
  SessionRecord,
  TranscriptMessage,
  WorktreeRecord,
  WorkspaceRecord,
  WorkspaceSessionTarget,
} from "../src/desktop-state";

export const TRANSCRIPT_HISTORY_LIMIT = 180;

export function mapToRecord<V>(map: Map<string, V>): Record<string, V> {
  return Object.fromEntries(map.entries());
}

export function buildWorkspaceRecords(
  workspaces: readonly WorkspaceCatalogEntry[],
  worktrees: readonly WorktreeCatalogEntry[],
  sessions: readonly SessionCatalogEntry[],
  transcriptCache: Map<string, TranscriptMessage[]>,
  runningSinceBySession: Map<string, string>,
  sessionConfigBySession: Map<string, SessionConfig>,
  lastViewedAtBySession: Map<string, string>,
): WorkspaceRecord[] {
  const linkedWorktreesByPath = new Map(
    worktrees
      .filter((worktree) => worktree.kind === "linked")
      .map((worktree) => [worktree.path, worktree] as const),
  );

  return workspaces.map((workspace) => {
    const linkedWorktree = linkedWorktreesByPath.get(workspace.path);
    const isValidLinkedWorktree =
      linkedWorktree !== undefined && linkedWorktree.workspaceId !== workspace.workspaceId;

    return {
      id: workspace.workspaceId,
      name: workspace.displayName,
      path: workspace.path,
      lastOpenedAt: workspace.lastOpenedAt,
      kind: isValidLinkedWorktree ? "worktree" : "primary",
      ...(isValidLinkedWorktree
        ? {
            rootWorkspaceId: linkedWorktree?.workspaceId,
            branchName: linkedWorktree?.branchName,
          }
        : {}),
      sessions: sessions
        .filter((session) => session.workspaceId === workspace.workspaceId)
        .map((session) =>
          buildSessionRecord(
            session,
            transcriptCache,
            runningSinceBySession,
            sessionConfigBySession,
            lastViewedAtBySession,
          ),
        ),
    };
  });
}

export function buildWorktreeRecords(
  workspaces: readonly WorkspaceCatalogEntry[],
  worktrees: readonly WorktreeCatalogEntry[],
): Record<string, readonly WorktreeRecord[]> {
  const linkedWorkspaceIdsByPath = new Map(workspaces.map((workspace) => [workspace.path, workspace.workspaceId] as const));
  const groups = new Map<string, WorktreeRecord[]>();

  for (const worktree of worktrees) {
    if (worktree.kind !== "linked") {
      continue;
    }
    const linkedWorkspaceId = linkedWorkspaceIdsByPath.get(worktree.path);
    if (linkedWorkspaceId === worktree.workspaceId) {
      continue;
    }
    const entry: WorktreeRecord = {
      id: worktree.worktreeId,
      rootWorkspaceId: worktree.workspaceId,
      linkedWorkspaceId,
      name: worktree.displayName,
      path: worktree.path,
      status: worktree.status,
      branchName: worktree.branchName,
      updatedAt: worktree.updatedAt,
    };
    const existing = groups.get(worktree.workspaceId);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(worktree.workspaceId, [entry]);
    }
  }

  for (const entries of groups.values()) {
    entries.sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt.localeCompare(left.updatedAt);
      }
      return left.name.localeCompare(right.name);
    });
  }

  return mapToRecord(groups);
}

function buildSessionRecord(
  session: SessionCatalogEntry,
  transcriptCache: Map<string, TranscriptMessage[]>,
  runningSinceBySession: Map<string, string>,
  sessionConfigBySession: Map<string, SessionConfig>,
  lastViewedAtBySession: Map<string, string>,
): SessionRecord {
  const key = sessionKey(session.sessionRef);
  const transcript = transcriptCache.get(key) ?? [];
  const preview = previewFromTranscript(transcript) ?? session.previewSnippet ?? session.title;
  const lastViewedAt = lastViewedAtBySession.get(key);
  return {
    id: session.sessionRef.sessionId,
    title: session.title,
    updatedAt: session.updatedAt,
    lastViewedAt,
    archivedAt: session.archivedAt,
    preview,
    status: session.status,
    runningSince: runningSinceBySession.get(key),
    hasUnseenUpdate: session.status !== "running" && Boolean(lastViewedAt && session.updatedAt > lastViewedAt),
    config: sessionConfigBySession.get(key),
    transcript: transcript.map(cloneTranscriptMessage),
  };
}

export function toSessionRef(target: WorkspaceSessionTarget): SessionRef {
  return {
    workspaceId: target.workspaceId,
    sessionId: target.sessionId,
  };
}

export function makeTranscriptMessage(role: "user" | "assistant", text: string): TranscriptMessage {
  return {
    kind: "message",
    id: randomUUID(),
    role,
    text,
    createdAt: new Date().toISOString(),
  };
}

export function makeTranscriptMessageWithAttachments(
  role: "user" | "assistant",
  text: string,
  attachments: NonNullable<Extract<TranscriptMessage, { kind: "message" }>["attachments"]>,
): TranscriptMessage {
  return {
    ...makeTranscriptMessage(role, text),
    ...(attachments?.length ? { attachments: attachments.map((attachment) => ({ ...attachment })) } : {}),
  };
}

export function cloneTranscriptMessage(message: TranscriptMessage): TranscriptMessage {
  if (message.kind === "message" && message.attachments) {
    return {
      ...message,
      attachments: message.attachments.map((attachment) => ({ ...attachment })),
    };
  }
  return { ...message };
}

export function cloneComposerImageAttachment(attachment: ComposerImageAttachment): ComposerImageAttachment {
  return { ...attachment };
}

export function cloneComposerImageAttachments(
  attachments: readonly ComposerImageAttachment[],
): ComposerImageAttachment[] {
  return attachments.map(cloneComposerImageAttachment);
}

export function toSessionAttachments(
  attachments: readonly ComposerImageAttachment[],
): SessionAttachment[] {
  return attachments.map(toImageAttachmentPayload);
}

export function toTranscriptAttachments(
  attachments: readonly ComposerImageAttachment[],
): NonNullable<Extract<TranscriptMessage, { kind: "message" }>["attachments"]> {
  return attachments.map(toImageAttachmentPayload);
}

function toImageAttachmentPayload({ data, mimeType, name }: ComposerImageAttachment) {
  return {
    kind: "image" as const,
    data,
    mimeType,
    name,
  };
}

export function makeActivityItem(
  label: string,
  options: Pick<Extract<TranscriptMessage, { kind: "activity" }>, "detail" | "metadata" | "tone"> = {},
): TranscriptMessage {
  return {
    kind: "activity",
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    label,
    ...options,
  };
}

export function makeSummaryItem(
  label: string,
  options: Partial<Pick<Extract<TranscriptMessage, { kind: "summary" }>, "metadata" | "presentation">> = {},
): TranscriptMessage {
  return {
    kind: "summary",
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    label,
    presentation: options.presentation ?? "inline",
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };
}

export function makeToolItem(
  callId: string,
  toolName: string,
  status: "running" | "success" | "error",
  label: string,
  options: Pick<Extract<TranscriptMessage, { kind: "tool" }>, "detail" | "metadata"> = {},
): TranscriptMessage {
  return {
    kind: "tool",
    id: callId,
    callId,
    toolName,
    status,
    label,
    createdAt: new Date().toISOString(),
    ...options,
  };
}

export function previewFromTranscript(transcript: readonly TranscriptMessage[]): string | undefined {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const item = transcript[index];
    if (!item) {
      continue;
    }
    if (item.kind === "message" && item.role === "assistant") {
      return item.text;
    }
  }

  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const item = transcript[index];
    if (!item) {
      continue;
    }
    if (item.kind === "message") {
      return item.text;
    }
    if (item.kind === "tool" || item.kind === "activity") {
      return item.label;
    }
  }
  return undefined;
}

export function formatElapsedDuration(startedAt: string, endedAt: string): string {
  const diffMs = Math.max(0, Date.parse(endedAt) - Date.parse(startedAt));
  const seconds = Math.max(1, Math.round(diffMs / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining === 0 ? `${minutes}m` : `${minutes}m ${remaining}s`;
}
