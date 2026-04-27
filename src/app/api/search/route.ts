// GET /api/search — faceted search over the derived repo set.
//
// History: this route started as a plain substring search over fullName /
// description / topics, surfaced via `?q=`. It now supports the full faceted
// filter contract defined in `src/lib/search-query.ts` — language, movement,
// stars / momentum ranges, revenue + funding + twitter presence, topic, sort,
// and pagination — while staying backward-compatible with the old callers.
//
// Back-compat rules:
//   - The legacy sort values (`stars-today`, `stars-total`, `cross-signal`)
//     are translated into the new API (`stars` + order, etc.).
//   - The legacy response shape `{ results, meta: { total, query, limit } }`
//     is still returned by default. Pass `v=2` to get the richer shape
//     `{ ok, fetchedAt, query, total, limit, offset, results }`.
//   - Unknown query params are ignored (200, not 400), per spec.
//   - An empty / absent `q=` no longer short-circuits to `[]` — facet-only
//     queries like `?hasRevenue=true` are valid. v=1 callers that supply
//     neither `q` nor any facet keep the old "empty results, empty query"
//     behavior to avoid returning a full dump on a misconfigured client.

import { NextRequest, NextResponse } from "next/server";
import type { Repo } from "@/lib/types";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { getDerivedRepos } from "@/lib/derived-repos";
import {
  computeFacets,
  matchesQuery,
  parseSearchQuery,
  sortAndPage,
  type MatchContext,
  type SearchQuery,
  type SearchSort,
} from "@/lib/search-query";
import {
  getRevenueOverlay,
  getSelfReportedOverlay,
  refreshRevenueOverlaysFromStore,
} from "@/lib/revenue-overlays";
import { getFundingEventsForRepo } from "@/lib/funding/repo-events";
import type { RevenueTier } from "@/lib/types";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Legacy sort translation
//
// The old route accepted `momentum | stars-today | stars-total | cross-signal`.
// The new contract accepts `momentum | stars | delta7d | delta24h`, and
// cross-signal doesn't map cleanly. Translate where possible and fall back to
// momentum for cross-signal rather than 400ing on a legacy value.
// ---------------------------------------------------------------------------

function translateLegacySort(
  raw: string,
): { sort: SearchSort; order?: "asc" | "desc" } | null {
  switch (raw) {
    case "momentum":
      return { sort: "momentum" };
    case "stars":
      return { sort: "stars" };
    case "stars-today":
      return { sort: "delta24h" };
    case "stars-total":
      return { sort: "stars" };
    case "cross-signal":
      // No direct equivalent; fall back to momentum (the existing default).
      return { sort: "momentum" };
    case "delta7d":
    case "delta24h":
      return { sort: raw };
    default:
      return null;
  }
}

/**
 * Rewrite the incoming URL so we can hand it off to the pure parser. Any
 * legacy-sort value is normalized to its new-API equivalent BEFORE parsing so
 * the parser's strict enum validation keeps working unchanged.
 */
