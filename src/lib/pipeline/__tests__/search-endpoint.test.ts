// StarScreener — GET /api/search faceted filter tests.
//
// Two layers of coverage:
//   1) Pure unit tests against `src/lib/search-query.ts` (parser + matcher +
//      sort/page). These don't touch the filesystem or the pipeline stores.
//   2) Route-level tests that hit the real `GET` handler. These use the
//      committed derived-repo dataset (same pattern as the other endpoint
//      tests in this folder) and assert high-level invariants that must
//      hold for any non-empty universe — back-compat with `?q=...`,
//      unknown params ignored, Cache-Control header, etc.
//
// Run with: npx tsx --test src/lib/pipeline/__tests__/search-endpoint.test.ts
//
// Persistence is disabled so the route doesn't read whatever happens to be
// in `.data/` on the dev box; `getDerivedRepos` falls back to the committed
// `data/*.json` sources, which are stable across runs.
process.env.STARSCREENER_PERSIST = "false";

import { test } from "node:test";
import assert from "node:assert/strict";

import type { MovementStatus, Repo, RevenueTier } from "../../types";
import {
  computeFacets,
  matchesQuery,
  parseSearchQuery,
  sortAndPage,
  type Facets,
  type MatchContext,
  type SearchQuery,
} from "../../search-query";
import { makeRepo } from "../../../tools/__tests__/fixtures";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function url(path: string): URL {
  return new URL(`http://localhost${path}`);
}

function parseOk(path: string): SearchQuery {
  const res = parseSearchQuery(url(path));
  assert.ok(res.ok, `expected parse ok for ${path}, got ${JSON.stringify(res)}`);
  return (res as { ok: true; query: SearchQuery }).query;
}

const EMPTY_CTX: MatchContext = {
  hasRevenue: () => false,
  getRevenueTier: () => null,
  hasFunding: () => false,
};

// ---------------------------------------------------------------------------
// Parser: defaults, ranges, enum validation
// ---------------------------------------------------------------------------

test("parseSearchQuery: empty URL yields defaults", () => {
  const q = parseOk("/api/search");
  assert.equal(q.q, null);
  assert.deepEqual(q.languages, []);
  assert.deepEqual(q.movements, []);
  assert.equal(q.minStars, null);
  assert.equal(q.maxStars, null);
  assert.equal(q.hasRevenue, null);
  assert.equal(q.revenueTier, null);
  assert.equal(q.hasFunding, null);
  assert.equal(q.hasTwitter, null);
  assert.equal(q.sort, "momentum");
  assert.equal(q.order, "desc");
  assert.equal(q.limit, 30);
  assert.equal(q.offset, 0);
});

test("parseSearchQuery: q trimmed, empty collapses to null", () => {
  assert.equal(parseOk("/api/search?q=%20%20%20").q, null);
  assert.equal(parseOk("/api/search?q=foo").q, "foo");
  assert.equal(parseOk("/api/search?q=%20foo%20").q, "foo");
});

test("parseSearchQuery: language accepts repeated + comma-delimited, dedups, lowercases", () => {
  const q1 = parseOk("/api/search?language=TypeScript&language=Python");
  assert.deepEqual(q1.languages, ["typescript", "python"]);

  const q2 = parseOk("/api/search?language=TS,PY,ts");
  assert.deepEqual(q2.languages, ["ts", "py"]);
});

test("parseSearchQuery: movement rejects unknown values with invalid_param", () => {
  const res = parseSearchQuery(url("/api/search?movement=floating"));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.code, "invalid_param");
  assert.equal(res.param, "movement");
});

test("parseSearchQuery: numeric ranges reject non-numeric strings", () => {
  for (const key of [
    "minStars",
    "maxStars",
    "minMomentum",
    "maxMomentum",
  ]) {
    const res = parseSearchQuery(url(`/api/search?${key}=notanumber`));
    assert.equal(res.ok, false, `${key} should reject notanumber`);
    if (res.ok) return;
    assert.equal(res.code, "invalid_param");
    assert.equal(res.param, key);
  }
});

