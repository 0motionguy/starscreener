import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { posthogCapture } from "@/lib/analytics/posthog";
import {
  collectGithubPoolBudgetSample,
  isGithubPoolBudgetMuteActive,
  recordGithubPoolBudget,
} from "@/lib/github-pool-budget";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

export async function POST(request: NextRequest) {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  try {
    const sample = await collectGithubPoolBudgetSample();
    const muteActive = isGithubPoolBudgetMuteActive();
    const rolling = await recordGithubPoolBudget(sample, { muteActive });

    void posthogCapture("github_pool_budget_used", {
      distinct_id: "github-pool-budget-cron",
      used_pct: Number(sample.usedPct.toFixed(3)),
      remaining: sample.remaining,
      capacity: sample.capacity,
      tokens_seen: sample.tokensSeen,
      redis_unavailable: sample.redisUnavailable,
      rolling_window_min: rolling?.windowMinutes ?? 15,
      rolling_p95_used_pct: rolling
        ? Number(rolling.p95UsedPct.toFixed(3))
        : null,
      rolling_sample_count: rolling?.sampleCount ?? 0,
      mute_active: muteActive,
    });

    return NextResponse.json(
      {
        ok: true as const,
        sample,
        rolling,
        muteActive,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false as const, error: message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
