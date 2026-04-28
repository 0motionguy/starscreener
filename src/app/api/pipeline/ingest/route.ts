// POST /api/pipeline/ingest
//
// Ingest one or many GitHub repos into the pipeline. Accepts a JSON body
// listing `owner/repo` full names; optionally kicks off a full recompute
// pass after the batch lands so the UI reflects fresh scores immediately.
//
// Without a GITHUB_TOKEN in the env the route falls back to the mock
// adapter so developers can exercise the pipeline end-to-end offline.

import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";
import { createGitHubAdapter } from "@/lib/pipeline/ingestion/ingest";
import { getExtendedSocialAdapters } from "@/lib/pipeline/adapters/extended-social";
import type { IngestBatchResult, SocialAdapter } from "@/lib/pipeline/types";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { getDerivedRepos } from "@/lib/derived-repos";
import { trendScoreForTimeRange } from "@/lib/filters";

export const runtime = "nodejs";

const FULL_NAME_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const MAX_BATCH_SIZE = 50;

/**
 * When the cron POSTs `{}` (the documented contract — see the GET-handler
 * note further down), we auto-discover the most-trending tracked repos and
 * feed those into the batch ingest. Without this, the cron deadlocks against
 * the post-2026-04-17 strict-validation rule and `data/trending.json` goes
 * stale silently, which is exactly what happened for ~14h before this fix.
 *
 * We pick the top-50 by 24h trend score (matches the home page + /cli
 * page's selection) because those are the rows where stale data would
 * embarrass us first. Other repos still get refreshed on subsequent cron
 * fires as their relative ranking shifts.
 */
function autoDiscoverFullNames(): string[] {
  const repos = getDerivedRepos();
  return [...repos]
    .sort(
      (a, b) =>
        trendScoreForTimeRange(b, "24h") - trendScoreForTimeRange(a, "24h"),
    )
    .slice(0, MAX_BATCH_SIZE)
    .map((r) => r.fullName);
}

// P0 fix (F-DATA-social-persist): without social adapters the batch ingest
// never populates `.data/mentions.jsonl`, so historical mention timelines,
// cross-source dedup, and confidence scoring all rely on live per-request
// refetches. Enabling social adapters at ingest makes the unified MentionStore
// the source of truth with the live fallback as a secondary path.
//
// Kill-switch: set INGEST_SOCIAL_ADAPTERS=false to disable if a source goes
// flaky without needing a deploy.
function isSocialAdapterIngestEnabled(): boolean {
  const raw = process.env.INGEST_SOCIAL_ADAPTERS;
  if (raw === undefined) return true;
  const v = raw.trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "no" || v === "off");
}

export interface IngestRequestBody {
  fullNames: string[];
  useMock?: boolean;
  recomputeAfter?: boolean;
}

export interface IngestResponse {
  ok: true;
  batch: IngestBatchResult;
  recomputed: boolean;
  durationMs: number;
}

export interface IngestErrorResponse {
  ok: false;
  error: string;
  details?: string[];
}

/** Validate and normalize the inbound JSON body.
 *
 * `fullNames` is OPTIONAL. When missing/empty, the caller is asking for
 * an auto-discovered batch (see autoDiscoverFullNames above) — which is
 * the case the GH Actions cron has been hitting since 2026-04-17. When
 * provided, it must satisfy the strict-validation contract callers added
 * for the public endpoint. */
