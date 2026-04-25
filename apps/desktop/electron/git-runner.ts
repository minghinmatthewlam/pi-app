import { execFile, type ExecFileException } from "node:child_process";
import path from "node:path";

export interface GitRunOptions {
  // Optional: omit to inherit the parent process cwd (matches worktree-manager's
  // current pattern of relying on `-C <path>` in args).
  readonly cwd?: string;
  // Required: callers must pass an explicit value. There is no implicit default
  // because per-call buffer sizing differs (status: 2MB, diff: 5MB, stage: 1MB,
  // worktree list: 10MB).
  readonly maxBuffer: number;
}

export interface GitRunResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: ExecFileException;
}

/**
 * Run git via `execFile` (never the shell). Always resolves; never throws.
 * Callers inspect `result.ok` and decide how to react (fall through to
 * fallback chain, swallow, surface to user, etc.).
 */
export function runGit(args: readonly string[], options: GitRunOptions): Promise<GitRunResult> {
  return new Promise((resolve) => {
    const execOptions = {
      encoding: "utf8" as const,
      maxBuffer: options.maxBuffer,
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    };
    execFile("git", [...args], execOptions, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, stdout: stdout ?? "", stderr: stderr ?? "", error });
        return;
      }
      resolve({ ok: true, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

/**
 * Throwing variant for callers that prefer exception-based flow.
 * Returns stdout on success, throws on error.
 */
export async function runGitOrThrow(args: readonly string[], options: GitRunOptions): Promise<string> {
  const result = await runGit(args, options);
  if (!result.ok) {
    throw result.error ?? new Error(`git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

/**
 * Argv-injection guard: rejects empty values and values starting with `-`.
 * Used as defense-in-depth alongside the `--` argv separator on positional
 * git arguments. Branch names beginning with `-`, paths beginning with `-`,
 * and start-points beginning with `-` are all rejected before they can be
 * misinterpreted as a flag by git.
 */
export function assertNoLeadingDash(label: string, value: string): void {
  if (value.length === 0) {
    throw new Error(`${label} cannot be empty`);
  }
  if (value.startsWith("-")) {
    throw new Error(`${label} cannot start with '-': ${value}`);
  }
}

/**
 * Lexical-only path resolution (no filesystem access). Use this before
 * passing a path to a git command that creates the path (e.g. `worktree add`).
 * For commands operating on existing paths (e.g. `worktree remove`), use
 * `realpath`-based canonicalization at the call site instead.
 */
export function resolveLexical(value: string): string {
  return path.resolve(value);
}

/**
 * Workspace-escape guard: returns the original (relative) path if it resolves
 * inside `workspacePath`; throws otherwise. Used by diff/status/stage call sites
 * that accept user-supplied file paths inside a known workspace root.
 */
export function assertPathInsideWorkspace(workspacePath: string, candidate: string): string {
  const resolved = path.resolve(workspacePath, candidate);
  if (!resolved.startsWith(workspacePath + path.sep) && resolved !== workspacePath) {
    throw new Error("Path escapes workspace");
  }
  return candidate;
}
