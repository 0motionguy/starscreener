// POST /api/cron/twitter-trending
//
// The 5x/day trending autopilot's server side. The box-host runner
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

// `confirm` present -> commit phase; absent -> propose (optionally slotted).
// v2 additive contract: propose takes {slot}, confirm takes fullNames[] +
// format/packId so pack members each enter cooldown. A v1 runner sending
// bare {confirm:{fullName,...}} still works.
const SlotSchema = z.enum(["A", "B", "C", "D", "E", "F", "G"]);
const RankerSchema = z.enum(["top", "gainer", "trend", "discovery"]);
const TrendingRequestSchema = z
  .object({
    slot: SlotSchema.optional(),
    confirm: z
      .object({
        fullName: z.string().min(1).optional(),
        fullNames: z.array(z.string().min(1)).min(1).optional(),
        tweetId: z.string().min(1),
        text: z.string().optional(),
        format: z
          .enum(["trending_single", "discovery_single", "trending_pack"])
          .optional(),
        packId: z.string().min(1).optional(),
        ranker: RankerSchema.optional(),
        source: z.enum(["llm", "deterministic"]).optional(),
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
    const fullNames =
      c.fullNames && c.fullNames.length > 0
        ? c.fullNames
        : c.fullName
          ? [c.fullName]
          : [];
    if (fullNames.length === 0) {
      return NextResponse.json(
        { ok: false, error: "confirm requires fullName or fullNames" },
        { status: 400 },
      );
    }
    await confirmTrendingPost({
      fullNames,
      tweetId: c.tweetId,
      text: c.text ?? "",
      format: c.format,
      packId: c.packId,
      ranker: c.ranker,
      source: c.source,
    });
    return NextResponse.json({ ok: true, confirmed: fullNames });
  }

  // Slot comes from the body ({slot:"B"}) or ?slot= for curl-friendliness.
  const q = request.nextUrl.searchParams.get("slot");
  const slot =
    parsed.data.slot ??
    (SlotSchema.safeParse(q).success ? (q as z.infer<typeof SlotSchema>) : undefined);
  const plan = await proposeTrendingPost(Date.now(), slot);
  return NextResponse.json({ ok: true, ...plan });
}

const handler = withHealthcheck("twitter-trending", handle);
export const GET = handler;
export const POST = handler;
