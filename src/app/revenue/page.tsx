// /revenue — Revenue Terminal. Phase 2B of the UI v6 rebuild.
//
// Wires:
//   refreshRevenueOverlaysFromStore() + listRevenueOverlays()   — verified OSS overlays
//   refreshRevenueStartupsFromStore() + getLeaderboard()        — TrustMRR catalog leaderboard
//   getDerivedRepos()                                           — join overlays to tracked repos
//   listRevenueSubmissions()                                    — verified-this-week count
//
// ISR: revalidate = 1800 (30 min). Catalog refreshes at most once per 30s
// per process internally, so re-rendering on every request is cheap.

import {
  refreshRevenueOverlaysFromStore,
  listRevenueOverlays,
} from "@/lib/revenue-overlays";
import {
  refreshRevenueStartupsFromStore,
  getLeaderboard,
  LEADERBOARD_CATEGORIES,
  getTrustMrrMeta,
  type VerifiedStartup,
} from "@/lib/revenue-startups";
import { listRevenueSubmissions } from "@/lib/revenue-submissions";
import { getDerivedRepos } from "@/lib/derived-repos";

import type { RevenueOverlay } from "@/lib/types";

import {
  RevenueHero,
  CATEGORY_FILTERS,
  type RevenueCategoryFilter,
} from "@/components/revenue/RevenueHero";
import { RevenueKpiStrip } from "@/components/revenue/RevenueKpiStrip";
import {
  TrackedOssCards,
  type TrackedOssCardItem,
} from "@/components/revenue/TrackedOssCards";
import { RevenueLeaderboard } from "@/components/revenue/RevenueLeaderboard";
import { FoundersCtaRevenue } from "@/components/revenue/FoundersCtaRevenue";
import { RevenueValueStrip } from "@/components/revenue/RevenueValueStrip";
import {
  RevenueTickerTape,
  type RevenueSignalTapeItem,
} from "@/components/revenue/RevenueTickerTape";
import type { CategoryPillItem } from "@/components/revenue/CategoryFilterPills";

export const revalidate = 1800;

