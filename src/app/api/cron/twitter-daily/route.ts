// POST /api/cron/twitter-daily
//
// Daily thread generator + publisher. Scheduled for 14:00 UTC via
// .github/workflows/cron-twitter-daily.yml — that hour catches the
// US workday open + UK afternoon, the strongest single engagement
// window for a tech audience.
//
// Auth: CRON_SECRET bearer (same model as every other cron route).
// The adapter is selected from env by selectOutboundAdapter() —
// missing creds degrade to a no-op + audit row with status=skipped,
// NOT a 500.

import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { getDerivedRepos } from "@/lib/derived-repos";
import { listIdeas, toPublicIdea, hotScore } from "@/lib/ideas";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";

import { recordOutboundRun } from "@/lib/twitter/outbound/audit";
import { selectOutboundAdapter } from "@/lib/twitter/outbound/adapters";
import { composeDailyBreakouts } from "@/lib/twitter/outbound/composer";

interface DailyResponse {
  ok: true;
  adapter: string;
  status: "published" | "logged" | "skipped";
  postCount: number;
  threadUrl: string | null;
  runId: string;
}

interface ErrorResponse {
  ok: false;
  error: string;
}

/**
 * Pick the top 3 repos to highlight today. "Top" = highest
 * cross-signal score among repos with channelsFiring >= 2, sorted by
 * 24h star delta as the tiebreaker.
 */
function pickDailyBreakouts(now: Date = new Date()) {
  void now;
  const repos = getDerivedRepos();
  return repos
    .filter((r) => (r.channelsFiring ?? 0) >= 2)
    .sort((a, b) => {
      const aCSS = a.crossSignalScore ?? 0;
      const bCSS = b.crossSignalScore ?? 0;
      if (bCSS !== aCSS) return bCSS - aCSS;
      return (b.starsDelta24h ?? 0) - (a.starsDelta24h ?? 0);
    })
    .slice(0, 3);
}

/**
 * Highest hot-score idea in the last 7 days. Skips pending/rejected
 * since those don't render publicly.
 */
async function pickTopIdeaOfWeek(now: Date = new Date()) {
  const all = await listIdeas();
  const weekAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const candidates = all.filter((r) => {
    if (r.status !== "published" && r.status !== "shipped") return false;
    const ts = Date.parse(r.publishedAt ?? r.createdAt);
    return Number.isFinite(ts) && ts >= weekAgoMs;
  });
  if (candidates.length === 0) return null;
  const scored = await Promise.all(
    candidates.map(async (record) => {
      const reactions = await listReactionsForObject("idea", record.id);
      const counts = countReactions(reactions);
      return {
        record,
        score: hotScore(
          { createdAt: record.publishedAt ?? record.createdAt },
          counts,
          now.getTime(),
        ),
      };
    }),
  );
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.record ?? null;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<DailyResponse | ErrorResponse>> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny as NextResponse<ErrorResponse>;

  const startedAt = new Date().toISOString();
  const adapter = selectOutboundAdapter();

  try {
    const breakouts = pickDailyBreakouts();
    const topIdeaRaw = await pickTopIdeaOfWeek();
    const thread = composeDailyBreakouts({
      breakouts,
      topIdea: topIdeaRaw ? toPublicIdea(topIdeaRaw) : null,
    });

    const result = await adapter.postThread(thread);
    // Status is "published" iff the adapter both publishes AND returned
    // at least one published post. Logging adapters map to "logged";
    // null adapter to "skipped".
    const anyPublished = result.posts.some((p) => p.status === "published");
    const anyLogged = result.posts.some((p) => p.status === "logged");
    const status: DailyResponse["status"] = anyPublished
      ? "published"
      : anyLogged
        ? "logged"
        : "skipped";

    const run = await recordOutboundRun({
      kind: "daily_breakouts",
      adapterName: adapter.name,
      status,
      threadUrl: result.threadUrl,
      postCount: thread.length,
      startedAt,
    });

    return NextResponse.json({
      ok: true,
      adapter: adapter.name,
      status,
      postCount: thread.length,
      threadUrl: result.threadUrl,
      runId: run.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordOutboundRun({
      kind: "daily_breakouts",
      adapterName: adapter.name,
      status: "error",
      threadUrl: null,
      postCount: 0,
      startedAt,
      errorMessage: message,
    }).catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
