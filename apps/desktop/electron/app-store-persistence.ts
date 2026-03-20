import type { AppView, NotificationPreferences } from "../src/desktop-state";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
export interface PersistedUiState {
  readonly version?: 2 | 3;
  readonly selectedWorkspaceId?: string;
  readonly selectedSessionId?: string;
  readonly activeView?: AppView;
  readonly composerDraft?: string;
  readonly composerDraftsBySession?: Record<string, string>;
  readonly notificationPreferences?: NotificationPreferences;
}

export interface LegacyPersistedUiState extends PersistedUiState {
  readonly composerAttachmentsBySession?: Record<string, readonly unknown[]>;
  readonly transcripts?: Record<string, readonly unknown[]>;
}

export async function readPersistedUiState(uiStateFilePath: string): Promise<LegacyPersistedUiState> {
  try {
    const raw = await readFile(uiStateFilePath, "utf8");
    const parsed = JSON.parse(raw) as LegacyPersistedUiState;
    return {
      version: parsed.version === 3 ? 3 : parsed.version === 2 ? 2 : undefined,
      selectedWorkspaceId: parsed.selectedWorkspaceId,
      selectedSessionId: parsed.selectedSessionId,
      activeView: parsed.activeView,
      composerDraft: parsed.composerDraft ?? "",
      composerDraftsBySession: parsed.composerDraftsBySession,
      notificationPreferences: parsed.notificationPreferences,
      composerAttachmentsBySession: parsed.composerAttachmentsBySession,
      transcripts: parsed.transcripts,
    };
  } catch {
    return {};
  }
}

export async function writePersistedUiState(
  uiStateFilePath: string,
  payload: PersistedUiState,
): Promise<void> {
  await mkdir(dirname(uiStateFilePath), { recursive: true });
  await writeFile(
    uiStateFilePath,
    `${JSON.stringify(
      {
        version: 3,
        ...payload,
      } satisfies PersistedUiState,
      null,
      2,
    )}\n`,
    "utf8",
  );
}
