// scripts/check-living-docs-have-frontmatter.mjs
//
// Companion guard to check-docs-freshness.mjs. Catches the failure mode where
// a doc has a `status: living` claim somewhere but the YAML frontmatter is
// missing or malformed - i.e. ensures check-docs-freshness.mjs actually has
// every living doc to verify, and that snapshot/pointer docs carry the
// metadata their status promises.
// Run locally:
//   node scripts/check-living-docs-have-frontmatter.mjs

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const CWD = process.cwd();

// Roots to walk. Each entry can be a directory (recursive) or a glob-shaped
// hint resolved manually below.
const ROOT_DIRS = [
  "docs",
  "tasks",
  ".claude/skills/project",
  ".claude/agents/project",
];

// Mirror SKIP_DIRS from check-docs-freshness.mjs plus anything noisy.
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  "archive",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".vercel",
]);

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return out;
    throw err;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR_NAMES.has(e.name)) continue;
      await walk(full, out);
    } else if (e.isFile() && e.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

async function collectRootMarkdown(rootDir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith(".md")) continue;
    out.push(join(rootDir, e.name));
  }
  return out;
}

async function collectSubdirClaudeMd(rootDir) {
  // Walks the tree and picks up every CLAUDE.md outside of skipped dirs.
  const out = [];
  async function inner(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIR_NAMES.has(e.name)) continue;
        await inner(full);
      } else if (e.isFile() && e.name === "CLAUDE.md") {
        out.push(full);
      }
    }
  }
  await inner(rootDir);
  return out;
}

function parseFrontmatter(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = text.slice(3, end).trim();
  const fm = {};
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    fm[m[1]] = val;
  }
  return fm;
}

function isWellFormedDate(v) {
  if (!v || typeof v !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime());
}

async function main() {
  const filesSet = new Set();

  // Walk explicit roots.
  for (const r of ROOT_DIRS) {
    const abs = resolve(CWD, r);
    if (!(await exists(abs))) continue;
    const found = await walk(abs);
    for (const f of found) filesSet.add(f);
  }

  // Root-level *.md.
  for (const f of await collectRootMarkdown(CWD)) filesSet.add(f);

  // Every CLAUDE.md anywhere (subdir convention).
  for (const f of await collectSubdirClaudeMd(CWD)) filesSet.add(f);

  const files = [...filesSet].sort();

  const errors = [];
  let livingCount = 0;
  let snapshotCount = 0;
  let pointerCount = 0;

  for (const file of files) {
    const rel = relative(CWD, file).replace(/\\/g, "/");
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const fm = parseFrontmatter(text);
    if (!fm) continue;
    const status = (fm.status || "").toLowerCase();

    if (status === "living") {
      livingCount++;
      if (!fm["last-verified"]) {
        errors.push(`${rel}: status=living missing 'last-verified:'`);
      } else if (!isWellFormedDate(fm["last-verified"])) {
        errors.push(`${rel}: status=living 'last-verified' not YYYY-MM-DD ('${fm["last-verified"]}')`);
      }
      if (!fm["verified-by"]) {
        errors.push(`${rel}: status=living missing 'verified-by:'`);
      }
    } else if (status === "snapshot") {
      snapshotCount++;
      if (!fm["audit-date"]) {
        errors.push(`${rel}: status=snapshot missing 'audit-date:'`);
      } else if (!isWellFormedDate(fm["audit-date"])) {
        errors.push(`${rel}: status=snapshot 'audit-date' not YYYY-MM-DD ('${fm["audit-date"]}')`);
      }
      if (!fm["reason"]) {
        errors.push(`${rel}: status=snapshot missing 'reason:'`);
      }
    } else if (status === "pointer") {
      pointerCount++;
      if (!fm["supersedes-by"] && !fm["replacement"]) {
        errors.push(`${rel}: status=pointer missing 'supersedes-by:' or 'replacement:'`);
      }
    }
  }

  const summary = `FRONTMATTER: scanned=${files.length} living=${livingCount} snapshot=${snapshotCount} pointer=${pointerCount} violations=${errors.length}`;

  if (errors.length > 0) {
    for (const line of errors) console.error(`FAIL ${line}`);
    console.error(`\n${summary}`);
    process.exit(1);
  }

  console.log(`PASS no frontmatter violations.`);
  console.log(summary);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
