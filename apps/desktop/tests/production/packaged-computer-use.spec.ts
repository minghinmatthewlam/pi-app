import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createNamedThread,
  launchPackagedDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

const computerUseLikeExtensionSource = String.raw`
import { Type } from "@mariozechner/pi-ai";
import { defineTool } from "@mariozechner/pi-coding-agent";

const dragTool = defineTool({
  name: "drag",
  label: "Drag",
  description: "Drag to a screen position",
  parameters: Type.Object({
    x: Type.Number(),
    y: Type.Number(),
  }),
  async execute(_toolCallId, params) {
    return {
      content: [{ type: "text", text: "drag " + params.x + "," + params.y }],
    };
  },
});

export default function computerUseLikeExtension(pi) {
  pi.registerTool(dragTool);

  pi.on("session_start", async (_event, ctx) => {
    await ctx.ui.select("Computer use permissions", ["Open System Settings"]);
  });

  pi.registerCommand("computer-use-smoke", {
    description: "Confirm the computer-use extension loaded",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Packaged computer use command ready", "info");
    },
  });
}
`;

async function installComputerUseLikePackage(agentDir: string, packagePath: string): Promise<void> {
  const extensionDir = join(packagePath, "extensions");
  await mkdir(extensionDir, { recursive: true });
  await writeFile(
    join(packagePath, "package.json"),
    `${JSON.stringify(
      {
        name: "pi-computer-use",
        type: "module",
        pi: {
          extensions: ["./extensions/computer-use.ts"],
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(join(extensionDir, "computer-use.ts"), `${computerUseLikeExtensionSource}\n`, "utf8");

  const settingsPath = join(agentDir, "settings.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  settings.packages = [packagePath];
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

test("packaged app loads a pi-computer-use-like package without blocking startup", async () => {
  test.setTimeout(120_000);
  const userDataDir = await makeUserDataDir("pi-gui-packaged-computer-use-user-data-");
  const workspacePath = await makeWorkspace("packaged-computer-use-workspace");
  const packagePath = await makeWorkspace("packaged-pi-computer-use-package");
  const agentDir = join(userDataDir, "agent");
  await seedAgentDir(agentDir);
  await installComputerUseLikePackage(agentDir, packagePath);

  const harness = await launchPackagedDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Packaged computer use extension session");
    await expect(window.getByTestId("extension-dialog")).toHaveCount(0);

    const composer = window.getByTestId("composer");
    await composer.fill("/computer-use-smoke ");
    await composer.press("Enter");
    await expect(window.locator(".timeline")).toContainText("Packaged computer use command ready");
  } finally {
    await harness.close();
  }
});