function parseBody(raw: unknown): {
  ok: true;
  value: { fullNames?: string[]; useMock?: boolean; recomputeAfter?: boolean };
} | { ok: false; error: string; details?: string[] } {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;

  const fullNamesRaw = body.fullNames;
  let fullNames: string[] | undefined;
  if (fullNamesRaw !== undefined) {
    if (!Array.isArray(fullNamesRaw)) {
      return { ok: false, error: "fullNames must be an array of strings" };
    }
    if (fullNamesRaw.length > MAX_BATCH_SIZE) {
      return {
        ok: false,
        error: `fullNames must contain at most ${MAX_BATCH_SIZE} entries`,
      };
    }
    const invalid: string[] = [];
    for (const n of fullNamesRaw) {
      if (typeof n !== "string" || !FULL_NAME_PATTERN.test(n)) {
        invalid.push(String(n));
      }
    }
    if (invalid.length > 0) {
      return {
        ok: false,
        error: "fullNames contains invalid entries",
        details: invalid.map((n) => `"${n}" is not owner/repo`),
      };
    }
    // Empty array → fall through to auto-discover (treat same as missing).
    if (fullNamesRaw.length > 0) {
      fullNames = fullNamesRaw as string[];
    }
  }

  const useMock =
    body.useMock === undefined ? undefined : Boolean(body.useMock);
  const recomputeAfter =
    body.recomputeAfter === undefined
      ? undefined
      : Boolean(body.recomputeAfter);

  return {
    ok: true,
    value: {
      fullNames,
      useMock,
      recomputeAfter,
    },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "request body is not valid JSON" },
      { status: 400 },
    );
  }

  const parsed = parseBody(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error, details: parsed.details },
      { status: 400 },
    );
  }

  const { fullNames: explicitFullNames, useMock, recomputeAfter } = parsed.value;
  const fullNames = explicitFullNames ?? autoDiscoverFullNames();
  const autoDiscovered = explicitFullNames === undefined;

  if (fullNames.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "no repos to ingest — autoDiscover returned 0 (getDerivedRepos may be empty on a cold lambda)",
      },
      { status: 503 },
    );
  }

  try {
    await pipeline.ensureReady();

    const token = process.env.GITHUB_TOKEN;
    const resolvedUseMock = useMock ?? !token;
    const adapter = createGitHubAdapter({
      useMock: resolvedUseMock,
      token,
    });

    // Build per-source throw-guarded wrappers so one flaky social source
    // can't wedge the whole batch (and so we can count per-source writes
    // even though ingestRepo already swallows errors). A counter closure
    // gives us a reliable "written per source" tally without re-reading
    // the mention store after the fact.
    const socialAdapters = isSocialAdapterIngestEnabled()
      ? wrapSocialAdapters(getExtendedSocialAdapters())
      : undefined;

    const batch = await pipeline.ingestBatch(fullNames, {
      githubAdapter: adapter,
      socialAdapters: socialAdapters?.adapters,
    });

    if (socialAdapters) {
      const summary = Object.entries(socialAdapters.counters)
        .map(([id, c]) => `${id}=${c.mentions}${c.failures > 0 ? `(${c.failures} fail)` : ""}`)
        .join(" ");
      console.log(
        `[pipeline:ingest] social adapters summary repos=${fullNames.length}${autoDiscovered ? " auto" : ""} ${summary}`,
      );
    }

    const shouldRecompute = recomputeAfter ?? true;
    if (shouldRecompute) {
      await pipeline.recomputeAll();
    }

    return NextResponse.json({
      ok: true,
      batch,
      recomputed: shouldRecompute,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export interface IngestUsageResponse {
  endpoint: string;
  methods: string[];
  body: {
    fullNames: string;
    useMock: string;
    recomputeAfter: string;
  };
  example: {
    fullNames: string[];
    useMock: boolean;
    recomputeAfter: boolean;
  };
  limits: {
    minBatchSize: number;
    maxBatchSize: number;
    fullNamePattern: string;
  };
}

interface SocialAdapterCounter {
  mentions: number;
  failures: number;
}

interface WrappedSocialAdapters {
  adapters: SocialAdapter[];
  counters: Record<string, SocialAdapterCounter>;
}

/**
 * Wrap each social adapter so (a) per-source throws are caught and logged with
 * a `[ingest:social:<source>]` prefix (one flaky source can't take down the
 * GitHub ingest path), and (b) per-source mention counts + failure counts are
 * accumulated for the post-batch summary log.
 */
function wrapSocialAdapters(source: SocialAdapter[]): WrappedSocialAdapters {
  const counters: Record<string, SocialAdapterCounter> = {};
  const adapters: SocialAdapter[] = source.map((inner) => {
    counters[inner.id] = { mentions: 0, failures: 0 };
    const counter = counters[inner.id];
    return {
      id: inner.id,
      platform: inner.platform,
      async fetchMentionsForRepo(fullName: string, since?: string) {
        try {
          const mentions = await inner.fetchMentionsForRepo(fullName, since);
          counter.mentions += mentions.length;
          return mentions;
        } catch (err) {
          counter.failures += 1;
          console.error(
            `[ingest:social:${inner.id}] error for ${fullName}`,
            err instanceof Error ? err.message : String(err),
          );
          return [];
        }
      },
    };
  });
  return { adapters, counters };
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<IngestUsageResponse> | NextResponse> {
  // Vercel Cron fires GET (not POST) to every configured cron path. The
  // Vercel-Cron config registers this route as `/api/pipeline/ingest?cron=1`
  // so an operator manually hitting `GET /api/pipeline/ingest` still gets
  // the usage docs, but a cron invocation trips the same ingest pipeline as
  // the GitHub Actions POST cron. The GH Actions workflow POSTs `{}`, which
  // the POST handler resolves to "auto-discover the top-50 by 24h trend
  // score" — see autoDiscoverFullNames() above.
  if (request.nextUrl.searchParams.get("cron") === "1") {
    return POST(request);
  }
  return NextResponse.json({
    endpoint: "/api/pipeline/ingest",
    methods: ["POST"],
    body: {
      fullNames:
        "string[] of owner/repo names (optional, 0-50 entries, matches /^[A-Za-z0-9._-]+\\/[A-Za-z0-9._-]+$/). When missing or empty the route auto-discovers the top-50 by 24h trend score — what the cron contract expects.",
      useMock:
        "boolean (optional) — force the mock adapter. Defaults to !process.env.GITHUB_TOKEN.",
      recomputeAfter:
        "boolean (optional, default true) — re-score the whole pipeline after ingestion.",
    },
    example: {
      fullNames: ["vercel/next.js", "ollama/ollama"],
      useMock: false,
      recomputeAfter: true,
    },
    limits: {
      minBatchSize: 1,
      maxBatchSize: MAX_BATCH_SIZE,
      fullNamePattern: FULL_NAME_PATTERN.source,
    },
  });
}
