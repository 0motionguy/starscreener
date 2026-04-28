// Verification harness for the social-mention persistence fix
// (F-DATA-social-persist).
//
// Bypasses the HTTP layer so it can run against a cold process without the
// dev server — exercises `pipeline.ingestBatch` directly, waits for the
// debounced persist to flush, and reports the resulting `.data/mentions.jsonl`
// size before/after plus a per-source mention count.
//
// Usage:
//   npx tsx scripts/verify-mentions.ts                 # default: vercel/next.js
//   npx tsx scripts/verify-mentions.ts owner/repo ...  # one or more repos
//
// Exits with code 0 on any positive growth, 1 otherwise.

import { promises as fs } from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";

// Brand-migration shim: prefer the new TRENDINGREPO_* env name, fall back
// to the legacy STARSCREENER_*. Inlined here (no warn) because scripts run
// in CI; the deprecation chatter belongs in the app's boot path.
const readEnv = (newName: string, oldName: string): string | undefined =>
  process.env[newName] ?? process.env[oldName];

// Load .env / .env.local the same way scripts/_load-env.mjs does, so
// GITHUB_TOKEN + STARSCREENER_PERSIST + STARSCREENER_DATA_DIR are all
// picked up for this one-off harness.
loadEnvConfig(process.cwd());

import { pipeline } from "../src/lib/pipeline/pipeline";
import { getDefaultSocialAdapters } from "../src/lib/pipeline/adapters/social-adapters";
import { createGitHubAdapter } from "../src/lib/pipeline/ingestion/ingest";
import type { SocialAdapter, RepoMention } from "../src/lib/pipeline/types";

const MENTIONS_PATH = path.join(process.cwd(), ".data", "mentions.jsonl");

interface Counter {
  mentions: number;
  failures: number;
}

function wrap(source: SocialAdapter[]): {
  adapters: SocialAdapter[];
  counters: Record<string, Counter>;
} {
  const counters: Record<string, Counter> = {};
  const adapters = source.map((inner) => {
    counters[inner.id] = { mentions: 0, failures: 0 };
    const c = counters[inner.id];
    return {
      id: inner.id,
      platform: inner.platform,
      async fetchMentionsForRepo(fullName: string, since?: string): Promise<RepoMention[]> {
        try {
          const r = await inner.fetchMentionsForRepo(fullName, since);
          c.mentions += r.length;
          return r;
        } catch (err) {
          c.failures += 1;
          console.error(
            `[verify:social:${inner.id}] error for ${fullName}:`,
            err instanceof Error ? err.message : String(err),
          );
          return [];
        }
      },
    } satisfies SocialAdapter;
  });
  return { adapters, counters };
}

async function sizeOf(p: string): Promise<number> {
  try {
    const s = await fs.stat(p);
    return s.size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }
}

async function main(): Promise<void> {
  const repos = process.argv.slice(2);
  const fullNames = repos.length > 0 ? repos : ["vercel/next.js"];

  console.log(`[verify] starting, repos=${fullNames.join(",")}`);
  const beforeSize = await sizeOf(MENTIONS_PATH);
  console.log(`[verify] .data/mentions.jsonl before: ${beforeSize} bytes`);

  await pipeline.ensureReady();

  // If there's no GITHUB_TOKEN, allow the mock adapter (STARSCREENER_ALLOW_MOCK)
  // or hand the mock directly. We still want the social adapters to run against
  // live Reddit/HN/GitHub — those don't depend on GITHUB_TOKEN for search (the
  // GitHub issue-search adapter degrades gracefully on rate-limit).
  const token = process.env.GITHUB_TOKEN;
  const useMock = !token;
  if (
    useMock &&
    readEnv("TRENDINGREPO_ALLOW_MOCK", "STARSCREENER_ALLOW_MOCK") !== "true"
  ) {
    process.env.TRENDINGREPO_ALLOW_MOCK = "true";
  }
  const githubAdapter = createGitHubAdapter({ useMock, token });

  const { adapters, counters } = wrap(getDefaultSocialAdapters());

  const batch = await pipeline.ingestBatch(fullNames, {
    githubAdapter,
    socialAdapters: adapters,
  });

  console.log(
    `[verify] ingestBatch ok=${batch.ok} failed=${batch.failed} total=${batch.total}`,
  );
  for (const [id, c] of Object.entries(counters)) {
    console.log(
      `[verify] social ${id}: mentions=${c.mentions} failures=${c.failures}`,
    );
  }

  // Persist immediately so we can inspect the file without waiting for
  // the debounced flush.
  await pipeline.flushPersist();

  const afterSize = await sizeOf(MENTIONS_PATH);
  console.log(`[verify] .data/mentions.jsonl after:  ${afterSize} bytes`);
  console.log(`[verify] delta:                       ${afterSize - beforeSize} bytes`);

  if (afterSize > beforeSize) {
    console.log("[verify] OK — mentions persisted");
    process.exit(0);
  } else {
    console.log(
      "[verify] FAIL — mentions.jsonl did not grow. Check social adapter logs above.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[verify] fatal:", err);
  process.exit(2);
});
