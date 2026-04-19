import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const sourcePath = path.join(desktopDir, "resources", "notification-status-helper.swift");
const outputDir = path.join(desktopDir, "build", "native");
const outputPath = path.join(outputDir, "pi-gui-notification-status-helper");

if (process.platform !== "darwin") {
  console.log("Skipping notification status helper build outside macOS.");
  process.exit(0);
}

await mkdir(outputDir, { recursive: true });
await execFileAsync("xcrun", ["swiftc", sourcePath, "-O", "-o", outputPath], {
  cwd: desktopDir,
});
console.log(`Built notification status helper at ${outputPath}`);
