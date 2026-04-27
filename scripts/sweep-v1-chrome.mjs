#!/usr/bin/env node
// Bulk-sweep V1 chrome class strings to V2 utility classes.
// Idempotent: runs on the working tree, no-ops if no V1 patterns remain.

import { readFile, writeFile } from "node:fs/promises";

// Auto-discover all .tsx files under src/. Cheap (~1k files) and means
// every new file lands in the sweep without manually maintaining the list.
import { readdir } from "node:fs/promises";
import { join } from "node:path";

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const TARGETS = await walk("src");

// Each rule is { from: regex, to: string }. Order matters — longer
// patterns first so they win over shorter substring matches.
const RULES = [
  // Full chrome with px-N py-N shadow
  {
    from: /\brounded-card\s+border\s+border-border-primary\s+bg-bg-card\s+(p-\d+)\s+shadow-card\b/g,
    to: "v2-card $1",
  },
  {
    from: /\brounded-card\s+border\s+border-border-primary\s+bg-bg-card\s+shadow-card\s+(p-\d+)\b/g,
    to: "v2-card $1",
  },
  // No padding spelt out
  {
    from: /\brounded-card\s+border\s+border-border-primary\s+bg-bg-card\s+shadow-card\b/g,
    to: "v2-card",
  },
  // Reverse-order variants
  {
    from: /\bbg-bg-card\s+border\s+border-border-primary\s+rounded-card\s+(p-\d+)\s+shadow-card\b/g,
    to: "v2-card $1",
  },
  {
    from: /\bbg-bg-card\s+rounded-card\s+border\s+border-border-primary\s+(p-\d+)\s+shadow-card\b/g,
    to: "v2-card $1",
  },
  {
    from: /\bbg-bg-card\s+border\s+border-border-primary\s+rounded-card\s+shadow-card\b/g,
    to: "v2-card",
  },
  {
    from: /\bbg-bg-card\s+rounded-card\s+border\s+border-border-primary\s+shadow-card\b/g,
    to: "v2-card",
  },
  // No-shadow variants (shadow-card already neutered via globals.css; the
  // bare `rounded-card border border-border-primary bg-bg-card` chrome
  // still survives in many places. Replace with v2-card for visual
  // parity + 2px corners.).
  {
    from: /\brounded-card\s+border\s+border-border-primary\s+bg-bg-card\b/g,
    to: "v2-card",
  },
  {
    from: /\bbg-bg-card\s+border\s+border-border-primary\s+rounded-card\b/g,
    to: "v2-card",
  },
  {
    from: /\bbg-bg-card\s+rounded-card\s+border\s+border-border-primary\b/g,
    to: "v2-card",
  },
  // bg-bg-card with rounded-md border-border-primary is the inset-card
  // variant. Map to v2-card for consistency.
  {
    from: /\brounded-md\s+border\s+border-border-primary\s+bg-bg-card\b/g,
    to: "v2-card",
  },
  {
    from: /\bbg-bg-card\s+rounded-md\s+border\s+border-border-primary\b/g,
    to: "v2-card",
  },
  {
    from: /\bborder\s+border-border-primary\s+bg-bg-card\s+rounded-md\b/g,
    to: "v2-card",
  },
];

let totalChanged = 0;
let totalReplacements = 0;

for (const rel of TARGETS) {
  let src;
  try {
    src = await readFile(rel, "utf8");
  } catch (err) {
    console.log(`[skip] ${rel} — ${err.code ?? err.message}`);
    continue;
  }
  let next = src;
  let fileReplacements = 0;
  for (const { from, to } of RULES) {
    const before = next;
    next = next.replace(from, to);
    if (next !== before) {
      const count = (before.match(from) ?? []).length;
      fileReplacements += count;
    }
  }
  if (next !== src) {
    await writeFile(rel, next, "utf8");
    totalChanged += 1;
    totalReplacements += fileReplacements;
    console.log(`[swap] ${rel} — ${fileReplacements} replacement(s)`);
  } else {
    console.log(`[skip] ${rel} — already clean`);
  }
}

console.log(
  `\nDone. ${totalChanged}/${TARGETS.length} files changed, ${totalReplacements} replacements total.`,
);
