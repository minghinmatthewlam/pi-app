import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("reopen falls back to the newest non-archived session when the saved selection is missing", async () => {
  test.setTimeout(90_000);

  const userDataDir = await makeUserDataDir("pi-app-reopen-selection-fallbacks-");
  const workspacePath = await makeWorkspace("reopen-selection-fallbacks-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  let workspaceId = "";
  let olderActiveId = "";
  let newerActiveId = "";
  let archivedNewestId = "";

  try {
    const window = await harness.firstWindow();
    const workspace = await waitForWorkspaceByPath(window, workspacePath);
    workspaceId = workspace.id;

    await createNamedThread(window, "Older active");
    olderActiveId = (await getDesktopState(window)).selectedSessionId;

    await createNamedThread(window, "Newer active");
    newerActiveId = (await getDesktopState(window)).selectedSessionId;

    await createNamedThread(window, "Archived newest");
    archivedNewestId = (await getDesktopState(window)).selectedSessionId;
  } finally {
    await harness.close();
  }

  const uiStatePath = join(userDataDir, "ui-state.json");
  const persistedUiState = JSON.parse(await readFile(uiStatePath, "utf8")) as {
    selectedWorkspaceId?: string;
    selectedSessionId?: string;
  };
  await writeFile(
    uiStatePath,
    `${JSON.stringify(
      {
        ...persistedUiState,
        selectedWorkspaceId: workspaceId,
        selectedSessionId: "missing-session-id",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const catalogsPath = join(userDataDir, "catalogs.json");
  const catalogs = JSON.parse(await readFile(catalogsPath, "utf8")) as {
    sessions: Array<{
      sessionRef: { workspaceId: string; sessionId: string };
      updatedAt: string;
      archivedAt?: string;
    }>;
  };
  catalogs.sessions = catalogs.sessions.map((session) => {
    if (session.sessionRef.workspaceId !== workspaceId) {
      return session;
    }
    if (session.sessionRef.sessionId === olderActiveId) {
      return {
        ...session,
        updatedAt: "2026-01-01T00:00:00.000Z",
        archivedAt: undefined,
      };
    }
    if (session.sessionRef.sessionId === newerActiveId) {
      return {
        ...session,
        updatedAt: "2026-02-01T00:00:00.000Z",
        archivedAt: undefined,
      };
    }
    if (session.sessionRef.sessionId === archivedNewestId) {
      return {
        ...session,
        updatedAt: "2026-03-01T00:00:00.000Z",
        archivedAt: "2026-03-01T00:00:00.000Z",
      };
    }
    return session;
  });
  await writeFile(catalogsPath, `${JSON.stringify(catalogs, null, 2)}\n`, "utf8");

  const reopened = await launchDesktop(userDataDir, { testMode: "background" });
  try {
    const window = await reopened.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await expect(window.locator(".topbar__session")).toHaveText("Newer active");
    await expect(window.getByTestId("transcript")).not.toContainText("Loading transcript");
    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        return {
          selectedSessionId: state.selectedSessionId,
          transcriptStatus: state.selectedSessionTranscript?.status ?? "missing",
          transcriptSessionId: state.selectedSessionTranscript?.sessionId ?? "",
        };
      })
      .toMatchObject({
        selectedSessionId: newerActiveId,
        transcriptStatus: "ready",
        transcriptSessionId: newerActiveId,
      });
  } finally {
    await reopened.close();
  }
});
