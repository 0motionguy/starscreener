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
import { getDerivedRepos } from "@/lib/derived-repos";
import { listIdeas, toPublicIdea, hotScore } from "@/lib/ideas";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";

import { recordOutboundRun } from "@/lib/twitter/outbound/audit";
import { selectOutboundAdapter } from "@/lib/twitter/outbound/adapters";
import { composeWeeklyRecap } from "@/lib/twitter/outbound/composer";

interface WeeklyResponse {
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

export async function POST(
  request: NextRequest,
): Promise<NextResponse<WeeklyResponse | ErrorResponse>> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny as NextResponse<ErrorResponse>;

  const startedAt = new Date().toISOString();
  const adapter = selectOutboundAdapter();

  try {
    const now = new Date();
    const weekAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    // Top breakout of the week = highest crossSignalScore among repos
    // with any meaningful 7d star delta. Ties broken by absolute delta.
    const repos = getDerivedRepos();
    const weeklyBreakouts = repos
      .filter((r) => (r.starsDelta7d ?? 0) > 0)
      .sort((a, b) => {
        const aCSS = a.crossSignalScore ?? 0;
        const bCSS = b.crossSignalScore ?? 0;
        if (bCSS !== aCSS) return bCSS - aCSS;
        return (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0);
      });
    const topBreakout = weeklyBreakouts[0] ?? null;
    const breakoutsThisWeek = weeklyBreakouts.filter(
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
      topBreakout,
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