test("parseSearchQuery: booleans accept true/false/1/0", () => {
  const q1 = parseOk("/api/search?hasRevenue=true&hasFunding=false&hasTwitter=1");
  assert.equal(q1.hasRevenue, true);
  assert.equal(q1.hasFunding, false);
  assert.equal(q1.hasTwitter, true);

  const q2 = parseOk("/api/search?hasRevenue=0");
  assert.equal(q2.hasRevenue, false);
});

test("parseSearchQuery: bad boolean yields invalid_param", () => {
  const res = parseSearchQuery(url("/api/search?hasRevenue=maybe"));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.code, "invalid_param");
  assert.equal(res.param, "hasRevenue");
});

test("parseSearchQuery: revenueTier implies hasRevenue=true", () => {
  const q = parseOk("/api/search?revenueTier=verified");
  assert.equal(q.revenueTier, "verified");
  assert.equal(q.hasRevenue, true);
});

test("parseSearchQuery: invalid revenueTier → invalid_param", () => {
  const res = parseSearchQuery(url("/api/search?revenueTier=bogus"));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.code, "invalid_param");
  assert.equal(res.param, "revenueTier");
});

test("parseSearchQuery: limit out-of-range rejected", () => {
  for (const v of ["0", "201", "-1", "abc", "1.5"]) {
    const res = parseSearchQuery(url(`/api/search?limit=${v}`));
    assert.equal(res.ok, false, `limit=${v} should reject`);
    if (res.ok) return;
    assert.equal(res.code, "invalid_param");
    assert.equal(res.param, "limit");
  }
});

test("parseSearchQuery: sort enum enforced", () => {
  const ok = parseOk("/api/search?sort=stars");
  assert.equal(ok.sort, "stars");
  const res = parseSearchQuery(url("/api/search?sort=popularity"));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.param, "sort");
});

test("parseSearchQuery: unknown params are ignored (200 path)", () => {
  const q = parseOk("/api/search?foo=bar&baz=qux&q=hello");
  assert.equal(q.q, "hello");
});

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

function repo(overrides: Partial<Repo> & { id: string; fullName?: string }): Repo {
  return makeRepo({ ...overrides });
}

test("matchesQuery: full-text still matches fullName / description / topic", () => {
  const r = repo({
    id: "anthropics--claude-code",
    fullName: "anthropics/claude-code",
    description: "the best CLI",
    topics: ["agents"],
  });
  const q = parseOk("/api/search?q=claude");
  assert.equal(matchesQuery(r, q, EMPTY_CTX), true);

  const q2 = parseOk("/api/search?q=CLI");
  assert.equal(matchesQuery(r, q2, EMPTY_CTX), true);

  const q3 = parseOk("/api/search?q=AGENTS");
  assert.equal(matchesQuery(r, q3, EMPTY_CTX), true);

  const q4 = parseOk("/api/search?q=nope");
  assert.equal(matchesQuery(r, q4, EMPTY_CTX), false);
});

test("matchesQuery: language filter OR-merges case-insensitively", () => {
  const pyRepo = repo({ id: "a--py", language: "Python" });
  const tsRepo = repo({ id: "a--ts", language: "TypeScript" });
  const goRepo = repo({ id: "a--go", language: "Go" });

  const q = parseOk("/api/search?language=typescript&language=python");
  assert.equal(matchesQuery(pyRepo, q, EMPTY_CTX), true);
  assert.equal(matchesQuery(tsRepo, q, EMPTY_CTX), true);
  assert.equal(matchesQuery(goRepo, q, EMPTY_CTX), false);

  // Repos with null language are excluded when a language filter is set.
  const unknown = repo({ id: "a--unk", language: null });
  assert.equal(matchesQuery(unknown, q, EMPTY_CTX), false);
});

test("matchesQuery: stars range filters both bounds", () => {
  const small = repo({ id: "a--small", stars: 100 });
  const medium = repo({ id: "a--medium", stars: 2500 });
  const large = repo({ id: "a--large", stars: 10000 });

  const q = parseOk("/api/search?minStars=1000&maxStars=5000");
  assert.equal(matchesQuery(small, q, EMPTY_CTX), false);
  assert.equal(matchesQuery(medium, q, EMPTY_CTX), true);
  assert.equal(matchesQuery(large, q, EMPTY_CTX), false);
});

