// POST /api/cron/webhooks/scan
//
// Companion cron for /api/cron/webhooks/flush.
//
// Scans the latest derived repos + funding-news feed and enqueues
// breakout / funding deliveries via the publish* layer. Idempotent by
// design — `publishBreakoutToWebhooks` dedupes on
// `${event}:${subjectId}:${targetId}`, so running this every 30min
// without a completed flush in between never duplicates rows.
//
// Auth: CRON_SECRET bearer.
//
// Response:
//   { ok, breakoutsSeen, breakoutsEnqueued, fundingSeen, fundingEnqueued,
//     durationMs }

import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { getDerivedRepos } from "@/lib/derived-repos";
import {
  getFundingSignals,
  refreshFundingNewsFromStore,
} from "@/lib/funding-news";
import {
  publishBreakoutToWebhooks,
  publishFundingEvent,
} from "@/lib/webhooks/publish";
import type {
  WebhookBreakoutRepo,
  WebhookFundingEvent,
} from "@/lib/webhooks/types";

export const runtime = "nodejs";

const BREAKOUT_COMMIT_WINDOW_HOURS = 6;
const FUNDING_WINDOW_HOURS = 48;

const POST_CACHE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

// ---------------------------------------------------------------------------
// Test override — inject fake repos / funding signals so the scan test
// doesn't depend on committed JSON state. Same symbol pattern the drain
// uses.
// ---------------------------------------------------------------------------

export interface WebhookScanTestOverrides {
  repos?: WebhookBreakoutRepo[];
  fundingEvents?: WebhookFundingEvent[];
  now?: number;
}

const WEBHOOK_SCAN_TEST_KEY = Symbol.for("starscreener.webhooks.scan.test");

interface OverrideBag {
  overrides?: WebhookScanTestOverrides;
}

function getOverrides(): WebhookScanTestOverrides {
  const bag = (globalThis as unknown as Record<symbol, OverrideBag | undefined>)[
    WEBHOOK_SCAN_TEST_KEY
  ];
  return bag?.overrides ?? {};
}

(globalThis as unknown as Record<symbol, OverrideBag>)[
  WEBHOOK_SCAN_TEST_KEY
] = (globalThis as unknown as Record<symbol, OverrideBag>)[
  WEBHOOK_SCAN_TEST_KEY
] ?? {};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withinHours(iso: string | undefined, hours: number, nowMs: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= hours * 60 * 60 * 1000 && nowMs - t >= 0;
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

interface ScanResult {
  breakoutsSeen: number;
  breakoutsEnqueued: number;
  breakoutsSkipped: number;
  fundingSeen: number;
  fundingEnqueued: number;
  fundingSkipped: number;
  durationMs: number;
}

async function runScan(): Promise<ScanResult> {
  const startedAt = Date.now();
  const overrides = getOverrides();
  const nowMs = typeof overrides.now === "number" ? overrides.now : Date.now();

  // Pull fresh funding-news from the data-store before reading the cache.
  // No-op when overrides supply the events directly (test path).
  if (!overrides.fundingEvents) {
    await refreshFundingNewsFromStore();
  }

  // --- Breakouts ---
  let breakoutRepos: WebhookBreakoutRepo[];
  if (overrides.repos) {
    breakoutRepos = overrides.repos;
  } else {
    const all = getDerivedRepos();
    breakoutRepos = all
      .filter((r) => r.movementStatus === "breakout")
      .filter((r) =>
        withinHours(r.lastCommitAt, BREAKOUT_COMMIT_WINDOW_HOURS, nowMs),
      )
      .map(
        (r): WebhookBreakoutRepo => ({
          fullName: r.fullName,
          name: r.name,
          owner: r.owner,
          description: r.description,
          url: r.url,
          language: r.language,
          stars: r.stars,
          momentumScore: r.momentumScore,
          movementStatus: r.movementStatus,
          lastCommitAt: r.lastCommitAt,
          starsDelta24h: r.starsDelta24h,
          starsDelta7d: r.starsDelta7d,
        }),
      );
  }

  let breakoutsEnqueued = 0;
  let breakoutsSkipped = 0;
  for (const repo of breakoutRepos) {
    const { enqueued, skipped } = await publishBreakoutToWebhooks(repo);
    breakoutsEnqueued += enqueued;
    breakoutsSkipped += skipped;
  }

  // --- Funding ---
  let fundingEvents: WebhookFundingEvent[];
  if (overrides.fundingEvents) {
    fundingEvents = overrides.fundingEvents;
  } else {
    fundingEvents = getFundingSignals()
      .filter((s) => withinHours(s.publishedAt, FUNDING_WINDOW_HOURS, nowMs))
      .map(
        (s): WebhookFundingEvent => ({
          id: s.id,
          headline: s.headline,
          description: s.description,
          sourceUrl: s.sourceUrl,
          publishedAt: s.publishedAt,
          companyName: s.extracted?.companyName,
          amountDisplay: s.extracted?.amountDisplay,
          amountUsd: s.extracted?.amount ?? null,
          roundType: s.extracted?.roundType,
        }),
      );
  }

  let fundingEnqueued = 0;
  let fundingSkipped = 0;
  for (const event of fundingEvents) {
    const { enqueued, skipped } = await publishFundingEvent(event);
    fundingEnqueued += enqueued;
    fundingSkipped += skipped;
  }

  return {
    breakoutsSeen: breakoutRepos.length,
    breakoutsEnqueued,
    breakoutsSkipped,
    fundingSeen: fundingEvents.length,
    fundingEnqueued,
    fundingSkipped,
    durationMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  try {
    const result = await runScan();
    return NextResponse.json(
      { ok: true as const, ...result },
      { headers: POST_CACHE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api:cron:webhooks:scan] unexpected failure", err);
    return NextResponse.json(
      { ok: false as const, error: message },
      { status: 500, headers: POST_CACHE_HEADERS },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
