#!/usr/bin/env node
// Bulk-sweep V1 chrome class strings to V2 utility classes.
// Idempotent: runs on the working tree, no-ops if no V1 patterns remain.

import { readFile, writeFile } from "node:fs/promises";

const TARGETS = [
  "src/components/admin/IdeasQueueAdmin.tsx",
  "src/components/admin/RevenueQueueAdmin.tsx",
  "src/components/profile/ProfileView.tsx",
  "src/components/producthunt/RecentLaunches.tsx",
  "src/components/ideas/IdeaCard.tsx",
  "src/components/compare/CompareChart.tsx",
  "src/components/compare/CompareSelector.tsx",
  "src/components/tools/RevenueEstimateTool.tsx",
  "src/components/revenue/VerifiedStartupCard.tsx",
  "src/components/repo-detail/ProjectSurfaceMap.tsx",
  "src/components/submissions/DropRevenuePage.tsx",
  "src/components/repo-detail/RepoDetailChart.tsx",
  "src/components/repo-detail/RepoRevenuePanel.tsx",
];

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