test("matchesQuery: momentum range filters both bounds", () => {
  const a = repo({ id: "a--a", momentumScore: 30 });
  const b = repo({ id: "a--b", momentumScore: 70 });
  const c = repo({ id: "a--c", momentumScore: 95 });

  const q = parseOk("/api/search?minMomentum=50&maxMomentum=80");
  assert.equal(matchesQuery(a, q, EMPTY_CTX), false);
  assert.equal(matchesQuery(b, q, EMPTY_CTX), true);
  assert.equal(matchesQuery(c, q, EMPTY_CTX), false);
});

test("matchesQuery: movement filter OR-merges", () => {
  const movements: MovementStatus[] = [
    "hot",
    "breakout",
    "rising",
    "stable",
    "cooling",
  ];
  const repos = movements.map((m) =>
    repo({ id: `a--${m}`, movementStatus: m }),
  );
  const q = parseOk("/api/search?movement=breakout&movement=hot");
  const kept = repos.filter((r) => matchesQuery(r, q, EMPTY_CTX));
  assert.deepEqual(
    kept.map((r) => r.movementStatus).sort(),
    ["breakout", "hot"],
  );
});

test("matchesQuery: hasRevenue=true excludes repos without revenue", () => {
  const withRevenue = repo({ id: "a--rev", fullName: "a/rev" });
  const withoutRevenue = repo({ id: "a--none", fullName: "a/none" });
  const ctx: MatchContext = {
    hasRevenue: (fn) => fn === "a/rev",
    getRevenueTier: () => null,
    hasFunding: () => false,
  };
  const q = parseOk("/api/search?hasRevenue=true");
  assert.equal(matchesQuery(withRevenue, q, ctx), true);
  assert.equal(matchesQuery(withoutRevenue, q, ctx), false);
});

test("matchesQuery: revenueTier=verified narrows to verified tier", () => {
  const verified = repo({ id: "a--v", fullName: "a/v" });
  const selfReported = repo({ id: "a--sr", fullName: "a/sr" });
  const ctx: MatchContext = {
    hasRevenue: () => true,
    getRevenueTier: (fn): RevenueTier | null =>
      fn === "a/v"
        ? "verified_trustmrr"
        : fn === "a/sr"
          ? "self_reported"
          : null,
    hasFunding: () => false,
  };
  const qVerified = parseOk("/api/search?revenueTier=verified");
  assert.equal(matchesQuery(verified, qVerified, ctx), true);
  assert.equal(matchesQuery(selfReported, qVerified, ctx), false);

  const qSelf = parseOk("/api/search?revenueTier=self_reported");
  assert.equal(matchesQuery(verified, qSelf, ctx), false);
  assert.equal(matchesQuery(selfReported, qSelf, ctx), true);
});

test("matchesQuery: hasFunding true/false invert correctly", () => {
  const funded = repo({ id: "a--funded", fullName: "a/funded" });
  const dry = repo({ id: "a--dry", fullName: "a/dry" });
  const ctx: MatchContext = {
    hasRevenue: () => false,
    getRevenueTier: () => null,
    hasFunding: (fn) => fn === "a/funded",
  };
  const qTrue = parseOk("/api/search?hasFunding=true");
  assert.equal(matchesQuery(funded, qTrue, ctx), true);
  assert.equal(matchesQuery(dry, qTrue, ctx), false);

  const qFalse = parseOk("/api/search?hasFunding=false");
  assert.equal(matchesQuery(funded, qFalse, ctx), false);
  assert.equal(matchesQuery(dry, qFalse, ctx), true);
});

test("matchesQuery: hasTwitter filter", () => {
  const withTw = repo({ id: "a--t", fullName: "a/t" });
  withTw.twitter = {
    mentionCount24h: 5,
    uniqueAuthors24h: 2,
    finalTwitterScore: 3,
    badgeState: "x",
    topPostUrl: null,
    lastScannedAt: "2026-04-01T00:00:00.000Z",
  };
  const withoutTw = repo({ id: "a--nt", fullName: "a/nt" });
  const qTrue = parseOk("/api/search?hasTwitter=true");
  assert.equal(matchesQuery(withTw, qTrue, EMPTY_CTX), true);
  assert.equal(matchesQuery(withoutTw, qTrue, EMPTY_CTX), false);
});