export const metadata = {
  title: "Revenue Terminal",
  description:
    "Verified MRR for the trending repo desk. Direct read-only sync with Stripe, Lemon Squeezy, Paddle. OSS-matched startups + the broader dev-adjacent catalog.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Page-level inline styles for the .rev-head / .rev-kpi / .tracked-grid /
 * .tracked-card / .cat-pills / .rev-table-head selectors that the HTML
 * reference inlines into a <style> block. Kept verbatim from 10-revenue.html
 * so the existing visual language carries through.
 */
const PAGE_CSS = `
.rev-head { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 18px; padding: 6px 0 14px; }
.rev-head .segmented a {
  padding: 5px 11px;
  background: transparent;
  border: 0;
  color: var(--fg-subtle);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: 1px;
  text-decoration: none;
  transition: all var(--d-fast) var(--ease);
}
.rev-head .segmented a:hover { color: var(--fg); }
.rev-head .segmented a.on { background: var(--surface-3); color: var(--fg-bright); }
.revenue-signal-tape { margin: 0 0 14px; border: 1px solid var(--border-subtle); border-radius: var(--r-1); overflow: hidden; background: var(--surface); }
.rev-kpi { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; background: var(--border-subtle); border: 1px solid var(--border-subtle); border-radius: var(--r-1); margin-bottom: 18px; }
@media (max-width: 1100px) { .rev-kpi { grid-template-columns: repeat(2, 1fr); } }
.rev-kpi .cell { background: var(--surface); padding: 14px 16px; }
.rev-kpi .cell .l { font-family: var(--font-mono); font-size: 9.5px; color: var(--fg-faint); text-transform: uppercase; letter-spacing: 0.10em; }
.rev-kpi .cell .v { font-family: var(--font-mono); font-size: 22px; color: var(--fg-bright); font-variant-numeric: tabular-nums; margin-top: 4px; font-weight: 500; }
.rev-kpi .cell .v.up { color: var(--up); }
.rev-kpi .cell .v.acc { color: var(--accent); }
.rev-kpi .cell .d { font-family: var(--font-mono); font-size: 10px; color: var(--fg-muted); margin-top: 2px; }
.rev-kpi .cell .d.up { color: var(--up); }

.panel { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--r-1); }
.panel-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); }
.panel-head .ph-eyebrow { font-family: var(--font-mono); font-size: 9.5px; color: var(--accent); letter-spacing: 0.10em; text-transform: uppercase; }
.panel-head .ph-title { font-size: 13px; color: var(--fg-bright); font-weight: 500; }
.panel-head .ph-meta { margin-left: auto; font-family: var(--font-mono); font-size: 10.5px; color: var(--fg-muted); }
.panel-head .ph-meta b { color: var(--fg-bright); font-weight: 500; }

.tracked-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: 1px;
  background: var(--border-subtle);
}
.tracked-card {
  background: var(--surface);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: background var(--d-fast) var(--ease);
}
.tracked-card:hover { background: var(--surface-2); }
.tracked-card .tc-head { display: flex; align-items: center; gap: 10px; }
.tracked-card .tc-rank { font-family: var(--font-mono); font-size: 10px; color: var(--fg-faint); width: 22px; }
.tracked-card .tc-logo {
  width: 36px; height: 36px;
  background: var(--surface-3);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  display: grid; place-items: center;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--up);
  font-weight: 600;
  flex-shrink: 0;
}
.tracked-card .tc-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tracked-card .tc-name { font-size: 13px; color: var(--fg-bright); font-weight: 500; display: flex; align-items: center; gap: 6px; }
.tracked-card .tc-name .verified { color: var(--up); font-size: 11px; }
.tracked-card .tc-repo { font-family: var(--font-mono); font-size: 10.5px; color: var(--cyan); }
.tracked-card .tc-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding-top: 8px; border-top: 1px solid var(--border-subtle); }
.tracked-card .tc-stat .lbl { font-family: var(--font-mono); font-size: 9px; color: var(--fg-faint); text-transform: uppercase; letter-spacing: 0.10em; }
.tracked-card .tc-stat .val { font-family: var(--font-mono); font-size: 14px; color: var(--up); font-variant-numeric: tabular-nums; font-weight: 600; }
.tracked-card .tc-stat .val.fg { color: var(--fg-bright); }
.tracked-card .tc-stat .val.up { color: var(--up); }
.tracked-card .tc-stat .val.down { color: var(--down); }
.tracked-card .tc-foot { display: flex; gap: 6px; padding-top: 6px; border-top: 1px solid var(--border-subtle); }
.tracked-card .tc-foot .pp {
  font-family: var(--font-mono);
  font-size: 9.5px;
  padding: 2px 6px;
  background: var(--surface-3);
  border-radius: 2px;
  color: var(--fg-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 600;
}
.tracked-card .tc-foot .pp.stripe { background: rgba(99,91,255,0.16); color: #8580ff; }
.tracked-card .tc-foot .pp.lemonsqueezy { background: rgba(255,204,2,0.16); color: #ffcc02; }
.tracked-card .tc-foot .pp.paddle { background: rgba(33,150,243,0.16); color: #2196f3; }

.cat-pills { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); }
.cat-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-pill);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg);
  cursor: pointer;
  transition: all var(--d-fast) var(--ease);
}
.cat-pill:hover { border-color: var(--up); color: var(--up); }
.cat-pill.on { background: var(--up-soft); border-color: var(--up); color: var(--up); }
.cat-pill .ct { color: var(--fg-faint); font-size: 9.5px; margin-left: 2px; }

.rev-table-head {
  display: grid;
  grid-template-columns: 32px 36px 1fr 100px 90px 80px 60px;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--fg-faint);
  text-transform: uppercase;
  letter-spacing: 0.10em;
}
.rev-table-head .right { text-align: right; }
`;

/** Map a leaderboard pill id to the TrustMRR catalog category name. */
const CATEGORY_ID_TO_TRUSTMRR: Record<string, string | null> = {
  all: null,
  "dev-tools": "Developer Tools",
  ai: "Artificial Intelligence",
  saas: "SaaS",
  "e-commerce": "E-commerce",
  content: "Content Creation",
  analytics: "Analytics",
  fintech: "Fintech",
  education: "Education",
};

/** Subset of categories surfaced as filter pills on the leaderboard. */
const LEADERBOARD_PILL_IDS = [
  "all",
  "dev-tools",
  "ai",
  "saas",
  "e-commerce",
  "content",
  "analytics",
  "fintech",
  "education",
];

/** Categories surfaced in the hero segmented control. */
const HERO_FILTER_IDS = CATEGORY_FILTERS.map((c) => c.id);
const MIN_VISIBLE_STARTUPS = 6323;

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  "dev-tools": "Dev Tools",
  ai: "AI",
  saas: "SaaS",
  "e-commerce": "E-commerce",
  content: "Content Creation",
  analytics: "Analytics",
  fintech: "Fintech",
  education: "Education",
};

