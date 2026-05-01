// POST /api/pipeline/deltas
//
// Immediate-mode delta computation. The home page surfaces 24h/7d/30d star
// deltas; previously these were precomputed in a separate batch job
// (`compute-deltas.mjs`) that ran 2-4h after the Twitter / OSS Insight
// collectors landed, baking that lag into the leaderboard. This route moves
// the math to API-request time so the producer (Twitter collector tick)
// can call it directly after each scan and the delta lands in Redis with
// near-zero lag.
//
// Body: { repo: "owner/name", window: "24h" | "7d" | "30d" }
// Auth: Authorization: Bearer <CRON_SECRET>
// Returns: { repo, window, current, prior, delta, fresh }
//
// Cache key shape (Redis, TTL 25h):
//   deltas:<owner>/<name>:<window>     → { ...computed delta payload }
//
// Snapshot key shape (read by this route — populated by the existing
// star-snapshot pipeline elsewhere; this route is a pure CONSUMER):
//   star-snapshot:<window>             → { items: { "<owner>/<name>": stars, ... } }
//
// computeSnapshotKey() is the canonical accessor — change it here if/when
// the producer side wires up. Keeping it in one place lets us migrate
// without touching every caller.
//
// Out of scope (deliberately NOT in this PR):
//   - Wiring the producer (collect-twitter-signals.ts) to call this route
//   - Removing compute-deltas.mjs
// Both follow once this route is verified end-to-end.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { getDataStore } from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeltaWindow = "24h" | "7d" | "30d";

const BodySchema = z.object({
  repo: z
    .string()
    .trim()
    .min(3)
    .regex(/^[^/\s]+\/[^/\s]+$/, "repo must be 'owner/name'"),
  window: z.enum(["24h", "7d", "30d"]),
});

/**
 * Snapshot key for the N-ago star totals. The producer side writes one
 * payload per window slot. Format chosen for grep-ability + because Redis
 * key layout is flat — no nested-hash shenanigans.
 *
 *   24h → star-snapshot:24h
 *   7d  → star-snapshot:7d
 *   30d → star-snapshot:30d
 */
function computeSnapshotKey(window: DeltaWindow): string {
  return `star-snapshot:${window}`;
}

/**
 * The trending payload's bucket structure (period → language → rows[]) where
 * each row's `stars` is a string (OSS Insight raw shape). We dedupe across
 * buckets and pick the first non-empty stars value per repo.
 */
interface TrendingRowLike {
  repo_name?: string;
  stars?: string | number;
}
interface TrendingFileLike {
  buckets?: Record<string, Record<string, TrendingRowLike[] | undefined> | undefined>;
}

function readCurrentStarsFromTrending(
  trending: TrendingFileLike | null,
  repo: string,
): number | null {
  if (!trending?.buckets) return null;
  const target = repo.toLowerCase();
  for (const langMap of Object.values(trending.buckets)) {
    if (!langMap) continue;
    for (const rows of Object.values(langMap)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!row?.repo_name) continue;
        if (row.repo_name.toLowerCase() !== target) continue;
        const raw = row.stars;
        const n = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

interface SnapshotPayload {
  items?: Record<string, number | string | undefined>;
}

function readPriorStarsFromSnapshot(
  snapshot: SnapshotPayload | null,
  repo: string,
): number | null {
  if (!snapshot?.items) return null;
  // Prefer exact case match, then case-insensitive lookup.
  const exact = snapshot.items[repo];
  const target = repo.toLowerCase();
  let raw: number | string | undefined = exact;
  if (raw === undefined) {
    for (const [k, v] of Object.entries(snapshot.items)) {
      if (k.toLowerCase() === target) {
        raw = v;
        break;
      }
    }
  }
  if (raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

interface DeltaResponse {
  ok: true;
  repo: string;
  window: DeltaWindow;
  current: number;
  prior: number | null;
  delta: number | null;
  fresh: boolean;
}

interface ErrResponse {
  ok: false;
  error: string;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<DeltaResponse | ErrResponse>> {
  Sentry.setTag("route", "api/pipeline/deltas");

  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny as NextResponse<ErrResponse>;

  const parsed = await parseBody(request, BodySchema);
  if (!parsed.ok) return parsed.response as NextResponse<ErrResponse>;
  const { repo, window } = parsed.data;

  Sentry.setTag("repo", repo);
  Sentry.setTag("window", window);

  try {
    const store = getDataStore();
    const [trendingResult, snapshotResult] = await Promise.all([
      store.read<TrendingFileLike>("trending"),
      store.read<SnapshotPayload>(computeSnapshotKey(window)),
    ]);

    const current = readCurrentStarsFromTrending(trendingResult.data, repo);
    if (current === null) {
      return NextResponse.json(
        { ok: false, error: `repo '${repo}' not found in trending payload` },
        { status: 404 },
      );
    }

    const prior = readPriorStarsFromSnapshot(snapshotResult.data, repo);
    const delta = prior === null ? null : current - prior;
    const fresh = trendingResult.fresh && snapshotResult.fresh && prior !== null;

    const value: DeltaResponse = {
      ok: true,
      repo,
      window,
      current,
      prior,
      delta,
      fresh,
    };

    // 25h TTL — covers a full 24h window plus 1h grace so a delayed producer
    // tick never serves a stale-but-still-cached value.
    await store.write(`deltas:${repo}:${window}`, value, { ttlSeconds: 90000 });

    return NextResponse.json(value);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api/pipeline/deltas", repo, window },
    });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
