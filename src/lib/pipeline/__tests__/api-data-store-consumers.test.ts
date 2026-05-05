import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

type Rule = {
  id: string;
  getterPattern: RegExp;
  requiredRefreshPatterns: RegExp[];
};

const API_ROOT = path.resolve(process.cwd(), "src/app/api");

const RULES: Rule[] = [
  {
    id: "derived-repos",
    getterPattern: /\bgetDerivedRepos\(|\bgetDerivedRepoByFullName\(|\bgetDerivedRepoById\(/,
    requiredRefreshPatterns: [
      /\brefreshTrendingFromStore\(/,
      /\brefreshRecentReposFromStore\(/,
      /\brefreshRepoMetadataFromStore\(/,
    ],
  },
  {
    id: "twitter-signals",
    getterPattern: /\bgetTwitter(?:RepoPanel|Leaderboard|TrendingRepoLeaderboard|OverviewStats|AdminReview|ScanCandidates)\(/,
    requiredRefreshPatterns: [/\brefreshTwitterSignalsFromStore\(/],
  },
  {
    id: "model-usage",
    getterPattern: /\bget(?:ModelMetadata|DailyByModel|DailyByFeature|ModelUsageWindow|ModelOverviewMetrics)\(/,
    requiredRefreshPatterns: [/\brefreshModelUsageFromStore\(/],
  },
];

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listRouteFiles(full));
      continue;
    }
    if (entry === "route.ts" || entry === "route.tsx") out.push(full);
  }
  return out;
}

test("API data-store consumer compliance: sync getters include required refresh preloads", () => {
  const files = listRouteFiles(API_ROOT);
  const violations: string[] = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");

    for (const rule of RULES) {
      if (!rule.getterPattern.test(src)) continue;
      for (const required of rule.requiredRefreshPatterns) {
        if (required.test(src)) continue;
        violations.push(`${path.relative(process.cwd(), file)} missing ${required} for ${rule.id}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found API route data-store compliance violations:\n${violations.join("\n")}`,
  );
});

test("Twitter page preloads twitter signals from data-store", () => {
  const file = path.resolve(process.cwd(), "src/app/twitter/page.tsx");
  const src = readFileSync(file, "utf8");

  assert.match(
    src,
    /\brefreshTwitterSignalsFromStore\(/,
    `${path.relative(process.cwd(), file)} must call refreshTwitterSignalsFromStore() before sync twitter getters`,
  );
});