test("matchesQuery: topic substring match is case-insensitive", () => {
  const r = repo({
    id: "a--ml",
    topics: ["artificial-intelligence", "llm"],
  });
  // Substring, case-insensitive: "INTEL" sits inside "artificial-intelligence".
  const qSubstring = parseOk("/api/search?topic=INTEL");
  assert.equal(matchesQuery(r, qSubstring, EMPTY_CTX), true);
  const qExact = parseOk("/api/search?topic=llm");
  assert.equal(matchesQuery(r, qExact, EMPTY_CTX), true);
  const qMiss = parseOk("/api/search?topic=web");
  assert.equal(matchesQuery(r, qMiss, EMPTY_CTX), false);
});

// ---------------------------------------------------------------------------
// Sort + page
// ---------------------------------------------------------------------------

test("sortAndPage: sort=stars order=asc", () => {
  const repos = [
    repo({ id: "a--b", fullName: "a/b", stars: 50 }),
    repo({ id: "a--a", fullName: "a/a", stars: 100 }),
    repo({ id: "a--c", fullName: "a/c", stars: 10 }),
  ];
  const q = parseOk("/api/search?sort=stars&order=asc");
  const out = sortAndPage(repos, q);
  assert.deepEqual(
    out.map((r) => r.fullName),
    ["a/c", "a/b", "a/a"],
  );
});

test("sortAndPage: limit + offset page correctly", () => {
  const repos = Array.from({ length: 50 }, (_, i) =>
    repo({
      id: `a--${i}`,
      fullName: `a/r${String(i).padStart(2, "0")}`,
      momentumScore: 100 - i, // descending
    }),
  );
  const q = parseOk("/api/search?limit=10&offset=20");
  const out = sortAndPage(repos, q);
  assert.equal(out.length, 10);
  // Default sort is momentum desc: the full sort order is r00, r01, ..., r49.
  // offset=20 → starts at r20.
  assert.equal(out[0].fullName, "a/r20");
  assert.equal(out[9].fullName, "a/r29");
});

// ---------------------------------------------------------------------------
// Route-level tests against the live handler
// ---------------------------------------------------------------------------

async function invokeSearch(qs: string): Promise<Response> {
  const { GET } = await import("../../../app/api/search/route");
  const req = new Request(`http://localhost/api/search${qs}`);
  return GET(req as never);
}

test("route: existing ?q=foo still returns v=1 envelope", async () => {
  const res = await invokeSearch("?q=llm&limit=5");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    results: Repo[];
    meta: { total: number; query: string; limit: number };
  };
  assert.ok(Array.isArray(body.results));
  assert.equal(typeof body.meta.total, "number");
  assert.equal(body.meta.query, "llm");
  assert.equal(body.meta.limit, 5);
});

test("route: empty q + no facets returns empty (back-compat)", async () => {
  const res = await invokeSearch("");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    results: Repo[];
    meta: { total: number; query: string };
  };
  assert.equal(body.results.length, 0);
  assert.equal(body.meta.total, 0);
  assert.equal(body.meta.query, "");
});

test("route: language=typescript narrows (but the filter fires)", async () => {
  const res = await invokeSearch("?language=typescript&limit=20");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { results: Repo[] };
  for (const r of body.results) {
    assert.equal(
      (r.language ?? "").toLowerCase(),
      "typescript",
      `expected typescript, got ${r.language} for ${r.fullName}`,
    );
  }
});

test("route: minStars filter excludes smaller repos", async () => {
  const res = await invokeSearch("?minStars=10000&limit=20");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { results: Repo[] };
  for (const r of body.results) {
    assert.ok(r.stars >= 10000, `${r.fullName} had ${r.stars} stars`);
  }
});

test("route: invalid param → 400 with code invalid_param", async () => {
  const res = await invokeSearch("?limit=999999");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; code: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "invalid_param");
});

test("route: invalid movement → 400", async () => {
  const res = await invokeSearch("?movement=floaty");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "invalid_param");
});

test("route: unknown param ignored, not 400", async () => {
  const res = await invokeSearch("?foo=bar");
  assert.equal(res.status, 200);
});

