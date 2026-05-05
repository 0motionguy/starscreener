// Temp inventory script: lists unlabeled .md files matching the freshness checker's scope.
// Mirrors scripts/check-docs-freshness.mjs walk semantics: docs/ recursive, skip docs/archive.
// Safe to delete after the bulk-stamp pass.

import { readdir, readFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";

const CWD = process.cwd();
const ROOT = resolve(CWD, "docs");
const SKIP_DIRS = new Set(["archive"]);

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

const files = await walk(ROOT);
const unlabeled = [];
for (const f of files) {
  const text = await readFile(f, "utf8");
  const fm = parseFrontmatter(text);
  const status = fm ? (fm.status || "").toLowerCase() : "";
  // Treat archive as labeled (intent of this sweep)
  if (!fm || (status !== "living" && status !== "snapshot" && status !== "needs-verification" && status !== "archive" && status !== "pointer")) {
    unlabeled.push(relative(CWD, f).replace(/\\/g, "/"));
  }
}
console.log(`UNLABELED_COUNT=${unlabeled.length}`);
for (const f of unlabeled) console.log(f);
