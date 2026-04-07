import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  getDesktopState,
  getSelectedTranscript,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  streamAssistantDeltas,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("reopens the exact archived thread when it was the last selected session", async () => {
  test.setTimeout(90_000);

  const userDataDir = await makeUserDataDir("pi-app-reopen-archived-selection-");
  const workspacePath = await makeWorkspace("reopen-archived-selection-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  let archivedSessionId = "";
  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);

    await createNamedThread(window, "Thread one");
    await createNamedThread(window, "Thread two");
    await streamAssistantDeltas(harness, window, ["archived thread response"]);
    await expect(window.getByTestId("transcript")).toContainText("archived thread response");

    const activeRow = window.locator(".session-list > .session-row").filter({ hasText: "Thread two" }).first();
    await activeRow.hover();
    await activeRow.locator(".session-row__action").click();
    await expect(window.locator(".topbar__session")).toHaveText("Thread one");

    const archivedToggle = window.locator(".archived-thread-group__toggle");
    await archivedToggle.click();
    const archivedRow = window.locator(".session-list--archived .session-row").filter({ hasText: "Thread two" }).first();
    await archivedRow.locator(".session-row__select").click();
    await expect(window.locator(".topbar__session")).toHaveText("Thread two");
    await expect(window.getByTestId("transcript")).toContainText("archived thread response");
    await expect(window.getByTestId("transcript")).not.toContainText("Loading transcript");

    const state = await getDesktopState(window);
    const archivedSession = state.workspaces[0]?.sessions.find((session) => session.title === "Thread two");
    archivedSessionId = archivedSession?.id ?? "";
    expect(archivedSession?.archivedAt).toBeTruthy();
    expect(state.selectedSessionId).toBe(archivedSessionId);
  } finally {
    await harness.close();
  }

  const reopened = await launchDesktop(userDataDir, { testMode: "background" });
  try {
    const window = await reopened.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await expect(window.locator(".topbar__session")).toHaveText("Thread two");
    await expect(window.getByTestId("transcript")).toContainText("archived thread response");
    await expect(window.getByTestId("transcript")).not.toContainText("Loading transcript");
    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const transcript = await getSelectedTranscript(window);
        const archivedSession = state.workspaces[0]?.sessions.find((session) => session.id === archivedSessionId);
        return {
          selectedSessionId: state.selectedSessionId,
          archivedAt: archivedSession?.archivedAt ?? "",
          transcriptStatus: transcript?.status ?? "missing",
          transcriptText: transcript?.transcript
            .filter((entry) => entry.kind === "message")
            .map((entry) => entry.text)
            .join("\n") ?? "",
        };
      })
      .toMatchObject({
        selectedSessionId: archivedSessionId,
        transcriptStatus: "ready",
        transcriptText: expect.stringContaining("archived thread response"),
      });
  } finally {
    await reopened.close();
  }
});
