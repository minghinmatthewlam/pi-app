import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { createSession, launchDesktop, type PiAppWindow } from "./harness";

const execFileAsync = promisify(execFile);

test("creates and selects a worktree-backed workspace from the desktop UI", async () => {
  test.setTimeout(90_000);
  const userDataDir = await mkdtemp(join(tmpdir(), "pi-app-user-data-"));
  const workspacePath = await makeGitWorkspace("worktree-live-workspace");
  const harness = await launchDesktop(userDataDir, [workspacePath]);

  try {
    const window = await harness.firstWindow();
    const rootWorkspace = await waitForRootWorkspace(window);
    if (!rootWorkspace) {
      throw new Error("Expected an initial workspace");
    }

    await window.getByRole("button", { name: `Workspace actions for ${rootWorkspace.name}` }).click();
    await window.getByRole("button", { name: "Create permanent worktree" }).click();

    await expect
      .poll(async () => {
        const state = await getState(window);
        const selected = state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId);
        return selected?.kind === "worktree" && (state.worktreesByWorkspace[rootWorkspace.id]?.length ?? 0) > 0;
      })
      .toBe(true);

    const stateAfterCreate = await getState(window);
    const worktreeWorkspace = stateAfterCreate.workspaces.find(
      (workspace) => workspace.id === stateAfterCreate.selectedWorkspaceId,
    );
    if (!worktreeWorkspace || worktreeWorkspace.kind !== "worktree") {
      throw new Error("Expected the selected workspace to be the newly created worktree");
    }

    await expect(window.locator(".environment-picker__button")).toContainText(worktreeWorkspace.name);
    await expect(window.locator(".empty-panel")).toContainText("Create a thread for this folder");
    await expect(window.locator(".empty-panel")).not.toContainText("/Users/");

    await window.getByRole("complementary").getByRole("button", { name: "New thread" }).click();
    await expect(window.getByTestId("new-thread-composer")).toBeVisible();
    await expect(window.getByRole("button", { name: "Local", exact: true })).toBeVisible();
    await expect(window.getByRole("button", { name: "New worktree", exact: true })).toBeVisible();
  } finally {
    await harness.close();
  }
});

test("shows a worktree icon in the sidebar without a local text badge", async () => {
  test.setTimeout(90_000);
  const userDataDir = await mkdtemp(join(tmpdir(), "pi-app-user-data-"));
  const workspacePath = await makeGitWorkspace("worktree-sidebar-indicator");
  const harness = await launchDesktop(userDataDir, [workspacePath]);

  try {
    const window = await harness.firstWindow();
    const rootWorkspace = await waitForRootWorkspace(window);
    if (!rootWorkspace) {
      throw new Error("Expected an initial workspace");
    }

    await createSession(window, rootWorkspace.id, "Local thread");
    const localRow = window.locator(".session-row", { hasText: "Local thread" });
    await expect(localRow).toBeVisible();
    await expect(localRow).toHaveAttribute("data-sidebar-indicator", "none");
    await expect(localRow.locator(".session-row__workspace-icon")).toHaveCount(0);

    await window.getByRole("button", { name: `Workspace actions for ${rootWorkspace.name}` }).click();
    await window.getByRole("button", { name: "Create permanent worktree" }).click();

    await expect
      .poll(async () => {
        const state = await getState(window);
        const selected = state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId);
        return selected?.kind === "worktree";
      })
      .toBe(true);

    const stateAfterCreate = await getState(window);
    const firstWorktree = stateAfterCreate.workspaces.find(
      (workspace) => workspace.id === stateAfterCreate.selectedWorkspaceId,
    );
    if (!firstWorktree) {
      throw new Error("Expected selected worktree workspace");
    }

    await createSession(window, firstWorktree.id, "Worktree thread");
    const worktreeRow = window.locator(".session-row", { hasText: "Worktree thread" });
    await expect(worktreeRow).toBeVisible();
    await expect(worktreeRow).toHaveAttribute("data-sidebar-indicator", "none");
    await expect(worktreeRow.locator(".session-row__workspace-icon")).toHaveCount(1);
    await expect(window.getByTestId("workspace-list")).not.toContainText("Local project");
  } finally {
    await harness.close();
  }
});

test("keeps orphaned worktree workspaces visible after removing the root workspace", async () => {
  test.setTimeout(90_000);
  const userDataDir = await mkdtemp(join(tmpdir(), "pi-app-user-data-"));
  const workspacePath = await makeGitWorkspace("worktree-orphan-visibility");
  const harness = await launchDesktop(userDataDir, [workspacePath]);

  try {
    const window = await harness.firstWindow();
    const rootWorkspace = await waitForRootWorkspace(window);
    if (!rootWorkspace) {
      throw new Error("Expected an initial workspace");
    }

    await window.getByRole("button", { name: `Workspace actions for ${rootWorkspace.name}` }).click();
    await window.getByRole("button", { name: "Create permanent worktree" }).click();

    await expect
      .poll(async () => {
        const state = await getState(window);
        const selected = state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId);
        return selected?.kind === "worktree";
      })
      .toBe(true);

    const createdState = await getState(window);
    const createdWorkspace = createdState.workspaces.find((workspace) => workspace.id === createdState.selectedWorkspaceId);
    if (!createdWorkspace) {
      throw new Error("Expected created worktree workspace");
    }

    await window.getByRole("button", { name: `Workspace actions for ${rootWorkspace.name}` }).click();
    window.once("dialog", (dialog) => dialog.accept());
    await window.getByRole("button", { name: "Remove" }).click();

    await expect(window.getByTestId("empty-state")).toHaveCount(0);
    await expect
      .poll(async () => {
        const state = await getState(window);
        return state.workspaces.some((workspace) => workspace.id === createdWorkspace.id);
      })
      .toBe(true);
  } finally {
    await harness.close();
  }
});

async function makeGitWorkspace(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pi-app-git-workspace-"));
  const workspacePath = join(root, name);
  await mkdir(workspacePath, { recursive: true });
  await writeFile(join(workspacePath, "README.md"), `# ${name}\n`, "utf8");
  await execFileAsync("git", ["init", "-b", "main"], { cwd: workspacePath });
  await execFileAsync("git", ["config", "user.name", "Pi App Tests"], { cwd: workspacePath });
  await execFileAsync("git", ["config", "user.email", "pi-app-tests@example.com"], { cwd: workspacePath });
  await execFileAsync("git", ["add", "README.md"], { cwd: workspacePath });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: workspacePath });
  return realpath(workspacePath);
}

async function getState(window: import("@playwright/test").Page) {
  return window.evaluate(async () => {
    const app = (window as PiAppWindow).piApp;
    if (!app) {
      throw new Error("piApp unavailable");
    }
    return app.getState();
  });
}

async function waitForRootWorkspace(window: import("@playwright/test").Page) {
  await expect
    .poll(async () => {
      const state = await getState(window);
      return state.workspaces[0] ?? null;
    }, { timeout: 20_000 })
    .not.toBeNull();

  const state = await getState(window);
  return state.workspaces[0];
}