function normalizeLegacySort(url: URL): URL {
  const raw = url.searchParams.get("sort");
  if (raw === null) return url;
  const translated = translateLegacySort(raw);
  // If it's already a new-API value, leave it alone. If it's an unknown value,
  // also leave it alone so the parser rejects it with a clean error.
  if (!translated) return url;
  const next = new URL(url.toString());
  next.searchParams.set("sort", translated.sort);
  if (translated.order && !next.searchParams.has("order")) {
    next.searchParams.set("order", translated.order);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Match context — revenue + funding lookups built once per request.
//
// We don't pre-materialize into Maps because:
//   - `getRevenueOverlay` / `getSelfReportedOverlay` already memoize behind
//     mtime-based caches; calling them repeatedly is essentially free.
//   - `getFundingEventsForRepo` goes through a module-level matcher index
//     that amortizes to O(1) per call after first hit.
// Wrapping them in closures keeps the matcher decoupled from the concrete
// overlay shape and matches the MatchContext contract in search-query.ts.
// ---------------------------------------------------------------------------

function buildMatchContext(): MatchContext {
  return {
    hasRevenue(fullName: string): boolean {
      return (
        getRevenueOverlay(fullName) !== null ||
        getSelfReportedOverlay(fullName) !== null
      );
    },
    getRevenueTier(fullName: string): RevenueTier | null {
      const verified = getRevenueOverlay(fullName);
      if (verified) return verified.tier;
      const self = getSelfReportedOverlay(fullName);
      if (self) return self.tier;
      return null;
    },
    hasFunding(fullName: string): boolean {
      return getFundingEventsForRepo(fullName).length > 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Legacy (v=1) envelope — preserved for the existing search UI + MCP tools.
// ---------------------------------------------------------------------------

function buildLegacyResponse(
  results: Repo[],
  total: number,
  query: SearchQuery,
): NextResponse {
  return NextResponse.json(
    {
      results,
      meta: {
        total,
        query: query.q ?? "",
        limit: query.limit,
      },
    },
    { headers: READ_CACHE_HEADERS },
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // Pull fresh overlays from the data-store before scoring matches. Internal
  // 30s rate-limit absorbs the spike from concurrent search requests.
  await refreshRevenueOverlaysFromStore();
  // `request.nextUrl` is only populated when the handler is invoked via the
  // Next runtime. Unit tests pass a plain `Request`, so we fall back to
  // parsing `request.url` directly — both paths produce the same URL.
  const url = new URL(
    (request as NextRequest).nextUrl?.toString() ?? request.url,
  );
  const apiVersion = url.searchParams.get("v") === "2" ? 2 : 1;

  // v=1: legacy behavior. An empty q + no facets returns empty results so
  // misbehaving clients don't accidentally fetch the whole universe. v=2
  // accepts facet-only queries.
  const hasAnyFacet =
    url.searchParams.has("language") ||
    url.searchParams.has("movement") ||
    url.searchParams.has("minStars") ||
    url.searchParams.has("maxStars") ||
    url.searchParams.has("minMomentum") ||
    url.searchParams.has("maxMomentum") ||
    url.searchParams.has("hasRevenue") ||
    url.searchParams.has("revenueTier") ||
    url.searchParams.has("hasFunding") ||
    url.searchParams.has("hasTwitter") ||
    url.searchParams.has("topic") ||
    url.searchParams.has("category");

  const normalized = normalizeLegacySort(url);
  const parsed = parseSearchQuery(normalized);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error,
        code: parsed.code,
        param: "param" in parsed ? parsed.param : undefined,
      },
      { status: 400 },
    );
  }

  const query = parsed.query;

  // v=1 empty-query shortcut. Matches the pre-facet behavior: no query string
  // + no filter means "return empty", not "dump everything".
  const rawQ = (url.searchParams.get("q") ?? "").trim();
  if (apiVersion === 1 && rawQ === "" && !hasAnyFacet) {
    return buildLegacyResponse([], 0, query);
  }

  // Optional legacy `category` filter — not part of the new facet contract
  // but preserved so existing callers (`?q=foo&category=web`) keep working.
  const category = url.searchParams.get("category");

  // Iterate the derived repos once, applying the faceted filter.
  const ctx = buildMatchContext();
  const all = getDerivedRepos();
  const matched: Repo[] = [];
  for (const repo of all) {
    if (category && repo.categoryId !== category) continue;
    if (!matchesQuery(repo, query, ctx)) continue;
    matched.push(repo);
  }

  const total = matched.length;
  const results = sortAndPage(matched, query);

  if (apiVersion === 1) {
    return buildLegacyResponse(results, total, query);
  }

  // v=2 envelope. Facet aggregation is opt-in: it walks the candidate set
  // ~6x per repo to compute independent-facet counts, so we keep the hot
  // path (no `facets=1`) cheap and only pay the cost when the UI actually
  // needs to render filter chips with live counts.
  const withFacets =
    url.searchParams.get("facets") === "1" ||
    url.searchParams.get("withFacets") === "1";
  // Candidate set for facet counting = every repo that passes the legacy
  // `category` pre-filter (which is not part of the faceted contract). That
  // way the per-dimension drops inside `computeFacets` work off the same
  // universe the main query path does.
  const facets = withFacets
    ? computeFacets(
        all.filter((r) => (category ? r.categoryId === category : true)),
        query,
        ctx,
      )
    : null;

  return NextResponse.json(
    {
      ok: true,
      fetchedAt: new Date().toISOString(),
      query,
      total,
      limit: query.limit,
      offset: query.offset,
      results,
      facets,
    },
    { headers: READ_CACHE_HEADERS },
  );
}