test("route: Cache-Control header present on 200", async () => {
  const res = await invokeSearch("?q=llm");
  assert.equal(res.status, 200);
  const cc = res.headers.get("Cache-Control");
  assert.ok(cc, "Cache-Control must be set");
  assert.match(cc!, /s-maxage=30/);
  assert.match(cc!, /stale-while-revalidate=60/);
});

test("route: v=2 returns new envelope with total/limit/offset/query", async () => {
  const res = await invokeSearch("?v=2&limit=5");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    fetchedAt: string;
    query: SearchQuery;
    total: number;
    limit: number;
    offset: number;
    results: Repo[];
  };
  assert.equal(body.ok, true);
  assert.equal(body.limit, 5);
  assert.equal(body.offset, 0);
  assert.equal(typeof body.total, "number");
  assert.ok(Array.isArray(body.results));
  assert.ok(!Number.isNaN(Date.parse(body.fetchedAt)));
});

test("route: v=2 sort=stars order=asc returns ascending stars", async () => {
  const res = await invokeSearch("?v=2&sort=stars&order=asc&limit=10");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { results: Repo[] };
  for (let i = 1; i < body.results.length; i++) {
    assert.ok(
      body.results[i - 1].stars <= body.results[i].stars,
      `asc sort violated at i=${i}: ${body.results[i - 1].stars} > ${body.results[i].stars}`,
    );
  }
});

// ---------------------------------------------------------------------------
// computeFacets — pure unit tests
// ---------------------------------------------------------------------------

/**
 * Small in-memory universe sized to exercise every facet dimension without
 * depending on the committed data fixture. 6 repos across 3 languages, 3
 * movements, overlapping topics, mixed revenue/funding states.
 */
function buildFacetUniverse(): {
  repos: Repo[];
  ctx: MatchContext;
} {
  const repos: Repo[] = [
    repo({
      id: "a--py1",
      fullName: "a/py1",
      language: "Python",
      movementStatus: "hot",
      topics: ["ai", "llm"],
    }),
    repo({
      id: "a--py2",
      fullName: "a/py2",
      language: "Python",
      movementStatus: "rising",
      topics: ["ai", "rag"],
    }),
    repo({
      id: "a--ts1",
      fullName: "a/ts1",
      language: "TypeScript",
      movementStatus: "hot",
      topics: ["web", "llm"],
    }),
    repo({
      id: "a--ts2",
      fullName: "a/ts2",
      language: "TypeScript",
      movementStatus: "stable",
      topics: ["web"],
    }),
    repo({
      id: "a--go1",
      fullName: "a/go1",
      language: "Go",
      movementStatus: "stable",
      topics: ["infra"],
    }),
    repo({
      id: "a--nolang",
      fullName: "a/nolang",
      language: null,
      movementStatus: "cooling",
      topics: [],
    }),
  ];

  // Revenue: py1 verified, ts1 self_reported, ts2 self_reported, rest none.
  // Funding: py1, ts1 funded; rest not.
  const ctx: MatchContext = {
    hasRevenue: (fn) =>
      fn === "a/py1" || fn === "a/ts1" || fn === "a/ts2",
    getRevenueTier: (fn): RevenueTier | null => {
      if (fn === "a/py1") return "verified_trustmrr";
      if (fn === "a/ts1" || fn === "a/ts2") return "self_reported";
      return null;
    },
    hasFunding: (fn) => fn === "a/py1" || fn === "a/ts1",
  };

  return { repos, ctx };
}

test("computeFacets: languages dimension ignores the language filter", () => {
  const { repos, ctx } = buildFacetUniverse();
  // User filtered to Python — the language bucket MUST still show every
  // language so the UI can render other chips ("switch to TS: 2 repos").
  const q = parseOk("/api/search?language=python");
  const facets = computeFacets(repos, q, ctx);
  assert.equal(facets.languages.Python, 2);
  assert.equal(facets.languages.TypeScript, 2);
  assert.equal(facets.languages.Go, 1);
  // null-language repo is dropped from the bucket list (skip null/empty).
  assert.equal(Object.keys(facets.languages).includes(""), false);
});

