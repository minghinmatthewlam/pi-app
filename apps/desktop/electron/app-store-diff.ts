import { assertPathInsideWorkspace, runGit } from "./git-runner";

const MAX_BUFFER_STATUS = 2 * 1024 * 1024;
const MAX_BUFFER_DIFF = 5 * 1024 * 1024;
const MAX_BUFFER_STAGE = 1 * 1024 * 1024;

export interface ChangedFileEntry {
  readonly path: string;
  readonly status: "added" | "modified" | "deleted" | "untracked";
}

export async function getChangedFiles(workspacePath: string): Promise<ChangedFileEntry[]> {
  const result = await runGit(["status", "--porcelain"], {
    cwd: workspacePath,
    maxBuffer: MAX_BUFFER_STATUS,
  });
  if (!result.ok) {
    return [];
  }
  const entries: ChangedFileEntry[] = [];
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const xy = line.slice(0, 2);
    let filePath = line.slice(3).trim();
    // Renames show as "old -> new"; use the new path
    const renameArrow = filePath.indexOf(" -> ");
    if (renameArrow >= 0) {
      filePath = filePath.slice(renameArrow + 4);
    }
    entries.push({
      path: filePath,
      status: parseStatus(xy),
    });
  }
  return entries;
}

export async function getFileDiff(workspacePath: string, filePath: string): Promise<string> {
  assertPathInsideWorkspace(workspacePath, filePath);

  // Working-tree diff first.
  const working = await runGit(["diff", "--", filePath], {
    cwd: workspacePath,
    maxBuffer: MAX_BUFFER_DIFF,
  });
  if (working.ok && working.stdout.trim()) {
    return working.stdout;
  }

  // Fall through to staged diff if working tree is clean or errored.
  const cached = await runGit(["diff", "--cached", "--", filePath], {
    cwd: workspacePath,
    maxBuffer: MAX_BUFFER_DIFF,
  });
  if (cached.ok && cached.stdout.trim()) {
    return cached.stdout;
  }

  // Fall through to no-index against /dev/null (untracked files).
  // git diff --no-index exits 1 when files differ — that's expected; we keep
  // the stdout regardless of exit status.
  const noIndex = await runGit(["diff", "--no-index", "--", "/dev/null", filePath], {
    cwd: workspacePath,
    maxBuffer: MAX_BUFFER_DIFF,
  });
  return noIndex.stdout || "";
}

export async function stageFile(workspacePath: string, filePath: string): Promise<void> {
  assertPathInsideWorkspace(workspacePath, filePath);
  const result = await runGit(["add", "--", filePath], {
    cwd: workspacePath,
    maxBuffer: MAX_BUFFER_STAGE,
  });
  if (!result.ok) {
    throw result.error ?? new Error(`git add failed for ${filePath}`);
  }
}

function parseStatus(xy: string): ChangedFileEntry["status"] {
  const x = xy[0] ?? " ";
  const y = xy[1] ?? " ";

  if (x === "?" && y === "?") {
    return "untracked";
  }
  if (x === "A" || y === "A") {
    return "added";
  }
  if (x === "D" || y === "D") {
    return "deleted";
  }
  return "modified";
}
