import { expect, test, type Page } from "@playwright/test";
import {
  desktopShortcut,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

async function expectSidebarCollapsed(window: Page, collapsed: boolean): Promise<void> {
  await expect(window.locator(".sidebar")).toHaveCount(collapsed ? 0 : 1);
  await expect.poll(async () => (await getDesktopState(window)).sidebarCollapsed).toBe(collapsed);
}

async function restoreSidebarIfNeeded(window: Page): Promise<void> {
  if ((await getDesktopState(window)).sidebarCollapsed) {
    await window.getByTestId("sidebar-toggle").click();
    await expectSidebarCollapsed(window, false);
  }
}

test("toggles and persists the primary sidebar from the button and keyboard shortcut", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("sidebar-toggle-workspace");
  const firstRun = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await firstRun.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);

    const toggle = window.getByTestId("sidebar-toggle");
    await expect(toggle).toBeVisible();
    await expect(window.locator(".sidebar")).toBeVisible();
    const expandedMainBox = await window.locator(".main").boundingBox();
    expect(expandedMainBox).not.toBeNull();

    await toggle.click();
    await expectSidebarCollapsed(window, true);
    const collapsedMainBox = await window.locator(".main").boundingBox();
    expect(collapsedMainBox).not.toBeNull();
    expect(collapsedMainBox?.x ?? 999).toBeLessThan(expandedMainBox?.x ?? 0);
    expect(collapsedMainBox?.width ?? 0).toBeGreaterThan(expandedMainBox?.width ?? 9999);

    await toggle.click();
    await expectSidebarCollapsed(window, false);

    await window.keyboard.press(desktopShortcut("B"));
    await expectSidebarCollapsed(window, true);
    await window.keyboard.press(desktopShortcut("B"));
    await expectSidebarCollapsed(window, false);

    await window.keyboard.press(desktopShortcut("Shift+O"));
    await expect(window.getByTestId("new-thread-composer")).toBeVisible();
    await window.keyboard.press(desktopShortcut("B"));
    await expectSidebarCollapsed(window, true);
    await window.keyboard.press(desktopShortcut("B"));
    await expectSidebarCollapsed(window, false);

    await window.keyboard.press(desktopShortcut(","));
    await expect(window.getByTestId("settings-surface")).toBeVisible();
    await expect(window.getByTestId("sidebar-toggle")).toHaveCount(0);
    await window.keyboard.press(desktopShortcut("B"));
    await expect.poll(async () => (await getDesktopState(window)).sidebarCollapsed).toBe(false);
    await window.getByRole("button", { name: "Back to app", exact: true }).click();

    await restoreSidebarIfNeeded(window);
    await window.getByRole("button", { name: "Skills", exact: true }).click();
    await expect(window.getByTestId("skills-surface")).toBeVisible();
    await expect(window.getByTestId("sidebar-toggle")).toHaveCount(0);
    await window.keyboard.press(desktopShortcut("B"));
    await expect.poll(async () => (await getDesktopState(window)).sidebarCollapsed).toBe(false);
    await window.getByRole("button", { name: "Back to app", exact: true }).click();

    await restoreSidebarIfNeeded(window);
    await window.getByRole("button", { name: "Extensions", exact: true }).click();
    await expect(window.getByTestId("extensions-surface")).toBeVisible();
    await expect(window.getByTestId("sidebar-toggle")).toHaveCount(0);
    await window.keyboard.press(desktopShortcut("B"));
    await expect.poll(async () => (await getDesktopState(window)).sidebarCollapsed).toBe(false);
    await window.getByRole("button", { name: "Back to app", exact: true }).click();

    await restoreSidebarIfNeeded(window);
    await window.getByTestId("sidebar-toggle").click();
    await expectSidebarCollapsed(window, true);
  } finally {
    await firstRun.close();
  }

  const secondRun = await launchDesktop(userDataDir, { testMode: "background" });
  try {
    const window = await secondRun.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await expectSidebarCollapsed(window, true);
    await expect(window.getByTestId("sidebar-toggle")).toBeVisible();
    await window.getByTestId("sidebar-toggle").click();
    await expectSidebarCollapsed(window, false);
  } finally {
    await secondRun.close();
  }
});
