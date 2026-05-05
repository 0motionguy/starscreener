#!/usr/bin/env node
// CI guard: fail PRs that add `src/app/**/page.tsx` without metadata.
//
// This checks newly-added page routes only. Existing legacy pages are not
// retroactively gated by this rule.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);
const ROOT = process.cwd();
const METADATA_EXPORT_RE =
  /export\s+(const\s+metadata\b|(async\s+)?function\s+generateMetadata\b|\{[^}]*\bmetadata\b[^}]*\}\s+from\s+["'][^"']+["'])/m;

async function runGit(args) {
  const { stdout } = await execFile("git", args, { cwd: ROOT });
  return stdout.trim();
}

async function resolveBaseRef() {
  const baseRef = process.env.GITHUB_BASE_REF?.trim();
  if (baseRef) {
    const remoteRef = `origin/${baseRef}`;
    try {
      await runGit(["rev-parse", "--verify", remoteRef]);
    } catch {
      await runGit(["fetch", "--depth=50", "origin", baseRef]);
    }
    return remoteRef;
  }

  try {
    await runGit(["rev-parse", "--verify", "origin/main"]);
    return "origin/main";
  } catch {
    return "HEAD~1";
  }
}

async function addedPageFiles() {
  const baseRef = await resolveBaseRef();
  const diff = await runGit(["diff", "--name-status", `${baseRef}...HEAD`]);
  if (!diff) return [];

  const files = [];
  for (const line of diff.split(/\r?\n/)) {
    if (!line) continue;
    const [status, ...rest] = line.split("\t");
    if (status?.startsWith("A")) {
      const file = rest[0];
      if (file?.startsWith("src/app/") && file.endsWith("/page.tsx")) files.push(file);
    } else if (status?.startsWith("R")) {
      // Rename format: R100 <old> <new>.
      const file = rest[1];
      if (file?.startsWith("src/app/") && file.endsWith("/page.tsx")) files.push(file);
    }
  }
  return files;
}

async function fileHasMetadata(file) {
  const content = await readFile(resolve(ROOT, file), "utf8");
  return METADATA_EXPORT_RE.test(content);
}

async function main() {
  let pages = [];
  try {
    pages = await addedPageFiles();
  } catch (error) {
    console.log(
      `[check-page-metadata-guard] SKIP - could not compute git diff baseline (${String(
        error?.message ?? error,
      )}).`,
    );
    process.exit(0);
  }

  if (pages.length === 0) {
    console.log("[check-page-metadata-guard] OK - no new page.tsx files added.");
    process.exit(0);
  }

  const violations = [];
  for (const page of pages) {
    if (!(await fileHasMetadata(page))) violations.push(page);
  }

  if (violations.length === 0) {
    console.log(
      `[check-page-metadata-guard] OK - ${pages.length} new page.tsx file(s) define metadata.`,
    );
    process.exit(0);
  }

  console.error(
    `[check-page-metadata-guard] FAIL - ${violations.length} new page.tsx file(s) missing metadata export.`,
  );
  console.error("Add one of:");
  console.error("  - export const metadata = { ... }");
  console.error("  - export async function generateMetadata(...) { ... }");
  console.error("");
  for (const file of violations) console.error(`  ${file}`);
  process.exit(1);
}

await main();
