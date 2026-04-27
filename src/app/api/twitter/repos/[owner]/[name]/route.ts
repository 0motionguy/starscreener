import { NextRequest, NextResponse } from "next/server";
import { getTwitterRepoPanel } from "@/lib/twitter/service";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
): Promise<NextResponse> {
  const rateLimit = await checkRateLimitAsync(request, {
    windowMs: 60_000,
    maxRequests: 60,
  });
  if (!rateLimit.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000));
    return NextResponse.json(
      { error: "rate limit exceeded" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
          "Retry-After": String(retryAfterSec),
        },
      },
    );
  }

  const { owner, name } = await params;
  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return NextResponse.json({ error: "Invalid repo slug" }, { status: 400 });
  }

  const panel = await getTwitterRepoPanel(`${owner}/${name}`);
  if (!panel) {
    return NextResponse.json(
      { error: "Twitter signal not found for repo" },
      { status: 404 },
    );
  }

  return NextResponse.json(panel, {
    headers: {
      ...READ_CACHE_HEADERS,
      "X-RateLimit-Limit": "60",
      "X-RateLimit-Remaining": String(rateLimit.remaining),
    },
  });
}
