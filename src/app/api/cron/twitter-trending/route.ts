// POST /api/cron/twitter-trending
//
// The 3x/day trending-single autopilot's server side. The box-host runner
// (scripts/twitter-trending-run.mjs) drives it in two phases:
//   - propose:  POST with no body            -> {ok, post, fullName, text, url, reason}
//   - confirm:  POST { confirm:{fullName, tweetId, text} } -> commits ledger + audit
//
// Auth: CRON_SECRET bearer (same as every other cron route). Posting itself
// happens on the host (the `twitter` CLI isn't in the container); this route
// only ranks/composes and records — it never calls out to X.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { withBodySizeLimit } from "@/lib/api-helpers";
import { withHealthcheck } from "@/lib/healthcheck";
import {
  proposeTrendingPost,
  confirmTrendingPost,
} from "@/lib/twitter/outbound/trending-runner";

export const runtime = "nodejs";

// `confirm` present -> commit phase; absent (no-body cron POST) -> propose.
const TrendingRequestSchema = z
  .object({
    confirm: z
      .object({
        fullName: z.string().min(1),
        tweetId: z.string().min(1),
        text: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

async function handle(request: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny as NextResponse;

  const oversize = withBodySizeLimit(request);
  if (oversize) return oversize as NextResponse;

  const parsed = await parseBody(request, TrendingRequestSchema, {
    allowEmpty: true,
  });
  if (!parsed.ok) return parsed.response;

  const c = parsed.data.confirm;
  if (c) {
    await confirmTrendingPost(c.fullName, c.tweetId, c.text ?? "");
    return NextResponse.json({ ok: true, confirmed: c.fullName });
  }

  const plan = await proposeTrendingPost();
  return NextResponse.json({ ok: true, ...plan });
}

const handler = withHealthcheck("twitter-trending", handle);
export const GET = handler;
export const POST = handler;
