// Temp bulk-stamp script: prepends `status: archive` frontmatter to unlabeled docs.
// Mirrors check-docs-freshness.mjs scope (docs/ recursive, skip docs/archive).
// Skip-list per task spec.
// Cap: 100 files per pass.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";

const CWD = process.cwd();
const ROOT = resolve(CWD, "docs");
const SKIP_DIRS = new Set(["archive"]);
const CAP = 100;

const SKIP_FILES = new Set([
  "tasks/CURRENT-SPRINT.md",
  "tasks/BACKLOG.md",
  "tasks/HANDOFF.md",
  "tasks/data-api.md",
  "tasks/lessons.md",
]);

const STAMP = `---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

`;

async function walk(dir, out = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch (e) { if (e.code === "ENOENT") return out; throw e; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walk(full, out);
    } else if (e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".yaml"))) {
      out.push(full);
    }
  }
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

function hasStatusInFirst10(text) {
  const lines = text.split(/\r?\n/).slice(0, 10);
  return lines.some(l => /^\s*status\s*:/i.test(l));
}

const files = await walk(ROOT);
const candidates = [];
for (const f of files) {
  const rel = relative(CWD, f).replace(/\\/g, "/");
  if (SKIP_FILES.has(rel)) continue;
  const text = await readFile(f, "utf8");
  const fm = parseFrontmatter(text);
  const status = fm ? (fm.status || "").toLowerCase() : "";
  // Already labeled (any recognized bucket) - skip
  if (status === "living" || status === "snapshot" || status === "needs-verification" || status === "archive" || status === "pointer") continue;
  // Paranoia: status: present in first 10 lines but not in frontmatter (malformed) - skip
  if (hasStatusInFirst10(text)) continue;
  candidates.push({ file: f, rel, text });
}

const stamped = [];
const todo = [];
for (let i = 0; i < candidates.length; i++) {
  if (i >= CAP) {
    todo.push(candidates[i].rel);
    continue;
  }
  const { file, rel, text } = candidates[i];
  // Strip a leading BOM if present, prepend stamp + original text
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xfeff) cleanText = cleanText.slice(1);
  await writeFile(file, STAMP + cleanText, "utf8");
  stamped.push(rel);
}

console.log(`STAMPED=${stamped.length}`);
console.log(`TODO=${todo.length}`);
console.log("--- STAMPED ---");
for (const f of stamped) console.log(f);
if (todo.length > 0) {
  console.log("--- TODO (cap reached) ---");
  for (const f of todo) console.log(f);
}
