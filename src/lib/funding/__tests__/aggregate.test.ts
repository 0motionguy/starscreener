// Vitest tests for src/lib/funding/aggregate.ts.
//
// Pure-math coverage on the V4 aggregator: window totals, sector
// breakdown, top movers, top deals, query filters. The fixture is a
// hand-shaped 6-event set with deliberate mix of windows, sectors,
// undisclosed amounts, and same-company multi-rounds so each branch is
// hit at least once.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  _resetFundingCacheForTests,
  _setFundingCacheForTests,
  aggregateSectors,
  aggregateTopMovers,
  aggregateWindow,
  getFundingSectorBreakdown,
  getFundingTopDeals,
  getFundingTopMovers,
  getFundingTotals,
  queryFundingEvents,
} from "../aggregate";
import type { FundingEvent } from "../types";

const NOW = Date.parse("2026-05-01T12:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

const FIXTURE: FundingEvent[] = [
  {
    id: "e1",
    companyName: "Acme AI",
    companySlug: "acme-ai",
    repoFullName: "acme/acme",
    roundType: "series-a",
    amountUsd: 20_000_000,
    closedAt: ago(2 * HOUR), // 24h window
    investors: ["Sequoia"],
    sourceUrl: "https://example.com/1",
    sourceName: "techcrunch",
    confidence: "exact-domain",
    sector: "ai",
  },
  {
    id: "e2",
    companyName: "Beta Bio",
    companySlug: "beta-bio",
    roundType: "seed",
    amountUsd: 5_000_000,
    closedAt: ago(3 * DAY), // 7d (not 24h)
    investors: [],
    sourceUrl: "https://example.com/2",
    sourceName: "venturebeat",
    confidence: "exact-name",
    sector: "healthcare",
  },
  {
    id: "e3",
    companyName: "Acme AI",
    companySlug: "acme-ai",
    repoFullName: "acme/acme",
    roundType: "series-b",
    amountUsd: 80_000_000,
    closedAt: ago(5 * DAY), // 7d window
    investors: ["a16z"],
    sourceUrl: "https://example.com/3",
    sourceName: "techcrunch",
    confidence: "exact-domain",
    sector: "ai",
  },
  {
    id: "e4",
    companyName: "Carbon Co",
    roundType: "pre-seed",
    // amountUsd intentionally undisclosed
    closedAt: ago(10 * DAY), // 30d (not 7d)
    investors: ["Founders Fund"],
    sourceUrl: "https://example.com/4",
    sourceName: "sifted",
    confidence: "alias",
    sector: "climate",
  },
  {
    id: "e5",
    companyName: "Delta Defense",
    roundType: "series-c",
    amountUsd: 200_000_000,
    closedAt: ago(20 * DAY), // 30d
    investors: ["Lockheed"],
    sourceUrl: "https://example.com/5",
    sourceName: "techcrunch",
    confidence: "fuzzy",
    // sector intentionally absent → "uncategorized"
  },
  {
    id: "e6",
    companyName: "Old Co",
    roundType: "ipo",
    amountUsd: 1_000_000_000,
    closedAt: ago(120 * DAY), // outside 30d
    investors: [],
    sourceUrl: "https://example.com/6",
    sourceName: "newsapi",
    confidence: "exact-name",
    sector: "fintech",
  },
];

beforeEach(() => {
  _setFundingCacheForTests({
    fetchedAt: new Date(NOW).toISOString(),
    source: "test-fixture",
    events: FIXTURE,
  });
});

afterEach(() => {
  _resetFundingCacheForTests();
});

describe("aggregateWindow", () => {
  it("sums disclosed amounts and counts deals inside the 24h window", () => {
    const out = aggregateWindow(FIXTURE, "24h", NOW);
    // Only e1 (2h ago) is inside 24h.
    expect(out.dealCount).toBe(1);
    expect(out.totalUsd).toBe(20_000_000);
    expect(out.undisclosedCount).toBe(0);
  });

  it("includes 7d events but excludes the 30d-only and 120d outliers", () => {
    const out = aggregateWindow(FIXTURE, "7d", NOW);
    // e1 (2h), e2 (3d), e3 (5d). e4 is 10d (out), e5 is 20d (out), e6 is 120d (out).
    expect(out.dealCount).toBe(3);
    expect(out.totalUsd).toBe(20_000_000 + 5_000_000 + 80_000_000);
    expect(out.undisclosedCount).toBe(0);
  });

  it("flags undisclosed events without inflating totalUsd", () => {
    const out = aggregateWindow(FIXTURE, "30d", NOW);
    // e1, e2, e3, e4, e5. e6 (120d) is out of 30d.
    expect(out.dealCount).toBe(5);
    expect(out.undisclosedCount).toBe(1); // e4
    // e4 has no amount → not in sum.
    expect(out.totalUsd).toBe(20_000_000 + 5_000_000 + 80_000_000 + 200_000_000);
  });

  it("ignores events with malformed closedAt", () => {
    const broken: FundingEvent[] = [
      ...FIXTURE,
      {
        id: "broken",
        companyName: "Broken",
        roundType: "seed",
        amountUsd: 999,
        closedAt: "not-a-date",
        investors: [],
        sourceUrl: "x",
        sourceName: "x",
        confidence: "fuzzy",
      },
    ];
    const out = aggregateWindow(broken, "30d", NOW);
    // Same 5 valid events as before, the broken row is dropped.
    expect(out.dealCount).toBe(5);
  });
});

describe("getFundingTotals", () => {
  it("computes 24h / 7d / 30d in one pass", () => {
    const totals = getFundingTotals(NOW);
    expect(totals["24h"].dealCount).toBe(1);
    expect(totals["7d"].dealCount).toBe(3);
    expect(totals["30d"].dealCount).toBe(5);
    expect(totals["30d"].totalUsd).toBe(305_000_000);
  });
});

describe("aggregateSectors", () => {
  it("buckets ai correctly across two events for the same sector", () => {
    const sectors = aggregateSectors(FIXTURE, "30d", NOW);
    const ai = sectors.find((s) => s.sector === "ai");
    expect(ai).toBeTruthy();
    expect(ai!.dealCount).toBe(2); // e1 + e3
    expect(ai!.totalUsd).toBe(100_000_000);
    // Top deal is the larger amount (e3 @ $80M).
    expect(ai!.topDeal?.id).toBe("e3");
  });

  it("buckets sector-less events under 'uncategorized'", () => {
    const sectors = aggregateSectors(FIXTURE, "30d", NOW);
    const uncat = sectors.find((s) => s.sector === "uncategorized");
    expect(uncat).toBeTruthy();
    expect(uncat!.dealCount).toBe(1); // e5
    expect(uncat!.topDeal?.id).toBe("e5");
  });

  it("sorts sectors by totalUsd desc", () => {
    const sectors = aggregateSectors(FIXTURE, "30d", NOW);
    // Largest first: uncategorized ($200M, e5) > ai ($100M) > healthcare ($5M) > climate ($0 disclosed).
    const top = sectors.map((s) => s.sector);
    expect(top[0]).toBe("uncategorized");
    expect(top[1]).toBe("ai");
    // Climate's totalUsd is 0 — last.
    expect(top.at(-1)).toBe("climate");
  });

  it("excludes sectors that have no events inside the window", () => {
    // 24h window only contains e1 (ai).
    const sectors = aggregateSectors(FIXTURE, "24h", NOW);
    expect(sectors.length).toBe(1);
    expect(sectors[0].sector).toBe("ai");
  });

  it("matches getFundingSectorBreakdown which reads from the cache", () => {
    const direct = aggregateSectors(FIXTURE, "30d", NOW);
    const fromCache = getFundingSectorBreakdown("30d", NOW);
    expect(fromCache.map((s) => s.sector)).toEqual(direct.map((s) => s.sector));
  });
});

describe("aggregateTopMovers", () => {
  it("merges multiple rounds for the same company by companySlug", () => {
    const movers = aggregateTopMovers(FIXTURE, "30d", 10, NOW);
    const acme = movers.find((m) => m.companySlug === "acme-ai");
    expect(acme).toBeTruthy();
    expect(acme!.dealCount).toBe(2); // e1 + e3
    expect(acme!.totalUsd).toBe(100_000_000);
    expect(acme!.largestRound.id).toBe("e3");
  });

  it("respects the limit", () => {
    const top1 = aggregateTopMovers(FIXTURE, "30d", 1, NOW);
    expect(top1.length).toBe(1);
    // Highest cumulative in 30d is Delta Defense at $200M.
    expect(top1[0].companyName).toBe("Delta Defense");
  });

  it("matches getFundingTopMovers reading from the cache", () => {
    const direct = aggregateTopMovers(FIXTURE, "7d", 5, NOW);
    const fromCache = getFundingTopMovers("7d", 5, NOW);
    expect(fromCache.map((m) => m.companyName)).toEqual(
      direct.map((m) => m.companyName),
    );
  });
});

describe("getFundingTopDeals", () => {
  it("returns disclosed-amount deals sorted desc, capped at limit", () => {
    const deals = getFundingTopDeals("30d", 3, NOW);
    expect(deals.map((d) => d.id)).toEqual(["e5", "e3", "e1"]);
  });

  it("excludes events without a disclosed amount", () => {
    const deals = getFundingTopDeals("30d", 100, NOW);
    expect(deals.find((d) => d.id === "e4")).toBeUndefined();
  });
});

describe("queryFundingEvents", () => {
  it("filters by roundType", () => {
    const page = queryFundingEvents({ roundType: "series-a" });
    expect(page.events.map((e) => e.id)).toEqual(["e1"]);
    expect(page.total).toBe(1);
  });

  it("filters by since (inclusive lower bound)", () => {
    // Cutoff = 7 days ago. Includes e1 (2h), e2 (3d), e3 (5d). Excludes e4+.
    const since = new Date(NOW - 7 * DAY).toISOString();
    const page = queryFundingEvents({ since, limit: 50 });
    const ids = new Set(page.events.map((e) => e.id));
    expect(ids).toEqual(new Set(["e1", "e2", "e3"]));
  });

  it("paginates with offset + limit", () => {
    const page1 = queryFundingEvents({ limit: 2, offset: 0 });
    const page2 = queryFundingEvents({ limit: 2, offset: 2 });
    expect(page1.events.length).toBe(2);
    expect(page2.events.length).toBe(2);
    expect(page1.total).toBe(6);
    expect(page2.total).toBe(6);
    // Newest first across pages, no overlap.
    const ids = new Set([
      ...page1.events.map((e) => e.id),
      ...page2.events.map((e) => e.id),
    ]);
    expect(ids.size).toBe(4);
  });

  it("returns events sorted newest first", () => {
    const page = queryFundingEvents({ limit: 50 });
    const closedTimes = page.events.map((e) => Date.parse(e.closedAt));
    for (let i = 1; i < closedTimes.length; i++) {
      expect(closedTimes[i - 1]).toBeGreaterThanOrEqual(closedTimes[i]);
    }
  });

  it("clamps limit and offset to safe ranges", () => {
    const overLimit = queryFundingEvents({ limit: 9999 });
    expect(overLimit.limit).toBe(200);
    const negOffset = queryFundingEvents({ offset: -10 });
    expect(negOffset.offset).toBe(0);
  });
});

describe("graceful empty data store", () => {
  it("returns zero-shape totals when the cache is empty", () => {
    _resetFundingCacheForTests();
    const totals = getFundingTotals(NOW);
    expect(totals["24h"].dealCount).toBe(0);
    expect(totals["24h"].totalUsd).toBe(0);
    expect(totals["7d"].dealCount).toBe(0);
    expect(totals["30d"].dealCount).toBe(0);

    expect(getFundingSectorBreakdown("30d", NOW)).toEqual([]);
    expect(getFundingTopMovers("30d", 10, NOW)).toEqual([]);
    expect(getFundingTopDeals("30d", 10, NOW)).toEqual([]);
    expect(queryFundingEvents().events).toEqual([]);
  });
});
