// GET/POST /api/cron/news-auto-recover
//
// Periodic safety net for the server-side auto-rescrape system. While
// the news pages call `triggerScanIfStale` on render, that path only
// fires when a user actually loads the page. This cron sweeps every
// known news source on a fixed cadence so a source that nobody has
// visited still gets dragged back to fresh.
//
// Auth: CRON_SECRET bearer (verifyCronAuth) — same posture as every
// other cron route.
//
// Per source we read its last `fetchedAt` from the per-source loader
// (e.g. `getRedditFetchedAt` from src/lib/reddit-data.ts) and hand it
// off to `triggerScanIfStale`, which itself classifies freshness and
// throttles. This route is therefore safe to call as often as the cron
// scheduler likes — the throttle lives downstream.

import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { triggerScanIfStale } from "@/lib/news/auto-rescrape";
import type { NewsSource } from "@/lib/news/freshness";
import { blueskyFetchedAt } from "@/lib/bluesky";
import { devtoFetchedAt } from "@/lib/devto";
import { hnFetchedAt } from "@/lib/hackernews";
import { lobstersFetchedAt } from "@/lib/lobsters";
import { producthuntFetchedAt } from "@/lib/producthunt";
import { getRedditFetchedAt } from "@/lib/reddit-data";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

type SourceProbe = {
  source: NewsSource;
  read: () => string | null | undefined;
};

// Sources we know how to read a `fetchedAt` for. Twitter is intentionally
// omitted: its freshness is reported through the scan-ingestion system,
// not a JSON file, and there's no `scripts/scrape-twitter.mjs` for the
// auto-rescrape spawner to invoke.
const SOURCE_PROBES: SourceProbe[] = [
  { source: "reddit", read: () => getRedditFetchedAt() },
  { source: "hackernews", read: () => hnFetchedAt },
  { source: "bluesky", read: () => blueskyFetchedAt },
  { source: "devto", read: () => devtoFetchedAt },
  { source: "lobsters", read: () => lobstersFetchedAt },
  { source: "producthunt", read: () => producthuntFetchedAt },
];

// Sources the spec asks us to consider but for which we have no
// per-source `fetchedAt` helper or scrape script. We surface them in the
// response with an explicit skip reason so an operator inspecting the
// payload knows the cron didn't silently drop them.
const SKIPPED_SOURCES: { source: string; reason: string }[] = [
  {
    source: "twitter",
    reason: "no-fetchedat-helper: twitter freshness comes from scan ingestion",
  },
];

export async function POST(request: NextRequest) {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  const results: Record<string, { triggered: boolean; reason: string }> = {};

  for (const probe of SOURCE_PROBES) {
    try {
      const fetchedAt = probe.read();
      const outcome = await triggerScanIfStale(probe.source, fetchedAt);
      results[probe.source] = outcome;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[cron:news-auto-recover] probe failed for ${probe.source}:`,
        message,
      );
      results[probe.source] = {
        triggered: false,
        reason: `error: ${message}`,
      };
    }
  }

  for (const skip of SKIPPED_SOURCES) {
    results[skip.source] = { triggered: false, reason: skip.reason };
  }

  return NextResponse.json(
    { ok: true as const, results },
    { headers: NO_STORE_HEADERS },
  );
}

// GET alias for Vercel Cron, which fires GET (not POST). Matches the
// convention used by /api/cron/aiso-drain.
export async function GET(request: NextRequest) {
  return POST(request);
}