test("computeFacets: languages cap at top 20 by count DESC", () => {
  // Build a universe with 30 distinct languages, each with descending counts.
  const many: Repo[] = [];
  for (let i = 0; i < 30; i++) {
    const count = 30 - i;
    for (let j = 0; j < count; j++) {
      many.push(
        repo({
          id: `a--lang${i}-${j}`,
          fullName: `a/lang${i}-${j}`,
          language: `Lang${String(i).padStart(2, "0")}`,
        }),
      );
    }
  }
  const q = parseOk("/api/search");
  const facets = computeFacets(many, q, EMPTY_CTX);
  const langKeys = Object.keys(facets.languages);
  assert.equal(langKeys.length, 20);
  // Top entry must be Lang00 (count 30), since top-N is DESC by count.
  assert.equal(facets.languages.Lang00, 30);
  // Lang19 (count 11) should be present; Lang20 (count 10) should not.
  assert.equal(Object.prototype.hasOwnProperty.call(facets.languages, "Lang19"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(facets.languages, "Lang20"), false);
});

test("computeFacets: movements emits all known keys even with zero counts", () => {
  const { repos, ctx } = buildFacetUniverse();
  const q = parseOk("/api/search");
  const facets = computeFacets(repos, q, ctx);
  const expectedKeys: MovementStatus[] = [
    "hot",
    "breakout",
    "quiet_killer",
    "rising",
    "stable",
    "cooling",
    "declining",
  ];
  for (const k of expectedKeys) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(facets.movements, k),
      `movements should always include key ${k}`,
    );
  }
  // Counts from the fixture.
  assert.equal(facets.movements.hot, 2);
  assert.equal(facets.movements.rising, 1);
  assert.equal(facets.movements.stable, 2);
  assert.equal(facets.movements.cooling, 1);
  assert.equal(facets.movements.breakout, 0);
  assert.equal(facets.movements.declining, 0);
  assert.equal(facets.movements.quiet_killer, 0);
});

test("computeFacets: movements dimension ignores the movement filter", () => {
  const { repos, ctx } = buildFacetUniverse();
  // User filtered to hot — movement buckets must still reflect the full
  // universe (minus other filters, which are empty here).
  const q = parseOk("/api/search?movement=hot");
  const facets = computeFacets(repos, q, ctx);
  assert.equal(facets.movements.hot, 2);
  assert.equal(facets.movements.rising, 1);
});

test("computeFacets: topics dimension caps at top 30 DESC, case-insensitive, deduped per repo", () => {
  // Build 35 distinct topics, descending repo counts 35..1.
  const many: Repo[] = [];
  for (let i = 0; i < 35; i++) {
    const count = 35 - i;
    const topic = `topic-${String(i).padStart(2, "0")}`;
    for (let j = 0; j < count; j++) {
      many.push(
        repo({
          id: `a--t${i}-${j}`,
          fullName: `a/t${i}-${j}`,
          // Mix-case to exercise normalization; duplicate to test dedup.
          topics: [topic.toUpperCase(), topic, topic],
        }),
      );
    }
  }
  const q = parseOk("/api/search");
  const facets = computeFacets(many, q, EMPTY_CTX);
  const keys = Object.keys(facets.topics);
  assert.equal(keys.length, 30);
  // Normalized to lowercase.
  for (const k of keys) {
    assert.equal(k, k.toLowerCase(), `topic key ${k} not lowercased`);
  }
  // Dedup inside a single repo — topic-00 repeated 3x per repo still counts once.
  assert.equal(facets.topics["topic-00"], 35);
  // top-30 boundary.
  assert.equal(
    Object.prototype.hasOwnProperty.call(facets.topics, "topic-29"),
    true,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(facets.topics, "topic-30"),
    false,
  );
});

test("computeFacets: hasRevenue dimension drops both hasRevenue AND revenueTier filters", () => {
  const { repos, ctx } = buildFacetUniverse();
  // Without the drop, revenueTier=self_reported would force hasRevenue=true,
  // which would mean hasRevenue.false is 0 — useless for the chip.
  const q = parseOk("/api/search?revenueTier=self_reported");
  const facets = computeFacets(repos, q, ctx);
  // Full universe: 3 have revenue, 3 do not.
  assert.equal(facets.hasRevenue.true, 3);
  assert.equal(facets.hasRevenue.false, 3);
});

