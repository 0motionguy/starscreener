// GET / POST /api/repos/[owner]/[name]/community
//
// Community profile snapshot for the /repo/[owner]/[name] page.
//
// GET  → returns the cached community profile (200) or 404 if it has never
//        been fetched. Public, idempotent, cacheable at the edge.
//
// POST → triggers a live GitHub fetch and writes the result to Redis with
//        a 24h TTL. Auth-gated via requireUser() so only signed-in users
//        can spend GitHub-PAT quota on demand; per-user rate-limited to
//        30 requests / minute. The fetch runs inline with an 8s budget; if
//        the upstream hasn't returned in time the route responds 202 and
//        the background fetch keeps writing to the cache for the next
//        warm GET.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { errorEnvelope, serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import {
  fetchRepoCommunityProfileLive,
  getRepoCommunityProfile,
  refreshRepoCommunityProfileFromStore,
  type RepoCommunityProfile,
} from "@/lib/repo-community-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

// 8 s inline budget for the live fetch. Six GitHub endpoints fan out in
// parallel from fetchRepoCommunityProfileLive — most warm-token paths
// complete inside 3 s; the budget covers the cold-pool + first-call
// quarantine retry without holding the Lambda all the way to the 30 s
// platform ceiling. Calls that miss the budget keep running in the
// background and write the cache for the next GET.
const LIVE_FETCH_INLINE_TIMEOUT_MS = 8_000;

const COMMUNITY_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

const GET_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
} as const;

const POST_CACHE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

// POST body is empty — declare an explicit schema so the lint:zod-routes
// guard passes and any future fields stay validated.
const PostBodySchema = z.object({}).strict();

interface CommunityGetSuccess {
  ok: true;
  profile: RepoCommunityProfile;
}

interface CommunityPostSuccess {
  ok: true;
  /** "fresh" — fetch completed inline; "queued" — running in background. */
  status: "fresh" | "queued";
  profile?: RepoCommunityProfile;
}

interface CommunityErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
): Promise<NextResponse<CommunityGetSuccess | CommunityErrorResponse>> {
  const { owner, name } = await params;

  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return NextResponse.json(
      errorEnvelope("Invalid repo slug", "invalid_slug"),
      { status: 400, headers: GET_CACHE_HEADERS },
    );
  }

  const fullName = `${owner}/${name}`;

  try {
    await refreshRepoCommunityProfileFromStore(fullName);
  } catch (err) {
    // Refresh swallows store errors internally; a throw here would be a
    // surprise. Log and continue — getRepoCommunityProfile still returns
    // whatever's in the in-memory cache.
    console.warn("[api:repo/community] store refresh failed", fullName, err);
  }

  const profile = getRepoCommunityProfile(fullName);
  if (!profile) {
    return NextResponse.json(
      errorEnvelope(
        "Community profile not cached — POST to trigger a fetch",
        "not_cached",
      ),
      { status: 404, headers: GET_CACHE_HEADERS },
    );
  }

  return NextResponse.json(
    { ok: true, profile },
    { headers: GET_CACHE_HEADERS },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
): Promise<NextResponse<CommunityPostSuccess | CommunityErrorResponse>> {
  const { owner, name } = await params;

  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return NextResponse.json(
      errorEnvelope("Invalid repo slug", "invalid_slug"),
      { status: 400, headers: POST_CACHE_HEADERS },
    );
  }

  // Trust boundary — anonymous callers can read GET, but only signed-in
  // users can spend GitHub-PAT quota on a live fetch.
  const user = await requireUser();

  // Body is empty `{}`; allowEmpty so the parser tolerates `Content-Length: 0`
  // from `fetch(url, { method: "POST" })` calls without a body.
  const parsedBody = await parseBody(request, PostBodySchema, {
    allowEmpty: true,
  });
  if (!parsedBody.ok) {
    return parsedBody.response as NextResponse<CommunityErrorResponse>;
  }

  const rate = await checkRateLimitAsync(request, {
    ...COMMUNITY_RATE_LIMIT,
    subject: user.profile.id,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      errorEnvelope(
        "rate limit exceeded — try again shortly",
        "RATE_LIMITED",
      ),
      {
        status: 429,
        headers: {
          ...POST_CACHE_HEADERS,
          "Retry-After": String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))),
        },
      },
    );
  }

  const fullName = `${owner}/${name}`;

  try {
    // Kick off the live fetch. The lib already does dedupe + persistence so
    // we just race the Promise against the inline budget.
    const livePromise = fetchRepoCommunityProfileLive(fullName);
    const profile = await raceWithTimeout(livePromise, LIVE_FETCH_INLINE_TIMEOUT_MS);

    if (profile === "timeout") {
      // Let the fetch continue running — the in-memory cache + Redis will
      // pick up the result for the next GET. Surface 202 so callers know
      // to poll.
      // Surface errors from the background fetch so unhandled-rejection
      // tracking still sees them.
      livePromise.catch((err) => {
        console.warn(
          "[api:repo/community] background live fetch failed",
          fullName,
          err instanceof Error ? err.message : err,
        );
      });
      return NextResponse.json(
        { ok: true, status: "queued" },
        { status: 202, headers: POST_CACHE_HEADERS },
      );
    }

    if (!profile) {
      return NextResponse.json(
        errorEnvelope("Repo not found on GitHub", "repo_not_found"),
        { status: 404, headers: POST_CACHE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: true, status: "fresh", profile },
      { headers: POST_CACHE_HEADERS },
    );
  } catch (err) {
    return serverError<CommunityErrorResponse>(err, {
      scope: "[api:repo/community]",
    });
  }
}

/**
 * Race a Promise against a timeout. Returns the resolved value on success,
 * the literal `"timeout"` if the budget elapsed first, and propagates any
 * rejection from the underlying Promise. Used so the POST handler can
 * surface a 202 without abandoning the underlying GitHub fetch — letting
 * it continue running in the background populates the cache for the next
 * polling GET.
 */
async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T | "timeout">([
      promise,
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
