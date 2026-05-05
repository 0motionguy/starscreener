// scripts/check-docs-freshness.mjs
//
// Phase 1.6 of the 2026-05-05 repo restructure: enforce that any doc labeled
// `status: living` has a `last-verified:` frontmatter field newer than 90 days.
// Run weekly via .github/workflows/docs-freshness.yml. Run locally with:
//   node scripts/check-docs-freshness.mjs

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(process.cwd(), "docs");
const SKIP_DIRS = new Set(["archive"]);
const MAX_AGE_DAYS = 90;
const TODAY = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
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

function ageDays(yyyymmdd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return null;
  const d = new Date(yyyymmdd + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((TODAY.getTime() - d.getTime()) / 86_400_000);
}

async function main() {
  let files;
  try {
    files = await walk(ROOT);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.log("docs/ not found - nothing to check.");
      return;
    }
    throw err;
  }

  const errors = [];
  let livingCount = 0;
  let snapshotCount = 0;
  let needsVerificationCount = 0;
  let unlabeled = 0;

  for (const file of files) {
    const rel = relative(process.cwd(), file).replace(/\\/g, "/");
    const text = await readFile(file, "utf8");
    const fm = parseFrontmatter(text);
    if (!fm) {
      unlabeled++;
      continue;
    }
    const status = (fm.status || "").toLowerCase();
    if (status === "living") {
      livingCount++;
      const lv = fm["last-verified"];
      if (!lv) {
        errors.push(`${rel}: status=living but missing 'last-verified:' frontmatter field`);
        continue;
      }
      const days = ageDays(lv);
      if (days === null) {
        errors.push(`${rel}: status=living but 'last-verified' is not YYYY-MM-DD ('${lv}')`);
        continue;
      }
      if (days > MAX_AGE_DAYS) {
        errors.push(`${rel}: status=living 'last-verified: ${lv}' is ${days} days old (>${MAX_AGE_DAYS})`);
      }
    } else if (status === "snapshot") {
      snapshotCount++;
    } else if (status === "needs-verification") {
      needsVerificationCount++;
    } else {
      unlabeled++;
    }
  }

  if (errors.length > 0) {
    for (const line of errors) console.error(`FAIL ${line}`);
    console.error(`\n${errors.length} freshness error(s) across ${livingCount} living doc(s).`);
    process.exit(1);
  }

  console.log(`PASS ${livingCount} living doc(s) within ${MAX_AGE_DAYS}d (${files.length} total scanned).`);
  console.log(`INFO snapshot=${snapshotCount} needs-verification=${needsVerificationCount} unlabeled=${unlabeled}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
