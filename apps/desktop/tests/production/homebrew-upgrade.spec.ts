import { expect, test } from "@playwright/test";
import {
  launchDesktopByExecutable,
  makeUserDataDir,
  makeWorkspace,
} from "../helpers/electron-app";
import { assertPackagedAppCanStartThread } from "./packaged-smoke-assertions";

const executablePath = process.env.PI_APP_HOME_BREW_EXECUTABLE;
const expectedVersion = process.env.PI_APP_HOME_BREW_EXPECTED_VERSION;

test.skip(
  !executablePath || !expectedVersion,
  "Set PI_APP_HOME_BREW_EXECUTABLE and PI_APP_HOME_BREW_EXPECTED_VERSION to run the Homebrew production smoke.",
);

test("launches the upgraded Homebrew-installed app and starts a thread", async () => {
  test.setTimeout(120_000);

  const userDataDir = await makeUserDataDir("pi-gui-homebrew-upgrade-user-data-");
  const workspacePath = await makeWorkspace("homebrew-upgrade-workspace");
  const promptText = "Homebrew upgrade smoke thread";
  const harness = await launchDesktopByExecutable(executablePath as string, userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await expect
      .poll(async () =>
        harness.electronApp.evaluate(({ app, process }) => ({
          execPath: process.execPath,
          version: app.getVersion(),
        })),
      )
      .toEqual({
        execPath: executablePath,
        version: expectedVersion,
      });

    await assertPackagedAppCanStartThread(harness, window, {
      expectedExecutablePath: executablePath as string,
      promptText,
      workspacePath,
    });
  } finally {
    await harness.close();
  }
});
