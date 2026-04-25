import { expect, test } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import {
  assertNoLeadingDash,
  resolveLexical,
  runGit,
} from "../../electron/git-runner";

test.describe("git-runner argv validation", () => {
  test("assertNoLeadingDash rejects empty + leading-dash values", () => {
    expect(() => assertNoLeadingDash("Branch", "")).toThrow(/cannot be empty/);
    expect(() => assertNoLeadingDash("Branch", "-foo")).toThrow(/cannot start with '-'/);
    expect(() => assertNoLeadingDash("Branch", "--exec")).toThrow(/cannot start with '-'/);
    expect(() => assertNoLeadingDash("Branch", "feature/x")).not.toThrow();
    expect(() => assertNoLeadingDash("Branch", "main")).not.toThrow();
  });

  test("resolveLexical resolves without touching the filesystem", () => {
    const result = resolveLexical("/does/not/exist/at/all");
    expect(result).toBe("/does/not/exist/at/all");
  });

  test("runGit returns ok=false on error and never throws", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "git-runner-test-"));
    try {
      // Run git status in a non-git directory: git exits non-zero.
      const result = await runGit(["status"], { cwd: tempDir, maxBuffer: 1024 });
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.stdout).toBe("string");
      expect(typeof result.stderr).toBe("string");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("runGit returns ok=true on success", async () => {
    const result = await runGit(["--version"], { maxBuffer: 1024 });
    expect(result.ok).toBe(true);
    expect(result.stdout).toMatch(/^git version /);
  });
});
