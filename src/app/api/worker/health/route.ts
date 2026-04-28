// Worker fleet health probe.
//
// Reads the meta sidecar (`ss:meta:v1:<slug>`) for every Redis slug the
// Railway worker writes, computes age, classifies green / amber / red /
// missing against the expected cadence, and returns one aggregated JSON
// envelope. Single hit gives the operator full visibility into worker
// liveness — no need to load each consumer page to verify a fetcher is
// firing.
//
// Status classification:
//   green   — age < 2× expected cadence    (fresh)
//   amber   — age < 6× expected cadence    (stale-but-not-dead)
//   red     — age >= 6× expected cadence   (worker likely broken for this slug)
//   missing — no meta key found            (never published, OR Redis miss)
//
// HTTP status code:
//   200 if every slug is green or amber
//   503 if any slug is red or missing
//
// Cache: 30s shared cache (Vercel s-maxage). Hitting the route in a tight
// loop won't fan out 33× per second to Redis.
//
// This complements (not replaces) the existing `/api/worker/pulse`
// (single-slug hn-pulse liveness) and `/api/health` (a few hand-picked
// signal slugs with degraded body shape). This route is the COMPLETE
// worker-fleet view.

import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Slug → expected cadence map
// ---------------------------------------------------------------------------
//
// Cadence in MINUTES = the expected interval between successful writes for
// each slug. Drawn directly from each fetcher's cron schedule in
// apps/trendingrepo-worker/src/fetchers/<name>/index.ts. When a fetcher
// changes its schedule, update the matching row here in the same commit.
//
// `fetcher` is the fetcher name (matches the `name` field on the Fetcher
// object) — operator can grep by it to find the source.

interface SlugHealthSpec {
  slug: string;
  fetcher: string;
  cadenceMin: number;
  /** True if this slug is allowed to lag without raising an alert (e.g. weekly). */
  slowMoving?: boolean;
  /**
   * Advisory slugs are useful diagnostics but do not make the fleet unhealthy.
   * They are either credential-dependent catalogs or GitHub-workflow mirrors,
   * not core live-feed liveness.
   */
  blocking?: boolean;
}

const SLUG_TABLE: ReadonlyArray<SlugHealthSpec> = [
  // hourly + faster — these are the freshness-sensitive workhorses
  { slug: "hn-pulse", fetcher: "hn-pulse", cadenceMin: 10 },
  { slug: "trending", fetcher: "oss-trending", cadenceMin: 60 },
  { slug: "hot-collections", fetcher: "oss-trending", cadenceMin: 60 },
  { slug: "recent-repos", fetcher: "recent-repos", cadenceMin: 60 },
  { slug: "deltas", fetcher: "deltas", cadenceMin: 60 },
  { slug: "repo-metadata", fetcher: "repo-metadata", cadenceMin: 60, blocking: false },
  { slug: "repo-profiles", fetcher: "repo-profiles", cadenceMin: 60 },
  { slug: "engagement-composite", fetcher: "engagement-composite", cadenceMin: 60 },
  { slug: "trustmrr-startups", fetcher: "trustmrr", cadenceMin: 60, blocking: false },
  { slug: "trustmrr-startups:meta", fetcher: "trustmrr", cadenceMin: 60, blocking: false },
  { slug: "revenue-overlays", fetcher: "trustmrr", cadenceMin: 60, blocking: false },
  { slug: "reddit-mentions", fetcher: "reddit", cadenceMin: 60 },
  { slug: "reddit-all-posts", fetcher: "reddit", cadenceMin: 60 },
  { slug: "hackernews-trending", fetcher: "hackernews", cadenceMin: 60 },
  { slug: "hackernews-repo-mentions", fetcher: "hackernews", cadenceMin: 60 },
  { slug: "bluesky-trending", fetcher: "bluesky", cadenceMin: 60 },
  { slug: "bluesky-mentions", fetcher: "bluesky", cadenceMin: 60 },
  { slug: "lobsters-trending", fetcher: "lobsters", cadenceMin: 60 },
  { slug: "lobsters-mentions", fetcher: "lobsters", cadenceMin: 60 },

  // few-hours cadence
  { slug: "trending-skill-sh", fetcher: "skills-sh", cadenceMin: 120 },
  { slug: "huggingface-trending", fetcher: "scrape-huggingface", cadenceMin: 240, blocking: false },
  { slug: "producthunt-launches", fetcher: "producthunt", cadenceMin: 360, blocking: false },
  { slug: "trending-skill", fetcher: "claude-skills", cadenceMin: 360 },
  { slug: "trending-mcp", fetcher: "mcp-registry-official+glama+pulsemcp+smithery", cadenceMin: 360, blocking: false },
  { slug: "funding-news", fetcher: "funding-news", cadenceMin: 360 },
  { slug: "collection-rankings", fetcher: "collection-rankings", cadenceMin: 360 },

  // daily — operator-curated mirrors + once-a-day enrichment
  { slug: "manual-repos", fetcher: "manual-repos", cadenceMin: 60 * 24 },
  { slug: "revenue-manual-matches", fetcher: "revenue-manual-matches", cadenceMin: 60 * 24 },
  { slug: "npm-packages", fetcher: "npm-packages", cadenceMin: 60 * 24 },
  { slug: "revenue-benchmarks", fetcher: "revenue-benchmarks", cadenceMin: 60 * 24, blocking: false },

  // weekly — slow-moving baselines
  { slug: "reddit-baselines", fetcher: "reddit-baselines", cadenceMin: 60 * 24 * 7, slowMoving: true },

  // newer skill sources (cadence inherited from each fetcher's schedule)
  { slug: "trending-skill-skillsmp", fetcher: "skillsmp", cadenceMin: 360 },
  { slug: "trending-skill-smithery", fetcher: "smithery-skills", cadenceMin: 360 },
  { slug: "trending-skill-lobehub", fetcher: "lobehub-skills", cadenceMin: 360 },
];

