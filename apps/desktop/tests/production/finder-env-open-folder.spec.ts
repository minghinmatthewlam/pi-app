import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  copyAppBundle,
  extractPackagedReleaseZipAppBundle,
  getDesktopState,
  launchDesktopByExecutable,
  makeUserDataDir,
  makeWorkspace,
  resolveAppBundleExecutable,
  stubNextOpenDialog,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test.skip(process.platform !== "darwin", "Finder-style packaged app coverage is macOS-only");

test("launches a packaged app under a Finder-style PATH and opens the first folder", async () => {
  test.setTimeout(120_000);

  const userDataDir = await makeUserDataDir("pi-gui-finder-env-user-data-");
  const agentDir = join(userDataDir, "agent");
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    join(agentDir, "auth.json"),
    `${JSON.stringify({ openai: { type: "api_key", key: "test-openai-key" } }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(agentDir, "settings.json"),
    `${JSON.stringify(
      {
        defaultProvider: "openai",
        defaultModel: "gpt-5",
        defaultThinkingLevel: "medium",
        enabledModels: ["openai/gpt-5"],
        packages: ["npm:pi-read-mode"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const workspacePath = await makeWorkspace("finder-env-open-folder-workspace");
  const extractedAppBundle = await extractPackagedReleaseZipAppBundle();
  const installedAppBundle = join("/Applications", `pi-gui finder env ${Date.now()}.app`);
  await copyAppBundle(extractedAppBundle, installedAppBundle);
  const executablePath = await resolveAppBundleExecutable(installedAppBundle);

  const harness = await launchDesktopByExecutable(executablePath, userDataDir, {
    agentDir,
    testMode: "background",
    inheritParentEnv: false,
    envOverrides: {
      HOME: process.env.HOME,
      USER: process.env.USER,
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    },
  });

  try {
    const window = await harness.firstWindow();
    await expect(window.getByTestId("empty-state")).toBeVisible();
    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        return {
          workspaceCount: state.workspaces.length,
          lastError: state.lastError ?? null,
        };
      })
      .toEqual({
        workspaceCount: 0,
        lastError: null,
      });

    await stubNextOpenDialog(harness, [workspacePath]);
    await window.getByRole("button", { name: "Open first folder" }).click();

    await waitForWorkspaceByPath(window, workspacePath);
    await expect(window.getByTestId("workspace-list")).toContainText(basename(workspacePath));
    await expect(window.getByTestId("new-thread-composer")).toBeVisible();
    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        return state.lastError ?? null;
      })
      .toBeNull();
  } finally {
    await harness.close();
    await rm(installedAppBundle, { recursive: true, force: true });
  }
});
