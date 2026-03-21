import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import net from "node:net";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { chromium, type BrowserContext, type Browser, type Page } from "@playwright/test";
import type { PiDesktopApi } from "../src/ipc";

const desktopDir = process.cwd();

export type PiAppWindow = Window & { piApp?: PiDesktopApi };

export interface DesktopHarness {
  firstWindow(): Promise<Page>;
  close(): Promise<void>;
}

export interface LaunchDesktopOptions {
  readonly initialWorkspaces?: readonly string[];
  readonly notificationLogPath?: string;
}

export async function launchDesktop(
  userDataDir: string,
  options: readonly string[] | LaunchDesktopOptions = [],
): Promise<DesktopHarness> {
  const normalized = Array.isArray(options) ? { initialWorkspaces: options } : options;
  const port = await reservePort();
  const electronBinary = await resolveElectronBinary();
  const processHandle = spawn(electronBinary, [`--remote-debugging-port=${port}`, desktopDir], {
    cwd: desktopDir,
    env: {
      ...process.env,
      PI_APP_USER_DATA_DIR: userDataDir,
      PI_APP_INITIAL_WORKSPACES: (normalized.initialWorkspaces ?? []).join(delimiter),
      ...(normalized.notificationLogPath ? { PI_APP_NOTIFICATION_LOG_PATH: normalized.notificationLogPath } : {}),
      PI_APP_OPEN_DEVTOOLS: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser: Browser | undefined;

  try {
    await waitForCdpEndpoint(port);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error("Electron browser context did not open");
    }

    const page = await waitForElectronPage(context);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(() => Boolean((window as PiAppWindow).piApp), undefined, { timeout: 15_000 });

    return {
      firstWindow: async () => page,
      close: async () => {
        await browser?.close().catch(() => undefined);
        processHandle.kill("SIGKILL");
      },
    };
  } catch (error) {
    await browser?.close().catch(() => undefined);
    processHandle.kill("SIGKILL");
    throw error;
  }
}

export async function makeWorkspace(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pi-app-workspace-"));
  const workspacePath = join(root, name);
  await mkdir(workspacePath, { recursive: true });
  await writeFile(join(workspacePath, "README.md"), `# ${name}\n`, "utf8");
  return realpath(workspacePath);
}

export async function getDesktopState(window: Page) {
  const state = await window.evaluate(() => {
    const app = (window as PiAppWindow).piApp;
    if (!app) {
      throw new Error("piApp IPC bridge is unavailable");
    }
    return app.getState();
  });

  if (!state) {
    throw new Error("Desktop state was unavailable");
  }

  return state;
}

export async function addWorkspace(window: Page, workspacePath: string): Promise<void> {
  await window.evaluate(async (pathValue) => {
    const app = (window as PiAppWindow).piApp;
    if (!app) {
      throw new Error("piApp IPC bridge is unavailable");
    }
    await app.addWorkspacePath(pathValue);
  }, workspacePath);
}

export async function createSession(window: Page, workspaceId: string, title: string): Promise<void> {
  await window.evaluate(async ({ workspaceId: workspaceTarget, title: targetTitle }) => {
    const app = (window as PiAppWindow).piApp;
    if (!app) {
      throw new Error("piApp IPC bridge is unavailable");
    }
    const deadline = Date.now() + 10_000;
    let workspace:
      | Awaited<ReturnType<PiDesktopApi["getState"]>>["workspaces"][number]
      | undefined;

    while (Date.now() < deadline) {
      const state = await app.getState();
      workspace = state.workspaces.find((entry) => entry.id === workspaceTarget || entry.path === workspaceTarget);
      if (workspace) {
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceTarget}`);
    }
    await app.createSession({ workspaceId: workspace.id, title: targetTitle });
  }, { workspaceId, title });
}

async function resolveElectronBinary(): Promise<string> {
  const electronModule = (await import("electron")) as unknown;
  if (typeof electronModule === "string") {
    return electronModule;
  }

  if (
    typeof electronModule === "object" &&
    electronModule !== null &&
    "default" in electronModule &&
    typeof (electronModule as { default: unknown }).default === "string"
  ) {
    return (electronModule as { default: string }).default;
  }

  throw new Error("Unable to resolve the Electron executable path");
}

async function reservePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to reserve a remote debugging port")));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForCdpEndpoint(port: number): Promise<void> {
  const url = `http://127.0.0.1:${port}/json/version`;
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for Electron DevTools endpoint on port ${port}`);
}

async function waitForElectronPage(browserContext: BrowserContext): Promise<Page> {
  return browserContext.pages()[0] ?? browserContext.waitForEvent("page", { timeout: 15_000 });
}
