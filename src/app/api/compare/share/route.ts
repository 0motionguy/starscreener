// POST /api/compare/share — persist a /compare share-card state and return
// a `/s/{shortId}` URL that resolves back to the canonical /compare page
// with full state encoded in the querystring.
//
// Body validated with Zod via `parseBody`. Persisted to Redis under
// `compare-share/{shortId}` through the global data-store (the singleton's
// default factory binds `this` correctly for ioredis — see the tier-list
// store comment for the historical context). No expiry for v1.

import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody } from "@/lib/api/parse-body";
import { errorEnvelope } from "@/lib/api/error-response";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { generateShortId } from "@/lib/compare/short-id";
import { getDataStore, type DataStore } from "@/lib/data-store";
import { absoluteUrl } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHORT_ID_RETRY_LIMIT = 5;
const COMPARE_SHARE_KEY_PREFIX = "compare-share";
export const COMPARE_SHARE_MAX_REQUESTS = 30;
export const COMPARE_SHARE_WINDOW_MS = 60 * 60 * 1000;
export const COMPARE_SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;

const FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

const compareShareSchema = z.object({
  repos: z
    .array(z.string().regex(FULL_NAME_RE, "expected 'owner/name'"))
    .min(1)
    .max(5),
  metric: z.enum(["stars", "velocity", "mindshare"]).optional(),
  window: z.enum(["7d", "30d", "90d", "6m", "1y", "all"]).optional(),
  mode: z.enum(["date", "timeline"]).optional(),
  scale: z.enum(["lin", "log"]).optional(),
  theme: z.string().optional(),
  watermark: z.boolean().optional(),
});

export type CompareShareInput = z.infer<typeof compareShareSchema>;

export interface CompareSharePayload extends CompareShareInput {
  shortId: string;
  createdAt: string;
}

function compareShareKey(shortId: string): string {
  return `${COMPARE_SHARE_KEY_PREFIX}/${shortId}`;
}

export async function persistCompareSharePayload(
  store: DataStore,
  payload: CompareSharePayload,
): Promise<void> {
  await store.write(compareShareKey(payload.shortId), payload, {
    ttlSeconds: COMPARE_SHARE_TTL_SECONDS,
  });
}

export async function POST(request: Request) {
  const limit = await checkRateLimitAsync(request, {
    windowMs: COMPARE_SHARE_WINDOW_MS,
    maxRequests: COMPARE_SHARE_MAX_REQUESTS,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      errorEnvelope(
        `rate limit exceeded - try again in ${Math.ceil(
          limit.retryAfterMs / 1000,
        )}s`,
        "RATE_LIMITED",
      ),
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const parsed = await parseBody(request, compareShareSchema);
  if (!parsed.ok) return parsed.response;

  const store = getDataStore();
  const now = new Date().toISOString();

  try {
    for (let attempt = 0; attempt < SHORT_ID_RETRY_LIMIT; attempt++) {
      const shortId = generateShortId();
      const existing = await store.read<CompareSharePayload>(
        compareShareKey(shortId),
      );
      if (existing.data !== null) continue; // collision — retry

      const payload: CompareSharePayload = {
        ...parsed.data,
        shortId,
        createdAt: now,
      };

      await persistCompareSharePayload(store, payload);

      return NextResponse.json(
        {
          ok: true,
          shortId,
          url: absoluteUrl(`/s/${shortId}`),
        },
        {
          status: 201,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    console.error(
      `[compare:share] could not allocate a unique short id after ${SHORT_ID_RETRY_LIMIT} attempts`,
    );
    return NextResponse.json(
      errorEnvelope("could not allocate share id", "internal_error"),
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[compare:share] persist failed:", err);
    return NextResponse.json(
      errorEnvelope("could not save share", "internal_error"),
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
