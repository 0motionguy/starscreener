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
import { withBodySizeLimit } from "@/lib/api-helpers";
import { withHealthcheck } from "@/lib/healthcheck";
import { getDerivedRepos } from "@/lib/derived-repos";
import { listIdeas, toPublicIdea, hotScore } from "@/lib/ideas";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";
import { getLastFetchedAt, refreshTrendingFromStore } from "@/lib/trending";

import {
  listOutboundRuns,
  recordOutboundRun,
  zipRunPosts,
} from "@/lib/twitter/outbound/audit";
import { selectOutboundAdapter } from "@/lib/twitter/outbound/adapters";
import { composeDailyBreakouts } from "@/lib/twitter/outbound/composer";
import {
  DAILY_BREAKOUT_COUNT,
  pickDailyBreakouts,
  recentlyFeaturedRepos,
} from "@/lib/twitter/outbound/select";

export const runtime = "nodejs";

/**
 * Don't post from data older than this. Stale trending data is what
 * produces "random-looking" picks — better to skip the day (visibly,
 * via the audit row) than to post garbage.
 */
const MAX_DATA_AGE_MS = 12 * 60 * 60 * 1000;

interface DailyResponse {
  ok: true;
  adapter: string;
  status: "published" | "logged" | "skipped";
  postCount: number;
  threadUrl: string | null;
  runId: string;
  /** Set when status=skipped for a reason other than a null adapter. */
  skippedReason?: string;
}

interface ErrorResponse {
  ok: false;
  error: string;
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

async function handle(
  request: NextRequest,
): Promise<NextResponse<DailyResponse | ErrorResponse>> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny as NextResponse<ErrorResponse>;

  const oversize = withBodySizeLimit(request);
  if (oversize) return oversize as NextResponse<ErrorResponse>;

  const startedAt = new Date().toISOString();
  const adapter = selectOutboundAdapter();

  try {
    // Pull the freshest worker-owned payload from Redis before reading
    // anything — a cold container otherwise composes from the bundled
    // (build-time) JSON. Failure degrades to whatever is cached.
    await refreshTrendingFromStore().catch((err) => {
      console.warn("[api:cron:twitter-daily] refreshTrendingFromStore failed", err);
    });

    // Freshness gate: skip the day rather than post from stale data.
    const fetchedAtMs = Date.parse(getLastFetchedAt());
    const dataAgeMs = Number.isFinite(fetchedAtMs)
      ? Date.now() - fetchedAtMs
      : Number.POSITIVE_INFINITY;
    if (dataAgeMs > MAX_DATA_AGE_MS) {
      const ageHours = Number.isFinite(dataAgeMs)
        ? `${(dataAgeMs / 3_600_000).toFixed(1)}h`
        : "unknown";
      const reason = `stale-data (trending payload age ${ageHours} > 12h)`;
      const run = await recordOutboundRun({
        kind: "daily_breakouts",
        adapterName: adapter.name,
        status: "skipped",
        threadUrl: null,
        postCount: 0,
        startedAt,
        errorMessage: reason,
      });
      return NextResponse.json({
        ok: true,
        adapter: adapter.name,
        status: "skipped",
        postCount: 0,
        threadUrl: null,
        runId: run.id,
        skippedReason: reason,
      });
    }

    // Repos featured in the last 7 days sit out so the thread doesn't
    // repeat itself. Best-effort — an empty/fresh audit file means no
    // exclusions.
    const previousRuns = await listOutboundRuns().catch(() => []);
    const breakouts = pickDailyBreakouts(getDerivedRepos(), {
      count: DAILY_BREAKOUT_COUNT,
      // Cooldown only counts prior DAILY threads — a Friday-recap
      // appearance shouldn't knock a repo out of a week of dailies.
      exclude: recentlyFeaturedRepos(previousRuns, {
        kinds: ["daily_breakouts"],
      }),
    });
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
      // Only published repos enter the 7-day cooldown — a skipped or
      // logged run shouldn't burn the picks.
      featuredRepos:
        status === "published"
          ? breakouts.map((r) => r.fullName)
          : undefined,
      posts: zipRunPosts(thread, result),
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

const handler = withHealthcheck("twitter-daily", handle);
export const GET = handler;
export const POST = handler;
