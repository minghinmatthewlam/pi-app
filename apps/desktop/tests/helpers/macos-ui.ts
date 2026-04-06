import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 20_000;

const OPEN_PANEL_SCRIPT = `
on run argv
  set targetPath to item 1 of argv
  tell application "System Events"
    set frontmostProcess to first application process whose frontmost is true
    set frontmost of frontmostProcess to true
    delay 0.6
    keystroke "g" using {command down, shift down}
    delay 0.5
    keystroke targetPath
    key code 36
    delay 0.75
    key code 36
    delay 0.75
    key code 36
  end tell
end run
`;

export async function assertAccessibilityReady(): Promise<void> {
  const { stdout } = await execFileAsync(
    "osascript",
    ['-e', 'tell application "System Events" to UI elements enabled'],
    { timeout: DEFAULT_TIMEOUT_MS },
  );

  if (stdout.trim() !== "true") {
    throw new Error("macOS Accessibility permission is not enabled for UI scripting");
  }
}

export async function acceptOpenFolderDialog(pathValue: string): Promise<void> {
  await assertAccessibilityReady();
  await runAppleScript(OPEN_PANEL_SCRIPT, [pathValue], DEFAULT_TIMEOUT_MS);
}

export async function acceptOpenImageDialog(pathValue: string): Promise<void> {
  await assertAccessibilityReady();
  await runAppleScript(OPEN_PANEL_SCRIPT, [pathValue], DEFAULT_TIMEOUT_MS);
}

async function runAppleScript(script: string, values: readonly string[], timeoutMs: number): Promise<void> {
  try {
    await execFileAsync("osascript", ["-e", script.trim(), ...values], {
      timeout: timeoutMs,
    });
  } catch (error) {
    if (typeof error === "object" && error !== null) {
      const message = "message" in error ? String(error.message) : String(error);
      const stdout = "stdout" in error ? String(error.stdout ?? "") : "";
      const stderr = "stderr" in error ? String(error.stderr ?? "") : "";
      const code = "code" in error ? String(error.code ?? "") : "";
      const signal = "signal" in error ? String(error.signal ?? "") : "";
      throw new Error(
        `${message}\nexit code: ${code || "<unknown>"}\nsignal: ${signal || "<none>"}\nstdout:\n${stdout || "<empty>"}\nstderr:\n${stderr || "<empty>"}`,
      );
    }

    throw new Error(String(error));
  }
}
