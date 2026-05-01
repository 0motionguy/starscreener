// Producer script: enqueue AISO rescans for every entity in
// data/agent-commerce.json that has a usable URL.
//
// URL fallback chain (first defined wins):
//   1. links.website
//   2. links.docs
//   3. links.homepage
//   4. links.npm        (only if it points at https://www.npmjs.com/package/...)
//   5. links.github     (last resort; full URL or built from owner/name)
//
// Use --no-fallback to restore strict website-only behavior.
//
// Rows append to .data/aiso-rescan-queue.jsonl (resolved by file-persistence
// against the configured data dir). The drain cron
// (.github/workflows/cron-aiso-drain.yml) fires every 30min and pops rows,
// scans, persists, truncates.
//
// Usage:
//   npx tsx scripts/submit-agent-commerce-aiso.ts --dry-run
//   npx tsx scripts/submit-agent-commerce-aiso.ts
//   npx tsx scripts/submit-agent-commerce-aiso.ts --force
//   npx tsx scripts/submit-agent-commerce-aiso.ts --no-fallback
//
// See tasks/agent-commerce/phase-a1-aiso-spec.md §7 for the design rationale.

import { readFileSync } from "node:fs";
import path from "node:path";

import { appendJsonlFile } from "@/lib/pipeline/storage/file-persistence";
import {
  getRepoProfile,
  refreshRepoProfilesFromStore,
} from "@/lib/repo-profiles";

type UrlSource = "website" | "docs" | "homepage" | "npm" | "github";

interface AgentCommerceItem {
  id: string;
  slug: string;
  name: string;
  links?: {
    website?: string;
    docs?: string;
    homepage?: string;
    npm?: string;
    github?: string;
  };
}

interface AgentCommerceFile {
  items: AgentCommerceItem[];
}

interface UrlPick {
  url: string;
  source: UrlSource;
}

function parseLimit(args: string[]): number | null {
  const idx = args.indexOf("--limit");
  if (idx === -1 || idx === args.length - 1) return null;
  const n = parseInt(args[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isHttpUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isNpmPackageUrl(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    /^https:\/\/www\.npmjs\.com\/package\/[^\s]+/i.test(value)
  );
}

function buildGithubUrl(item: AgentCommerceItem): string | null {
  const raw = item.links?.github;
  if (typeof raw === "string" && raw.length > 0) {
    if (isHttpUrl(raw)) return raw;
    // owner/name shape (no scheme, no leading slash)
    if (/^[^\/\s]+\/[^\/\s]+$/.test(raw)) {
      return `https://github.com/${raw}`;
    }
  }
  // Last-ditch: derive from item.id if it has owner/name shape.
  if (typeof item.id === "string" && /^[^\/\s:]+\/[^\/\s]+$/.test(item.id)) {
    return `https://github.com/${item.id}`;
  }
  return null;
}

function pickUrl(item: AgentCommerceItem, fallback: boolean): UrlPick | null {
  const website = item.links?.website;
  if (isHttpUrl(website)) return { url: website, source: "website" };

  if (!fallback) return null;

  const docs = item.links?.docs;
  if (isHttpUrl(docs)) return { url: docs, source: "docs" };

  const homepage = item.links?.homepage;
  if (isHttpUrl(homepage)) return { url: homepage, source: "homepage" };

  const npm = item.links?.npm;
  if (isNpmPackageUrl(npm)) return { url: npm, source: "npm" };

  const github = buildGithubUrl(item);
  if (github) return { url: github, source: "github" };

  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const fallback = !args.includes("--no-fallback");
  const limit = parseLimit(args);

  const filePath = path.join(process.cwd(), "data", "agent-commerce.json");
  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as AgentCommerceFile;

  await refreshRepoProfilesFromStore();

  let enqueued = 0;
  let skipped = 0;
  const bySource: Record<UrlSource, number> = {
    website: 0,
    docs: 0,
    homepage: 0,
    npm: 0,
    github: 0,
  };
  const now = new Date().toISOString();

  for (const item of data.items) {
    if (limit !== null && enqueued >= limit) {
      console.log(`[stop] reached --limit ${limit}`);
      break;
    }

    const pick = pickUrl(item, fallback);

    if (!pick) {
      console.log(
        `[skip] ${item.id}: no usable URL${fallback ? "" : " (--no-fallback)"}`,
      );
      skipped++;
      continue;
    }

    if (!force) {
      const profile = getRepoProfile(item.id);
      if (profile?.aisoScan?.status === "completed") {
        console.log(`[skip] ${item.id}: already scanned`);
        skipped++;
        continue;
      }
    }

    if (!dryRun) {
      await appendJsonlFile("aiso-rescan-queue.jsonl", {
        fullName: item.id,
        websiteUrl: pick.url,
        requestedAt: now,
        requestIp: "127.0.0.1",
        source: `agent-commerce-producer-${pick.source}`,
      });
    }

    console.log(`[enqueue] ${item.id}: ${pick.url} (${pick.source})`);
    bySource[pick.source]++;
    enqueued++;
  }

  console.log(
    `[summary] enqueued=${enqueued} (website=${bySource.website} docs=${bySource.docs} homepage=${bySource.homepage} npm=${bySource.npm} github=${bySource.github}) skipped=${skipped} dryRun=${dryRun}`,
  );
}

main().catch((err) => {
  console.error("[submit-agent-commerce-aiso] FAILED", err);
  process.exit(1);
});
