import { expect, test, type Page } from "@playwright/test";
import {
  createSessionViaIpc,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  writeProjectExtension,
} from "../helpers/electron-app";

const extensionSource = String.raw`
export default function demoExtension(pi) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setTitle("Extension Surface");
    ctx.ui.setStatus("demo-status", "Demo ready");
    ctx.ui.setWidget("demo-widget", ["Demo widget line"]);
    ctx.ui.setWidget("demo-widget-below", ["Below widget line"], { placement: "belowEditor" });
  });

  pi.registerCommand("settings", {
    description: "Runtime settings command",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Runtime settings command", "info");
    },
  });

  pi.registerCommand("prefill-demo", {
    description: "Prefill the composer",
    handler: async (_args, ctx) => {
      ctx.ui.setEditorText("Prefilled from extension");
      ctx.ui.notify("Composer prefilled", "info");
    },
  });
}
`;

const customFallbackExtensionSource = String.raw`
export default function customFallbackExtension(pi) {
  pi.registerCommand("read-mode-test", {
    description: "Terminal-only read mode",
    handler: async (_args, ctx) => {
      let result;
      try {
        result = await ctx.ui.custom((_tui, _theme, _kb, done) => ({
          render: () => ["read-mode"],
          handleInput: () => done({ text: "should-not-send" }),
        }));
      } catch {
        ctx.ui.notify("Read mode ignored", "info");
        return;
      }
      if (result?.text) {
        pi.sendUserMessage(result.text);
        return;
      }
      ctx.ui.notify("Read mode ignored", "info");
    },
  });
}
`;

const newSessionExtensionSource = String.raw`
export default function newSessionExtension(pi) {
  pi.registerCommand("spawn-child", {
    description: "Create a child session with a draft",
    handler: async (_args, ctx) => {
      const parentSession = ctx.sessionManager.getSessionFile();
      const result = await ctx.newSession(parentSession ? { parentSession } : undefined);
      if (result.cancelled) {
        ctx.ui.notify("Child session cancelled", "info");
        return;
      }
      ctx.ui.setEditorText("Child draft");
      ctx.ui.notify("Child session ready", "info");
    },
  });
}
`;

async function expandDock(window: Page) {
  const toggle = window.getByTestId("extension-dock-toggle");
  await toggle.click();
  return window.getByTestId("extension-dock-body");
}

