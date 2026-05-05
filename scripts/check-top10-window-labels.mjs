#!/usr/bin/env node
// CI guard — keep Top10 window-label semantics behind one shared seam.
//
// This blocks regressions where callsites reintroduce local "YTD"/window
// ternaries or helper functions instead of importing from `src/lib/top10/labels.ts`.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RULES = [
  {
    relPath: "src/lib/top10/builders.ts",
    requiredImport: /from\s+["']\.\/labels["']/,
    forbidden: [
      /function\s+windowLabel\s*\(/,
      /w\s*===\s*["']24h["']\s*\?/,
      /w\s*===\s*["']7d["']\s*\?/,
      /w\s*===\s*["']30d["']\s*\?/,
      /["']YTD["']/,
    ],
  },
  {
    relPath: "src/components/top10/Top10PageContent.tsx",
    requiredImport: /from\s+["']@\/lib\/top10\/labels["']/,
    forbidden: [
      /function\s+windowLabel\s*\(/,
      /w\s*===\s*["']ytd["']\s*\?/,
    ],
  },
];

const violations = [];

for (const rule of RULES) {
  const abs = resolve(ROOT, rule.relPath);
  const rel = relative(ROOT, abs).replaceAll("\\", "/");
  const content = await readFile(abs, "utf8");

  if (!rule.requiredImport.test(content)) {
    violations.push(`${rel}: missing required import from labels seam`);
  }

  for (const re of rule.forbidden) {
    if (re.test(content)) {
      violations.push(`${rel}: forbidden pattern matched ${re}`);
    }
  }
}

if (violations.length === 0) {
  console.log("[check-top10-window-labels] OK - top10 window labels are centralized.");
  process.exit(0);
}

console.error(
  `[check-top10-window-labels] FAIL - ${violations.length} drift issue(s) detected.`,
);
for (const v of violations) {
  console.error(`  - ${v}`);
}
process.exit(1);
