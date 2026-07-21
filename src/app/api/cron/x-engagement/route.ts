// POST /api/cron/x-engagement
//
// Server side of the X engagement autopilot. The box-host runner
// (scripts/x-engagement-run.mjs) drives it. The app's outbound adapter can't
// post (cookie transport is host-CLI-only), so posting happens on the box:
//   - propose: runner POSTs { dryRun:true } → the app composes + grounds +
//     classifies + freshness/ledger-filters and returns the eligible drafts,
//     consuming NO ledger.
//   - the runner posts each draft via the host `twitter reply` CLI.
//   - confirm: runner POSTs { confirm:{...} } → the app commits the durable
//     ledger (author 72h / post dedupe / daily cap) + writes the audit row.
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
import { redisEngagementLedger } from "@/lib/twitter/engagement/ledger";
import { recordEngagementAttempt } from "@/lib/twitter/engagement/audit";

export const runtime = "nodejs";

/** Reported by the host runner after a successful `twitter reply` post. */
const ConfirmSchema = z.object({
  postId: z.string().min(1),
  authorId: z.string().min(1),
  authorHandle: z.string().optional().default(""),
  postUrl: z.string().optional().default(""),
  replyText: z.string().min(1),
  replyTweetId: z.string().optional(),
});

// `dryRun` forces a dry pass regardless of env mode (host --dry-run). `slot`
// is accepted for parity with the trending runner / cron dispatch but is
// advisory. `confirm` commits a reply the host runner just posted.
const EngagementRequestSchema = z
  .object({
    dryRun: z.boolean().optional(),
    slot: z.string().min(1).optional(),
    confirm: ConfirmSchema.optional(),
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

  // Confirm mode — the host runner posted a reply via the `twitter` CLI and
  // reports back so we commit the durable ledger + audit row.
  const confirm = parsed.data.confirm;
  if (confirm) {
    const nowMs = Date.now();
    const recorded = await redisEngagementLedger.recordEngagement({
      authorId: confirm.authorId,
      postId: confirm.postId,
      nowMs,
    });
    await recordEngagementAttempt({
      ts: new Date(nowMs).toISOString(),
      date: new Date(nowMs).toISOString().slice(0, 10),
      mode: "live",
      status: "posted",
      authorId: confirm.authorId,
      authorHandle: confirm.authorHandle,
      postId: confirm.postId,
      postUrl: confirm.postUrl,
      reason: "cli-reply",
      replyText: confirm.replyText,
      tweetId: confirm.replyTweetId ?? null,
      replyUrl: confirm.replyTweetId
        ? `https://x.com/Trendingrepo/status/${confirm.replyTweetId}`
        : null,
    });
    return NextResponse.json({ ok: true, recorded });
  }

  // runEngagement returns a structured result that already carries `ok: true`.
  // In dry mode the drafted records carry postId + replyText for the runner.
  const result = await runEngagement({ dryRun: parsed.data.dryRun === true });
  return NextResponse.json(result);
}

const handler = withHealthcheck("x-engagement", handle);
export const GET = handler;
export const POST = handler;