test("manages extensions and prefers runtime commands over colliding host actions", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("extensions-workspace");
  await writeProjectExtension(workspacePath, "demo-extension.ts", extensionSource);

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createSessionViaIpc(window, workspacePath, "Inspect extension surface");
    await expect(window.getByTestId("composer")).toBeVisible();

    await expect(window.locator(".topbar__session")).toHaveText("Extension Surface");
    await expect(window.getByTestId("extension-dock")).toBeVisible();
    await expect(window.getByTestId("extension-dock-summary")).toHaveText("Demo ready");
    await expect(window.getByTestId("extension-status-strip")).toHaveCount(0);
    await expect(window.getByTestId("extension-widget-rail")).toHaveCount(0);
    const dockBody = await expandDock(window);
    await expect(dockBody).toContainText("demo-status: Demo ready");
    await expect(dockBody).toContainText("demo-widget:");
    await expect(dockBody).toContainText("Demo widget line");
    await expect(dockBody).toContainText("demo-widget-below:");
    await expect(dockBody).toContainText("Below widget line");

    await window.getByRole("button", { name: "Extensions", exact: true }).click();
    await expect(window.getByTestId("extensions-surface")).toBeVisible();
    const extensionsList = window.getByTestId("extensions-list");
    const extensionCard = extensionsList.getByRole("button", { name: /demo-extension/i });
    await expect(extensionCard).toBeVisible();
    await extensionCard.click();
    await expect(window.locator(".skill-detail")).toContainText("settings");
    await expect(window.locator(".skill-detail")).toContainText("prefill-demo");

    await window.getByRole("button", { name: "Disable", exact: true }).click();
    await expect(window.locator(".skill-detail__status")).toHaveText("Disabled");
    await window.getByRole("button", { name: "Back to app", exact: true }).click();
    await expect(window.locator(".topbar__session")).toHaveText("Inspect extension surface");
    await expect(window.getByTestId("extension-dock")).toHaveCount(0);
    const composer = window.getByTestId("composer");
    await window.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(window.getByTestId("settings-surface")).toBeVisible();
    await window.getByRole("button", { name: "Back to app", exact: true }).click();

    await window.getByRole("button", { name: "Extensions", exact: true }).click();
    await extensionCard.click();
    await window.getByRole("button", { name: "Enable", exact: true }).click();
    await expect(window.locator(".skill-detail__status")).toHaveText("Enabled");
    await window.getByRole("button", { name: "Back to app", exact: true }).click();
    await expect(window.locator(".topbar__session")).toHaveText("Extension Surface");
    await expect(window.getByTestId("extension-dock-summary")).toHaveText("Demo ready");
    await expect(window.getByTestId("extension-dock-body")).toHaveCount(0);
    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        if (!state.selectedWorkspaceId || !state.selectedSessionId) {
          return false;
        }
        const selectedSessionKey = `${state.selectedWorkspaceId}:${state.selectedSessionId}`;
        return (
          state.sessionCommandsBySession[selectedSessionKey]?.some((command) => command.name === "settings") ?? false
        );
      })
      .toBe(true);
    await expect
      .poll(
        async () => {
          const state = await getDesktopState(window);
          const selectedWorkspace = state.workspaces.find((entry) => entry.id === state.selectedWorkspaceId);
          return selectedWorkspace?.sessions.find((session) => session.id === state.selectedSessionId)?.status ?? "unknown";
        },
        { timeout: 30_000 },
      )
      .toBe("idle");

    await composer.fill("/se");
    const slashMenu = window.getByTestId("slash-menu");
    await expect(slashMenu).toContainText("Runtime Commands");
    await expect(slashMenu).toContainText("Host Actions");

    await composer.fill("/settings ");
    await composer.press("Enter");
    await expect(window.getByTestId("settings-surface")).toHaveCount(0);
    await expect(window.locator(".timeline")).toContainText("Runtime settings command");

    await composer.fill("/prefill-demo ");
    await composer.press("Enter");
    await expect(composer).toHaveValue("Prefilled from extension");
    await expect(window.locator(".timeline")).toContainText("Composer prefilled");
  } finally {
    await harness.close();
  }
});

test("degrades terminal-only custom extension ui without sending stray messages", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("extensions-custom-fallback-workspace");
  await writeProjectExtension(workspacePath, "custom-fallback-extension.ts", customFallbackExtensionSource);

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createSessionViaIpc(window, workspacePath, "Custom fallback session");

    const composer = window.getByTestId("composer");
    await composer.fill("/read-mode-test ");
    await composer.press("Enter");

    await expect(window.getByTestId("extension-dialog")).toHaveCount(0);
    await expect(window.locator(".timeline")).toContainText("Read mode ignored");
    await expect(window.locator(".timeline")).not.toContainText("should-not-send");
    await expect(composer).toHaveValue("");
  } finally {
    await harness.close();
  }
});

test("keeps a single subscription path when an extension creates a child session and prefills the draft", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("extensions-new-session-workspace");
  await writeProjectExtension(workspacePath, "new-session-extension.ts", newSessionExtensionSource);

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createSessionViaIpc(window, workspacePath, "Parent session");

    const beforeState = await getDesktopState(window);
    const beforeSelectedSessionId = beforeState.selectedSessionId;
    const resumedCountBefore = await window.getByText("Resumed session", { exact: true }).count();

    const composer = window.getByTestId("composer");
    await composer.fill("/spawn-child ");
    await composer.press("Enter");

    await expect
      .poll(async () => {
        const nextState = await getDesktopState(window);
        return nextState.selectedSessionId;
      })
      .not.toBe(beforeSelectedSessionId);
    await expect(composer).toHaveValue("Child draft");
    await expect(window.locator(".timeline")).toContainText("Child session ready");
    await expect(window.getByText("Resumed session", { exact: true })).toHaveCount(resumedCountBefore);
  } finally {
    await harness.close();
  }
});