// ---------------------------------------------------------------------------
// Status classification
// ---------------------------------------------------------------------------

type SlugStatus = "green" | "amber" | "red" | "missing";

interface SlugHealth {
  slug: string;
  fetcher: string;
  cadenceMin: number;
  blocking: boolean;
  status: SlugStatus;
  writtenAt: string | null;
  ageSec: number | null;
}

interface HealthSummary {
  total: number;
  green: number;
  amber: number;
  red: number;
  missing: number;
  blockingRed: number;
  blockingMissing: number;
}

interface HealthResponse {
  ok: boolean;
  generatedAt: string;
  summary: HealthSummary;
  slugs: SlugHealth[];
}

function classifyAge(
  ageSec: number | null,
  cadenceMin: number,
  slowMoving: boolean,
): SlugStatus {
  if (ageSec === null) return "missing";
  const cadenceSec = cadenceMin * 60;
  // Slow-moving slugs (e.g. weekly baselines) get a more forgiving amber
  // band — they're allowed to be stale for half the cadence before alerting.
  const greenMultiplier = slowMoving ? 1.5 : 2;
  const amberMultiplier = slowMoving ? 3 : 6;
  if (ageSec < cadenceSec * greenMultiplier) return "green";
  if (ageSec < cadenceSec * amberMultiplier) return "amber";
  return "red";
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const store = getDataStore();
  const now = Date.now();

  // Read every slug's meta in parallel. data-store's `writtenAt()` is a
  // single GET on the sidecar key (no payload deserialize) — cheap.
  const probes = await Promise.all(
    SLUG_TABLE.map(async (spec) => {
      const writtenAt = await store.writtenAt(spec.slug).catch(() => null);
      const ageSec =
        writtenAt !== null
          ? Math.max(0, Math.floor((now - new Date(writtenAt).getTime()) / 1000))
          : null;
      const status = classifyAge(ageSec, spec.cadenceMin, spec.slowMoving === true);
      return {
        slug: spec.slug,
        fetcher: spec.fetcher,
        cadenceMin: spec.cadenceMin,
        blocking: spec.blocking !== false,
        status,
        writtenAt,
        ageSec,
      } satisfies SlugHealth;
    }),
  );

  const summary: HealthSummary = {
    total: probes.length,
    green: probes.filter((p) => p.status === "green").length,
    amber: probes.filter((p) => p.status === "amber").length,
    red: probes.filter((p) => p.status === "red").length,
    missing: probes.filter((p) => p.status === "missing").length,
    blockingRed: probes.filter((p) => p.blocking && p.status === "red").length,
    blockingMissing: probes.filter((p) => p.blocking && p.status === "missing").length,
  };

  // Sort: red+missing first (caller scans them), then amber, then green.
  const statusRank: Record<SlugStatus, number> = {
    missing: 0,
    red: 1,
    amber: 2,
    green: 3,
  };
  probes.sort((a, b) => {
    if (statusRank[a.status] !== statusRank[b.status]) {
      return statusRank[a.status] - statusRank[b.status];
    }
    return a.slug.localeCompare(b.slug);
  });

  const ok = summary.blockingRed === 0 && summary.blockingMissing === 0;

  return NextResponse.json(
    {
      ok,
      generatedAt: new Date().toISOString(),
      summary,
      slugs: probes,
    },
    {
      status: ok ? 200 : 503,
      headers: {
        // 30s edge cache — same window as the route does internally on cache
        // misses. Vercel SWR returns the stale body for up to 60s after that.
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
