// POST /api/cron/twitter-weekly-recap
//
// End-of-week recap thread. Scheduled for Fridays 16:00 UTC — the
// strongest end-of-week engagement slot per the strategy doc's
// cadence recommendations.
//
// Same shape as /api/cron/twitter-daily; distinct route so schedule
// changes are independent and the audit rows can be filtered by kind.

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

import { recordOutboundRun, zipRunPosts } from "@/lib/twitter/outbound/audit";
import { selectOutboundAdapter } from "@/lib/twitter/outbound/adapters";
import {
  composeWeeklyRecap,
  MAX_WEEKLY_ITEMS,
} from "@/lib/twitter/outbound/composer";
import { pickDailyBreakouts } from "@/lib/twitter/outbound/select";

export const runtime = "nodejs";

/** Same stale-data threshold as the daily route: skip visibly rather
 * than compose a recap from a frozen payload. */
const MAX_DATA_AGE_MS = 12 * 60 * 60 * 1000;

interface WeeklyResponse {
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

async function handle(
  request: NextRequest,
): Promise<NextResponse<WeeklyResponse | ErrorResponse>> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny as NextResponse<ErrorResponse>;

  const oversize = withBodySizeLimit(request);
  if (oversize) return oversize as NextResponse<ErrorResponse>;

  const startedAt = new Date().toISOString();
  const adapter = selectOutboundAdapter();

  try {
    const now = new Date();
    const weekAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    // Pull the freshest worker-owned payload from Redis before reading
    // anything — a cold container otherwise composes from the bundled
    // (build-time) JSON. Failure degrades to whatever is cached.
    await refreshTrendingFromStore().catch((err) => {
      console.warn(
        "[api:cron:twitter-weekly-recap] refreshTrendingFromStore failed",
        err,
      );
    });

    // Freshness gate: skip the recap rather than post from stale data.
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
        kind: "weekly_recap",
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

    // Top breakouts of the week via the shared tiered selector in its
    // 7d window (multi-signal first, then flagged movers, then raw 7d
    // star velocity). No cooldown exclusion: the recap runs once a
    // week and the week's #1 belongs in it even if a daily already
    // featured it.
    const repos = getDerivedRepos();
    const topBreakouts = pickDailyBreakouts(repos, {
      count: MAX_WEEKLY_ITEMS,
      window: "7d",
    });
    const breakoutsThisWeek = repos.filter(
      (r) => (r.channelsFiring ?? 0) >= 2,
    ).length;

    const allIdeas = await listIdeas();
    const publishedThisWeek = allIdeas.filter((r) => {
      if (r.status !== "published" && r.status !== "shipped") return false;
      const ts = Date.parse(r.publishedAt ?? r.createdAt);
      return Number.isFinite(ts) && ts >= weekAgoMs;
    });
    let topIdea: ReturnType<typeof toPublicIdea> | null = null;
    if (publishedThisWeek.length > 0) {
      const scored = await Promise.all(
        publishedThisWeek.map(async (record) => {
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
      topIdea = scored[0] ? toPublicIdea(scored[0].record) : null;
    }

    const thread = composeWeeklyRecap({
      topBreakouts,
      topIdea,
      ideasPublishedThisWeek: publishedThisWeek.length,
      breakoutsThisWeek,
    });

    const result = await adapter.postThread(thread);
    const anyPublished = result.posts.some((p) => p.status === "published");
    const anyLogged = result.posts.some((p) => p.status === "logged");
    const status: WeeklyResponse["status"] = anyPublished
      ? "published"
      : anyLogged
        ? "logged"
        : "skipped";

    const run = await recordOutboundRun({
      kind: "weekly_recap",
      adapterName: adapter.name,
      status,
      threadUrl: result.threadUrl,
      postCount: thread.length,
      startedAt,
      featuredRepos:
        status === "published"
          ? topBreakouts.map((r) => r.fullName)
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
      kind: "weekly_recap",
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

const handler = withHealthcheck("twitter-weekly-recap", handle);
export const GET = handler;
export const POST = handler;