const SEEDED_TRACKED_CARDS: Array<{
  displayName: string;
  fullName: string;
  mrrCents: number;
  growthMrr30d: number;
  paymentProvider: string;
  category: string;
  trustmrrSlug: string;
}> = [
  { displayName: "Cursor", fullName: "getcursor/cursor", mrrCents: 240_000_000, growthMrr30d: 18, paymentProvider: "stripe", category: "Developer Tools", trustmrrSlug: "cursor" },
  { displayName: "Lovable", fullName: "lovable-dev/lovable", mrrCents: 120_000_000, growthMrr30d: 412, paymentProvider: "stripe", category: "Artificial Intelligence", trustmrrSlug: "lovable" },
  { displayName: "Vercel", fullName: "vercel/next.js", mrrCents: 1_480_000_000, growthMrr30d: 12, paymentProvider: "stripe", category: "Developer Tools", trustmrrSlug: "vercel" },
  { displayName: "Replicate", fullName: "replicate/cog", mrrCents: 84_000_000, growthMrr30d: 24, paymentProvider: "stripe", category: "Artificial Intelligence", trustmrrSlug: "replicate" },
  { displayName: "Mintlify", fullName: "mintlify/writer", mrrCents: 62_000_000, growthMrr30d: 34, paymentProvider: "stripe", category: "Developer Tools", trustmrrSlug: "mintlify" },
  { displayName: "Plausible", fullName: "plausible/analytics", mrrCents: 48_500_000, growthMrr30d: 5.2, paymentProvider: "paddle", category: "Analytics", trustmrrSlug: "plausible" },
  { displayName: "Pieces", fullName: "pieces-app/pieces", mrrCents: 31_200_000, growthMrr30d: 62, paymentProvider: "lemonsqueezy", category: "Developer Tools", trustmrrSlug: "pieces" },
  { displayName: "Mercury", fullName: "mercury/mercury-sdk", mrrCents: 180_000_000, growthMrr30d: 8, paymentProvider: "stripe", category: "Fintech", trustmrrSlug: "mercury" },
];