test("computeFacets: hasFunding splits correctly", () => {
  const { repos, ctx } = buildFacetUniverse();
  const q = parseOk("/api/search?hasFunding=true");
  const facets = computeFacets(repos, q, ctx);
  // Dropping the hasFunding filter, 2 funded, 4 not.
  assert.equal(facets.hasFunding.true, 2);
  assert.equal(facets.hasFunding.false, 4);
});

test("computeFacets: revenueTier dimension drops only the tier filter, not hasRevenue", () => {
  const { repos, ctx } = buildFacetUniverse();
  // hasRevenue=false is preserved while we count tier buckets — repos with
  // any revenue are excluded, so verified + self_reported should both be 0
  // and none should be 3.
  const q = parseOk("/api/search?hasRevenue=false");
  const facets = computeFacets(repos, q, ctx);
  assert.equal(facets.revenueTier.verified, 0);
  assert.equal(facets.revenueTier.self_reported, 0);
  assert.equal(facets.revenueTier.none, 3);
});

test("computeFacets: revenueTier buckets the full universe correctly with no filters", () => {
  const { repos, ctx } = buildFacetUniverse();
  const q = parseOk("/api/search");
  const facets = computeFacets(repos, q, ctx);
  assert.equal(facets.revenueTier.verified, 1);
  assert.equal(facets.revenueTier.self_reported, 2);
  assert.equal(facets.revenueTier.none, 3);
});

// ---------------------------------------------------------------------------
// Route-level facet wiring
// ---------------------------------------------------------------------------

test("route: v=2 without facets=1 returns facets: null", async () => {
  const res = await invokeSearch("?v=2&limit=1");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { facets: unknown };
  assert.equal(body.facets, null);
});

test("route: v=2 with facets=1 returns populated facet record", async () => {
  const res = await invokeSearch("?v=2&facets=1&limit=1");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { facets: Facets | null };
  assert.ok(body.facets, "facets should not be null when facets=1");
  const f = body.facets!;
  // Language bucket: cap at 20.
  assert.ok(Object.keys(f.languages).length <= 20);
  // Movements: always the full enum.
  assert.deepEqual(
    Object.keys(f.movements).sort(),
    [
      "breakout",
      "cooling",
      "declining",
      "hot",
      "quiet_killer",
      "rising",
      "stable",
    ].sort(),
  );
  // Topic bucket: cap at 30.
  assert.ok(Object.keys(f.topics).length <= 30);
  // Boolean buckets present with numeric counts.
  assert.equal(typeof f.hasRevenue.true, "number");
  assert.equal(typeof f.hasRevenue.false, "number");
  assert.equal(typeof f.hasFunding.true, "number");
  assert.equal(typeof f.hasFunding.false, "number");
  // revenueTier has exactly 3 keys.
  assert.deepEqual(
    Object.keys(f.revenueTier).sort(),
    ["none", "self_reported", "verified"],
  );
});

test("route: withFacets=1 alias also activates facet computation", async () => {
  const res = await invokeSearch("?v=2&withFacets=1&limit=1");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { facets: Facets | null };
  assert.ok(body.facets, "facets should be populated via withFacets=1 alias");
});

test("route: limit=10 offset=20 respects pagination in v=2", async () => {
  // Use a broad filter so the result set is large enough to page.
  const first = await invokeSearch("?v=2&limit=30&offset=0");
  const firstBody = (await first.json()) as { results: Repo[]; total: number };
  if (firstBody.results.length < 25) {
    // Not enough data in this fixture to exercise offset. The invariants
    // for sort + page are already covered by the pure unit test above;
    // we skip rather than assert a brittle count.
    return;
  }
  const res = await invokeSearch("?v=2&limit=10&offset=20");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { results: Repo[]; offset: number };
  assert.equal(body.offset, 20);
  assert.ok(body.results.length <= 10);
  // The 20th entry of the default-sort full list should equal the first
  // entry returned under offset=20.
  assert.equal(
    body.results[0]?.fullName,
    firstBody.results[20]?.fullName,
  );
});
