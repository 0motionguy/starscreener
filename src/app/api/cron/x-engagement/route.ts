// POST /api/cron/x-engagement
//
// Server side of the X engagement autopilot. The box-host runner
// (scripts/x-engagement-run.mjs) drives it: it POSTs here (optionally with
// { dryRun }) and the route runs one engagement pass — search fresh candidate
// posts, filter (freshness + Redis ledger + daily cap), compose an on-brand
// reply, and in LIVE mode post it via the outbound adapter's in_reply_to path.
//
// Auth: CRON_SECRET bearer (same as every other cron route). The gate
// (TWITTER_ENGAGEMENT_MODE) decides off/dry/live independently of the 7x/day
// broadcast; `{ dryRun: true }` can only downgrade live→dry, never arm posting.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { withBodySizeLimit } from "@/lib/api-helpers";
import { withHealthcheck } from "@/lib/healthcheck";
import { runEngagement } from "@/lib/twitter/engagement/runner";

export const runtime = "nodejs";

// `dryRun` forces a dry pass regardless of env mode (host --dry-run). `slot`
// is accepted for parity with the trending runner / cron dispatch but is
// advisory — the engagement pass is slot-agnostic.
const EngagementRequestSchema = z
  .object({
    dryRun: z.boolean().optional(),
    slot: z.string().min(1).optional(),
  })
  .passthrough();

async function handle(request: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny as NextResponse;

  const oversize = withBodySizeLimit(request);
  if (oversize) return oversize as NextResponse;

  const parsed = await parseBody(request, EngagementRequestSchema, {
    allowEmpty: true,
  });
  if (!parsed.ok) return parsed.response;

  // runEngagement returns a structured result that already carries `ok: true`.
  const result = await runEngagement({ dryRun: parsed.data.dryRun === true });
  return NextResponse.json(result);
}

const handler = withHealthcheck("x-engagement", handle);
export const GET = handler;
export const POST = handler;