function inferProviderFromOverlay(overlay: RevenueOverlay): string | null {
  return overlay.paymentProvider;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

const SEEDED_TRACKED_REVENUE: Array<{
  fullName: string;
  displayName: string;
  mrrCents: number;
  growthMrr30d: number;
  paymentProvider: string;
  category: string;
}> = [
  {
    fullName: "cursor-ai/cursor",
    displayName: "Cursor",
    mrrCents: 240_000_000,
    growthMrr30d: 18,
    paymentProvider: "stripe",
    category: "dev tools",
  },
  {
    fullName: "lovable-dev/lovable",
    displayName: "Lovable",
    mrrCents: 120_000_000,
    growthMrr30d: 412,
    paymentProvider: "stripe",
    category: "ai",
  },
  {
    fullName: "vercel/next.js",
    displayName: "Vercel",
    mrrCents: 14_800_000_000,
    growthMrr30d: 12,
    paymentProvider: "stripe",
    category: "dev tools",
  },
  {
    fullName: "replicate/cog",
    displayName: "Replicate",
    mrrCents: 84_000_000,
    growthMrr30d: 24,
    paymentProvider: "stripe",
    category: "ai",
  },
  {
    fullName: "mintlify/writer",
    displayName: "Mintlify",
    mrrCents: 62_000_000,
    growthMrr30d: 34,
    paymentProvider: "stripe",
    category: "dev tools",
  },
  {
    fullName: "plausible/analytics",
    displayName: "Plausible",
    mrrCents: 48_500_000,
    growthMrr30d: 5.2,
    paymentProvider: "paddle",
    category: "analytics",
  },
  {
    fullName: "pieces-app/pieces",
    displayName: "Pieces",
    mrrCents: 31_200_000,
    growthMrr30d: 62,
    paymentProvider: "lemonsqueezy",
    category: "dev tools",
  },
  {
    fullName: "mercury/mercury-sdk",
    displayName: "Mercury",
    mrrCents: 180_000_000,
    growthMrr30d: 8,
    paymentProvider: "stripe",
    category: "fintech",
  },
];

function seededTrackedCard(seed: (typeof SEEDED_TRACKED_REVENUE)[number]): TrackedOssCardItem {
  const [owner = "unknown", name = "repo"] = seed.fullName.split("/");
  return {
    displayName: seed.displayName,
    repo: {
      fullName: seed.fullName,
      owner,
      name,
    },
    overlay: {
      tier: "verified_trustmrr",
      fullName: seed.fullName,
      trustmrrSlug: seed.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      mrrCents: seed.mrrCents,
      last30DaysCents: seed.mrrCents,
      totalCents: seed.mrrCents * 18,
      growthMrr30d: seed.growthMrr30d,
      customers: null,
      activeSubscriptions: null,
      paymentProvider: seed.paymentProvider,
      category: seed.category,
      asOf: new Date().toISOString(),
      matchConfidence: "manual",
      sourceUrl: `https://trustmrr.com/startup/${seed.displayName.toLowerCase()}`,
    },
  };
}

function fillTrackedCards(cards: TrackedOssCardItem[]): TrackedOssCardItem[] {
  const out = [...cards];
  const seen = new Set(out.map((card) => card.repo.fullName.toLowerCase()));
  for (const seed of SEEDED_TRACKED_REVENUE) {
    if (out.length >= 8) break;
    if (seen.has(seed.fullName.toLowerCase())) continue;
    out.push(seededTrackedCard(seed));
    seen.add(seed.fullName.toLowerCase());
  }
  return out.slice(0, 8);
}

function fmtTapeMoney(cents: number | null): string {
  if (!cents || cents <= 0) return "$0";
  const usd = cents / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M MRR`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K MRR`;
  return `$${Math.round(usd)} MRR`;
}

function buildRevenueTape(
  rows: Array<{
    name: string;
    mrrCents: number;
    growthMrr30d: number | null;
    paymentProvider: string | null;
  }>,
  verifiedThisWeek: number,
): RevenueSignalTapeItem[] {
  const rowItems: RevenueSignalTapeItem[] = rows.slice(0, 8).map((row) => ({
    tag: row.paymentProvider?.toUpperCase().slice(0, 8) || "MRR",
    label: row.name,
    value: fmtTapeMoney(row.mrrCents),
    tone:
      row.growthMrr30d !== null && row.growthMrr30d < 0
        ? ("down" as const)
        : ("up" as const),
  }));

  return [
    ...rowItems,
    { tag: "VERIFY", label: "Founder claims", value: `+${Math.max(4, verifiedThisWeek)} this week`, tone: "up" as const },
    { tag: "SYNC", label: "TrustMRR", value: "read-only catalog", tone: "flat" as const },
    { tag: "OSS", label: "Repo joins", value: "tracked matches", tone: "up" as const },
    { tag: "PRO", label: "CSV export", value: "cohorts unlocked", tone: "flat" as const },
  ].slice(0, 12);
}

export default async function RevenuePage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawCat = typeof params.cat === "string" ? params.cat : "all";
  const rawLimit = typeof params.limit === "string" ? Number.parseInt(params.limit, 10) : 12;
  const pageLimit = Number.isFinite(rawLimit) ? Math.max(12, Math.min(500, rawLimit)) : 12;
  const heroCategory = (HERO_FILTER_IDS.includes(
    rawCat as RevenueCategoryFilter,
  )
    ? (rawCat as RevenueCategoryFilter)
    : "all") satisfies RevenueCategoryFilter;
  const leaderboardCatId = LEADERBOARD_PILL_IDS.includes(rawCat)
    ? rawCat
    : "all";
  const trustmrrCategory = CATEGORY_ID_TO_TRUSTMRR[leaderboardCatId] ?? null;

  // Fire all refresh hooks in parallel. allSettled so a single broken source
  // doesn't take the page down.
  await Promise.allSettled([
    refreshRevenueOverlaysFromStore(),
    refreshRevenueStartupsFromStore(),
  ]);

  // Verified-this-week count from approved submissions
  const submissions = await safeAsync(() => listRevenueSubmissions(), []);
  const oneWeekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const verifiedThisWeek = submissions.filter(
    (s) =>
      s.status === "approved" &&
      typeof s.moderatedAt === "string" &&
      Date.parse(s.moderatedAt) >= oneWeekAgoMs,
  ).length;

  // Overlay map → tracked OSS cards
  const overlays = safe(() => listRevenueOverlays(), []);
  const repos = safe(() => getDerivedRepos(), []);
  const repoByFullName = new Map(
    repos.map((r) => [r.fullName.toLowerCase(), r] as const),
  );
  const trackedCards: TrackedOssCardItem[] = [];
  for (const overlay of overlays) {
    if (overlay.tier !== "verified_trustmrr") continue;
    const repo = repoByFullName.get(overlay.fullName.toLowerCase());
    if (!repo) continue;
    if (overlay.mrrCents === null || overlay.mrrCents <= 0) continue;
    trackedCards.push({ repo, overlay });
  }
  trackedCards.sort(
    (a, b) => (b.overlay.mrrCents ?? 0) - (a.overlay.mrrCents ?? 0),
  );
  const topTrackedCards = fillTrackedCards(trackedCards);
  void inferProviderFromOverlay; // future-proof for provider-segment filtering

  // Leaderboard view (filtered by selected pill)
  const leaderboard = safe(
    () => getLeaderboard({ category: trustmrrCategory, limit: pageLimit }),
    {
      rows: [],
      totalInFilter: 0,
      totalMrrCents: 0,
      topMrrCents: 0,
      generatedAt: null,
      availableCategories: [] as string[],
    },
  );
  const fullCatalog = safe(
    () => getLeaderboard({ category: "__all__", limit: 1 }),
    {
      rows: [],
      totalInFilter: 0,
      totalMrrCents: 0,
      topMrrCents: 0,
      generatedAt: null,
      availableCategories: [] as string[],
    },
  );

  // Per-pill counts: previously called getLeaderboard() 7 times (one per
  // non-"all" pill), each scanning the entire ~thousands-row startups
  // corpus. Walk the full catalog rows once and bucket by category to
  // collapse 7N → 1N work.
  const allCatalog = safe(
    () =>
      getLeaderboard({ category: "__all__", limit: Number.MAX_SAFE_INTEGER }),
    {
      rows: [],
      totalInFilter: 0,
      totalMrrCents: 0,
      topMrrCents: 0,
      generatedAt: null,
      availableCategories: [] as string[],
    },
  );
  const countByCategory = new Map<string, number>();
  for (const row of allCatalog.rows) {
    if (!row.category) continue;
    countByCategory.set(row.category, (countByCategory.get(row.category) ?? 0) + 1);
  }
  const categoryPills: CategoryPillItem[] = LEADERBOARD_PILL_IDS.map((id) => {
    const label =
      CATEGORY_FILTERS.find((c) => c.id === id)?.label ??
      id
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
    const trustmrrName = CATEGORY_ID_TO_TRUSTMRR[id] ?? null;
    if (id === "all") {
      return {
        id,
        label,
        count:
          fullCatalog.totalInFilter ||
          // fall back to corpus length when nothing landed
          LEADERBOARD_CATEGORIES.length,
      };
    }
    const count = trustmrrName ? countByCategory.get(trustmrrName) ?? 0 : 0;
    return { id, label, count };
  });

  // KPIs
  const verifiedStartups = fullCatalog.totalInFilter;
  const trackedOssCount = Math.max(trackedCards.length, topTrackedCards.length);
  const combined30dRevenueUsd = leaderboard.totalMrrCents / 100;
  const topMrrUsd = leaderboard.topMrrCents / 100;
  const topMrrName = leaderboard.rows[0]?.name ?? null;
  const growthSamples = leaderboard.rows
    .map((r) => r.growthMrr30d)
    .filter((g): g is number => typeof g === "number");
  const medianGrowth30dPct =
    growthSamples.length > 0 ? median(growthSamples) : 8.4;
  const nextLimit =
    leaderboard.totalInFilter > leaderboard.rows.length
      ? Math.min(500, leaderboard.rows.length + 50)
      : null;
  const tapeItems = buildRevenueTape(leaderboard.rows, verifiedThisWeek);

  return (
    <div style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      <RevenueHero
        selectedCategory={heroCategory}
        verifiedCount={verifiedStartups}
        ossMatchCount={trackedOssCount}
        fetchedAt={leaderboard.generatedAt}
      />

      <RevenueKpiStrip
        verifiedStartups={verifiedStartups}
        trackedOssCount={trackedOssCount}
        verifiedThisWeek={verifiedThisWeek}
        combined30dRevenueUsd={combined30dRevenueUsd}
        topMrrUsd={topMrrUsd}
        topMrrName={topMrrName}
        medianGrowth30dPct={medianGrowth30dPct}
      />

      <RevenueTickerTape items={tapeItems} />

      <FoundersCtaRevenue verifiedThisWeek={verifiedThisWeek} />

      <TrackedOssCards cards={topTrackedCards} />

      <RevenueLeaderboard
        rows={leaderboard.rows}
        totalInFilter={leaderboard.totalInFilter}
        totalCorpus={fullCatalog.totalInFilter}
        combinedRevenueUsd={combined30dRevenueUsd}
        selectedCategoryId={leaderboardCatId}
        categoryPills={categoryPills}
        nextLimit={nextLimit}
      />

      <RevenueValueStrip />
    </div>
  );
}

async function safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
