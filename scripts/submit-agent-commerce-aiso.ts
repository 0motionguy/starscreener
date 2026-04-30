// Producer script: enqueue AISO rescans for every entity in
// data/agent-commerce.json that has a website URL.
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
//
// See tasks/agent-commerce/phase-a1-aiso-spec.md §7 for the design rationale.

import { readFileSync } from "node:fs";
import path from "node:path";

import { appendJsonlFile } from "@/lib/pipeline/storage/file-persistence";
import {
  getRepoProfile,
  refreshRepoProfilesFromStore,
} from "@/lib/repo-profiles";

interface AgentCommerceItem {
  id: string;
  slug: string;
  name: string;
  links?: { website?: string };
}

interface AgentCommerceFile {
  items: AgentCommerceItem[];
}

function parseLimit(args: string[]): number | null {
  const idx = args.indexOf("--limit");
  if (idx === -1 || idx === args.length - 1) return null;
  const n = parseInt(args[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const limit = parseLimit(args);

  const filePath = path.join(process.cwd(), "data", "agent-commerce.json");
  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as AgentCommerceFile;

  await refreshRepoProfilesFromStore();

  let enqueued = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const item of data.items) {
    if (limit !== null && enqueued >= limit) {
      console.log(`[stop] reached --limit ${limit}`);
      break;
    }
    const websiteUrl = item.links?.website;

    if (!websiteUrl) {
      console.log(`[skip] ${item.id}: no website URL`);
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
        websiteUrl,
        requestedAt: now,
        requestIp: "127.0.0.1",
        source: "agent-commerce-producer",
      });
    }

    console.log(`[enqueue] ${item.id}: ${websiteUrl}`);
    enqueued++;
  }

  console.log(
    `[summary] enqueued=${enqueued} skipped=${skipped} dryRun=${dryRun}`,
  );
}

main().catch((err) => {
  console.error("[submit-agent-commerce-aiso] FAILED", err);
  process.exit(1);
});
