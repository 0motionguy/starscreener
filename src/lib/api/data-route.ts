import { NextRequest, NextResponse } from "next/server";

import {
  userAuthFailureResponse,
  verifyUserAuth,
  type UserAuthVerdict,
} from "@/lib/api/auth";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { getUserTier } from "@/lib/pricing/user-tiers";
import { tierFor } from "@/lib/pricing/tiers";

const DATA_API_BASE_RATE_LIMIT = 60;
const DATA_API_WINDOW_MS = 60_000;

export const DATA_API_HEADERS = {
  "Cache-Control": "private, s-maxage=60, stale-while-revalidate=300",
  Vary: "authorization, x-api-key, x-user-token, cookie",
} as const;

export interface DataApiAuthContext {
  userId: string;
  tier: Awaited<ReturnType<typeof getUserTier>>;
  rateLimitHeaders: Record<string, string>;
}

export async function authenticateDataApi(
  request: NextRequest,
): Promise<
  | { ok: true; context: DataApiAuthContext }
  | { ok: false; response: NextResponse }
> {
  const auth: UserAuthVerdict = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return { ok: false, response: deny };
  if (auth.kind !== "ok") {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
        { status: 401, headers: DATA_API_HEADERS },
      ),
    };
  }

  const tier = auth.tier ?? (await getUserTier(auth.userId));
  const features = tierFor(tier).features;
  const maxRequests = Math.max(
    DATA_API_BASE_RATE_LIMIT,
    DATA_API_BASE_RATE_LIMIT * features.rateLimitMultiplier,
  );
  const rate = await checkRateLimitAsync(request, {
    windowMs: DATA_API_WINDOW_MS,
    maxRequests,
  });

  const rateLimitHeaders = {
    "X-RateLimit-Limit": String(maxRequests),
    "X-RateLimit-Remaining": String(rate.remaining),
    "X-RateLimit-Reset": new Date(rate.resetAt).toISOString(),
  };

  if (!rate.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "rate limit exceeded",
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: {
            ...DATA_API_HEADERS,
            ...rateLimitHeaders,
            "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          },
        },
      ),
    };
  }

  return {
    ok: true,
    context: {
      userId: auth.userId,
      tier,
      rateLimitHeaders,
    },
  };
}
