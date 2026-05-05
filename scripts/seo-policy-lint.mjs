#!/usr/bin/env node
// SEO policy lint for App Router pages.
//
// Policy: every new src/app/**/page.tsx must export metadata directly,
// generateMetadata, or re-export metadata from another module.
//
// Usage:
//   node scripts/seo-policy-lint.mjs --fail-on-new
//   node scripts/seo-policy-lint.mjs

import { readFile, readdir } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);
const ROOT = process.cwd();
const APP_DIR = resolve(ROOT, "src", "app");
const FAIL_ON_NEW = process.argv.includes("--fail-on-new");

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

async function* walkPageFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkPageFiles(full);
    } else if (entry.isFile() && entry.name === "page.tsx") {
      const rel = relative(ROOT, full).replaceAll("\\", "/");
      yield rel;
    }
  }
}

async function readViolations(files) {
  const violations = [];
  for (const file of files) {
    const content = await readFile(resolve(ROOT, file), "utf8");
    if (!METADATA_EXPORT_RE.test(content)) violations.push(file);
  }
  return violations;
}

async function listAddedPages() {
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
      const file = rest[1];
      if (file?.startsWith("src/app/") && file.endsWith("/page.tsx")) files.push(file);
    }
  }
  return files;
}

async function main() {
  if (FAIL_ON_NEW) {
    let addedPages = [];
    try {
      addedPages = await listAddedPages();
    } catch (error) {
      console.log(
        `[seo-policy-lint] SKIP - unable to compute git diff baseline (${String(
          error?.message ?? error,
        )}).`,
      );
      process.exit(0);
    }

    if (addedPages.length === 0) {
      console.log("[seo-policy-lint] OK - no new page.tsx files in this diff.");
      process.exit(0);
    }

    const violations = await readViolations(addedPages);
    if (violations.length === 0) {
      console.log(
        `[seo-policy-lint] OK - ${addedPages.length} new page.tsx file(s) satisfy metadata policy.`,
      );
      process.exit(0);
    }

    console.error(
      `[seo-policy-lint] FAIL - ${violations.length} new page.tsx file(s) missing metadata export.`,
    );
    console.error("Require one of:");
    console.error("  - export const metadata = { ... }");
    console.error("  - export function/async function generateMetadata(...) { ... }");
    console.error("  - export { metadata } from \"...\" re-export");
    console.error("");
    for (const file of violations) console.error(`  ${file}`);
    process.exit(1);
  }

  const allPages = [];
  for await (const file of walkPageFiles(APP_DIR)) allPages.push(file);
  const violations = await readViolations(allPages);

  const compliant = allPages.length - violations.length;
  console.log(`[seo-policy-lint] pages scanned: ${allPages.length}`);
  console.log(`[seo-policy-lint] compliant: ${compliant}`);
  console.log(`[seo-policy-lint] missing metadata exports: ${violations.length}`);

  if (violations.length > 0) {
    for (const file of violations) console.log(`  ${file}`);
  }
}

await main();
