// POST /api/tier-lists — persist a tier list draft and return its shortId.
//
// Anonymous saves are allowed; rate-limited per IP (30/hour) so a bot can't
// spam the namespace. Body validated against tierListDraftSchema; canonical
// shape in `src/lib/types/tier-list.ts`.

import { NextResponse } from "next/server";

import { parseBody } from "@/lib/api/parse-body";
import { errorEnvelope } from "@/lib/api/error-response";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { absoluteUrl } from "@/lib/seo";
import { tierListDraftSchema } from "@/lib/tier-list/schema";
import { createTierList } from "@/lib/tier-list/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAVES_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const limit = await checkRateLimitAsync(request, {
    windowMs: HOUR_MS,
    maxRequests: SAVES_PER_HOUR,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      errorEnvelope(
        `rate limit exceeded — try again in ${Math.ceil(
          limit.retryAfterMs / 1000,
        )}s`,
        "RATE_LIMITED",
      ),
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      },
    );
  }

  const parsed = await parseBody(request, tierListDraftSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const payload = await createTierList(parsed.data);
    return NextResponse.json(
      {
        ok: true,
        shortId: payload.shortId,
        shareUrl: absoluteUrl(`/tierlist/${payload.shortId}`),
        ogUrl: absoluteUrl(`/api/og/tier-list?id=${payload.shortId}`),
        payload,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[tier-lists] create failed:", err);
    // Surface the raw error in dev so the editor can show it; production
    // gets the canonical envelope only.
    const detail =
      process.env.NODE_ENV !== "production" && err instanceof Error
        ? err.message
        : undefined;
    return NextResponse.json(
      {
        ...errorEnvelope("could not save tier list", "SAVE_FAILED"),
        ...(detail ? { detail } : {}),
      },
      { status: 500 },
    );
  }
}
