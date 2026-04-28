import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "..", "..");
const rawArgs = process.argv.slice(2);
const extraArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const packageFilters = ["@pi-gui/session-driver", "@pi-gui/pi-sdk-driver", "@pi-gui/catalogs"];

/**
 * If we're inside a git worktree (not the primary checkout) and the user has
 * not set PI_APP_USER_DATA_DIR explicitly, point Electron at a worktree-scoped
 * userData dir. This lets multiple worktrees run `pnpm dev` concurrently
 * without colliding on the singleton-instance lock or stomping on each other's
 * ui-state.json / catalogs.json / transcripts.
 *
 * Primary checkout keeps the default Electron userData (shared with the
 * installed pi-gui.app) so existing session history is untouched.
 */
function ensureWorktreeUserDataDir() {
  if (process.env.PI_APP_USER_DATA_DIR) {
    return;
  }
  let gitDir;
  let gitCommonDir;
  try {
    gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    gitCommonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return; // Not a git repo (e.g. tarball install). Use Electron defaults.
  }
  if (!gitDir || !gitCommonDir || gitDir === gitCommonDir) {
    return; // Primary checkout — keep default userData.
  }
  const hash = createHash("sha1").update(repoRoot).digest("hex").slice(0, 12);
  process.env.PI_APP_USER_DATA_DIR = path.join(homedir(), ".pi-gui-worktrees", hash);
  console.log(`[dev] Worktree detected; using PI_APP_USER_DATA_DIR=${process.env.PI_APP_USER_DATA_DIR}`);
}

async function run(cmd, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${cmd} ${args.join(" ")} exited with ${signal ?? code}`));
    });
  });
}

function start(cmd, args, cwd) {
  return spawn(cmd, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
}

async function main() {
  ensureWorktreeUserDataDir();
  await run(
    "pnpm",
    ["--dir", repoRoot, "--filter", packageFilters[0], "--filter", packageFilters[1], "--filter", packageFilters[2], "run", "build"],
    desktopDir,
  );

  const children = [
    start(
      "pnpm",
      [
        "--dir",
        repoRoot,
        "--parallel",
        "--filter",
        packageFilters[0],
        "--filter",
        packageFilters[1],
        "--filter",
        packageFilters[2],
        "run",
        "build",
        "--watch",
      ],
      desktopDir,
    ),
    start("pnpm", ["exec", "electron-vite", "dev", "--watch", ...extraArgs], desktopDir),
  ];

  let exiting = false;
  const stopChildren = () => {
    if (exiting) {
      return;
    }
    exiting = true;
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  };

  for (const child of children) {
    child.once("exit", (code, signal) => {
      stopChildren();
      process.exitCode = code ?? (signal ? 1 : 0);
    });
    child.once("error", (error) => {
      console.error(error);
      stopChildren();
      process.exitCode = 1;
    });
  }

  process.once("SIGINT", () => {
    stopChildren();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stopChildren();
    process.exit(143);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
