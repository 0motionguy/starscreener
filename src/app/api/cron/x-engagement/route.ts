// POST /api/cron/x-engagement
//
// Server side of the X engagement autopilot. The box-host runner
// (scripts/x-engagement-run.mjs) drives it. Reading + posting both use the
// host `twitter` CLI (free, cookie session) — only compose/ground/ledger live
// in the app. Interactions:
//   - { getTargets:true }        → returns the curated handles to search.
//   - { candidates:[…], dryRun }  → composes on the host-supplied posts (search
//     skipped) and returns the eligible drafts, consuming NO ledger.
//   - { confirm:{…} }             → commits the durable ledger + audit after the
//     host posts a reply via `twitter reply`.
//
// Auth: CRON_SECRET bearer. The gate (TWITTER_ENGAGEMENT_MODE) decides
// off/dry/live independently of the 7x/day broadcast; `{ dryRun:true }` can
// only downgrade live→dry, never arm posting.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { withBodySizeLimit } from "@/lib/api-helpers";
import { withHealthcheck } from "@/lib/healthcheck";
import { runEngagement } from "@/lib/twitter/engagement/runner";
import { redisEngagementLedger } from "@/lib/twitter/engagement/ledger";
import { recordEngagementAttempt } from "@/lib/twitter/engagement/audit";
import { isExcludedHandle, loadTargets } from "@/lib/twitter/engagement/targets";

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

/** One candidate post the host runner read via `twitter search --from`. */
const CandidateSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  authorId: z.string().min(1),
  authorHandle: z.string().optional().default(""),
  text: z.string().optional().default(""),
  createdAt: z.string().optional().default(""),
  isReply: z.boolean().optional().default(false),
  isRetweet: z.boolean().optional().default(false),
  likeCount: z.number().optional().default(0),
  matchedReason: z.string().optional().default(""),
});

const EngagementRequestSchema = z
  .object({
    dryRun: z.boolean().optional(),
    slot: z.string().min(1).optional(),
    getTargets: z.boolean().optional(),
    candidates: z.array(CandidateSchema).max(300).optional(),
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
  const body = parsed.data;

  // 1. getTargets — the host runner asks which curated handles to search.
  if (body.getTargets) {
    const handles = loadTargets()
      .filter((t) => !isExcludedHandle(t.handle))
      .map((t) => t.handle);
    return NextResponse.json({ ok: true, handles });
  }

  // 2. Confirm — the host runner posted a reply via `twitter reply` and reports
  // back so we commit the durable ledger + audit row.
  const confirm = body.confirm;
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

  // 3. Compose — on host-supplied candidates (production; free CLI read) or,
  // as a fallback with no candidates, via the app-side paid search. Dry drafts
  // carry postId + replyText for the runner to post.
  const result = await runEngagement({
    dryRun: body.dryRun === true,
    ...(body.candidates && body.candidates.length > 0
      ? { candidates: body.candidates }
      : {}),
  });
  return NextResponse.json(result);
}

const handler = withHealthcheck("x-engagement", handle);
export const GET = handler;
export const POST = handler;
