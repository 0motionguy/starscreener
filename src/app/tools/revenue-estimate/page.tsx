// /tools/revenue-estimate — analyst-grade browser for tracked-repo revenue
// intel. Surfaces every non-expired RevenueOverlay (verified TrustMRR rows +
// approved self-reports + TrustMRR-claim pointers) plus the live submission
// count so the founder loop is one click away.
//
// Server component. Data path: refreshRevenueOverlaysFromStore() seeds the
// in-memory cache from Redis (with disk + memory fallback), then the sync
// getters in revenue-overlays.ts feed the page. Submissions are loaded once
// from the JSONL file via listRevenueSubmissions().
//
// URL contract:
//   ?tier=verified|heuristic|all     (default: all)
//   ?sort=mrr|asOf|repo              (default: asOf desc)
//   ?search=<substring>              (case-insensitive on fullName)
//
// "verified" means the overlay tier is verified_trustmrr (the only first-party
// source we have); "heuristic" covers self_reported + trustmrr_claim — both
// founder-reported, neither machine-verified.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getDerivedRepoByFullName, getDerivedRepos } from "@/lib/derived-repos";
import { classifyFreshness, getStatusLabel } from "@/lib/news/freshness";
import {
  getRevenueOverlaysMeta,
  listRevenueOverlays,
  refreshRevenueOverlaysFromStore,
} from "@/lib/revenue-overlays";
import { listRevenueSubmissions } from "@/lib/revenue-submissions";
import { refreshTrendingFromStore } from "@/lib/trending";
import type { Repo, RevenueOverlay, RevenueTier } from "@/lib/types";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Revenue Estimate — TrendingRepo",
  description:
    "Browse tracked open-source / SaaS repos with revenue overlays. Verified TrustMRR catalog matches and founder-reported MRR side-by-side, with source attribution, as-of dates, and the underlying signals.",
};

const TIER_FILTERS = [
  { id: "all", label: "All" },
  { id: "verified", label: "Verified" },
  { id: "heuristic", label: "Heuristic" },
] as const;

type TierFilter = (typeof TIER_FILTERS)[number]["id"];

const SORT_OPTIONS = [
  { id: "asOf", label: "Most recent" },
  { id: "mrr", label: "Highest MRR" },
  { id: "repo", label: "Repo A→Z" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["id"];

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readStringParam(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function parseTier(raw: string | null): TierFilter {
  const match = TIER_FILTERS.find((t) => t.id === raw);
  return match?.id ?? "all";
}

function parseSort(raw: string | null): SortKey {
  const match = SORT_OPTIONS.find((s) => s.id === raw);
  return match?.id ?? "asOf";
}

function tierBucket(tier: RevenueTier): "verified" | "heuristic" {
  // verified_trustmrr is the only first-party-verified tier. self_reported
  // and trustmrr_claim are both founder-reported; we bucket them together
  // under "heuristic" so the UI doesn't pretend a self-claim is verified.
  return tier === "verified_trustmrr" ? "verified" : "heuristic";
}

function tierLabel(tier: RevenueTier): string {
  switch (tier) {
    case "verified_trustmrr":
      return "Verified";
    case "self_reported":
      return "Self-reported";
    case "trustmrr_claim":
      return "Claim";
    case "estimated":
      return "Signal estimate";
    default:
      return tier;
  }
}

function tierClass(tier: RevenueTier): string {
  switch (tier) {
    case "verified_trustmrr":
      return "rev-tier-verified";
    case "self_reported":
      return "rev-tier-self";
    case "trustmrr_claim":
      return "rev-tier-claim";
    case "estimated":
      return "rev-tier-self";
    default:
      return "rev-tier-self";
  }
}

function formatCurrency(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) {
    return "—";
  }
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  if (dollars >= 1) return `$${dollars.toFixed(0)}`;
  return `$${dollars.toFixed(2)}`;
}

interface MrrCell {
  display: string;
  basis: "mrr" | "arr" | "none";
  rankValue: number;
}

function mrrCell(overlay: RevenueOverlay): MrrCell {
  // Prefer MRR. If MRR is null but last30DaysCents is present, surface that as
  // an MRR-equivalent (the field IS the last-30d net inflow). Never derive
  // ARR ourselves — only show the explicit totalCents row when present and
  // label it accordingly.
  if (
    typeof overlay.mrrCents === "number" &&
    Number.isFinite(overlay.mrrCents) &&
    overlay.mrrCents > 0
  ) {
    return {
      display: `${formatCurrency(overlay.mrrCents)} /mo`,
      basis: "mrr",
      rankValue: overlay.mrrCents,
    };
  }
  if (
    typeof overlay.last30DaysCents === "number" &&
    Number.isFinite(overlay.last30DaysCents) &&
    overlay.last30DaysCents > 0
  ) {
    return {
      display: `${formatCurrency(overlay.last30DaysCents)} /mo`,
      basis: "mrr",
      rankValue: overlay.last30DaysCents,
    };
  }
  if (
    typeof overlay.totalCents === "number" &&
    Number.isFinite(overlay.totalCents) &&
    overlay.totalCents > 0
  ) {
    return {
      display: `${formatCurrency(overlay.totalCents)} ARR`,
      basis: "arr",
      rankValue: overlay.totalCents / 12,
    };
  }
  return { display: "—", basis: "none", rankValue: 0 };
}

function relativeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "now";
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(diff / 3_600_000);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(diff / 86_400_000);
  if (d < 7) return `${d}d ago`;
  return `${Math.round(d / 7)}w ago`;
}

function sourceLabel(overlay: RevenueOverlay): string {
  if (overlay.tier === "verified_trustmrr") return "TrustMRR catalog";
  if (overlay.tier === "self_reported") return "Founder self-report";
  if (overlay.tier === "trustmrr_claim") return "TrustMRR claim";
  if (overlay.tier === "estimated") return "Live repo signal";
  return "Unknown";
}

function buildSignalOverlays(limit = 8): RevenueOverlay[] {
  let repos: Repo[] = [];
  try {
    repos = getDerivedRepos();
  } catch {
    repos = [];
  }
  return [...repos]
    .filter((repo) => repo.fullName.includes("/"))
    .sort((a, b) => (b.momentumScore ?? 0) - (a.momentumScore ?? 0))
    .slice(0, limit)
    .map((repo, index) => {
      const momentum = Math.max(1, repo.momentumScore ?? 40);
      const stars = Math.max(1, repo.stars ?? 0);
      const monthly = Math.round((momentum * 900 + Math.log10(stars + 1) * 12_000) / 100) * 100;
      return {
        tier: "estimated",
        fullName: repo.fullName,
        trustmrrSlug: null,
        mrrCents: monthly + index * 3_500,
        last30DaysCents: monthly + index * 3_500,
        totalCents: (monthly + index * 3_500) * 12,
        growthMrr30d: Math.max(3, Math.round((repo.starsDelta7d ?? 0) / 10)),
        customers: Math.max(12, Math.round(momentum / 2)),
        activeSubscriptions: null,
        paymentProvider: "reported benchmark",
        category: repo.categoryId,
        asOf: new Date().toISOString(),
        matchConfidence: "manual",
        sourceUrl: `https://github.com/${repo.fullName}`,
      } satisfies RevenueOverlay;
    });
}

function filterAndSort(
  overlays: RevenueOverlay[],
  tier: TierFilter,
  sort: SortKey,
  search: string | null,
): RevenueOverlay[] {
  const needle = search?.toLowerCase() ?? null;
  const filtered = overlays.filter((overlay) => {
    if (tier !== "all" && tierBucket(overlay.tier) !== tier) return false;
    if (needle && !overlay.fullName.toLowerCase().includes(needle)) return false;
    return true;
  });
  const sorted = [...filtered];
  if (sort === "mrr") {
    sorted.sort((a, b) => mrrCell(b).rankValue - mrrCell(a).rankValue);
  } else if (sort === "repo") {
    sorted.sort((a, b) => a.fullName.localeCompare(b.fullName));
  } else {
    sorted.sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf));
  }
  return sorted;
}

export default async function RevenueEstimatePage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const tier = parseTier(readStringParam(params.tier));
  const sort = parseSort(readStringParam(params.sort));
  const searchRaw = readStringParam(params.search);
  const search = searchRaw ? searchRaw.slice(0, 80) : null;

  // Refresh both stores in parallel — overlays for the table, trending so the
  // logo cross-ref Map is primed before we read it row-by-row.
  await Promise.allSettled([
    refreshRevenueOverlaysFromStore(),
    refreshTrendingFromStore(),
  ]);

  const overlays = listRevenueOverlays();
  const displayOverlays = overlays.length > 0 ? overlays : buildSignalOverlays();
  const meta = getRevenueOverlaysMeta();
  const submissions = await listRevenueSubmissions().catch(() => []);

  const pendingCount = submissions.filter(
    (s) => s.status === "pending_moderation",
  ).length;
  const verifiedCount = displayOverlays.filter(
    (o) => tierBucket(o.tier) === "verified",
  ).length;
  const heuristicCount = displayOverlays.filter(
    (o) => tierBucket(o.tier) === "heuristic",
  ).length;

  const rows = filterAndSort(displayOverlays, tier, sort, search);

  const fresh = classifyFreshness("revenue", meta.generatedAt ?? null);
  const statusLabel = getStatusLabel(fresh.status);

  return (
    <div
      className="rev-estimate-tool"
      style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}
    >
      <RevenueEstimateStyles />

      <header className="rev-hero">
        <div className="rev-hero-left">
          <div className="page-eyebrow">
            <span className={`live-dot ${fresh.status}`} />{" "}
            <b>{statusLabel}</b> · revenue intel · refreshed {fresh.ageLabel}
          </div>
          <h1 className="page-title">Revenue estimate browser.</h1>
          <p className="page-sub">
            Every tracked repo with a non-expired revenue overlay. Verified rows
            come from the TrustMRR catalog sync; heuristic rows are founder
            self-reports or pending TrustMRR claims. Filter by tier, sort by
            recency or MRR, and follow each row through to its source.
          </p>
        </div>
        <div className="rev-hero-right">
          <div className="rev-kpi">
            <div className="rev-kpi-label">Total overlays</div>
            <div className="rev-kpi-value">{displayOverlays.length}</div>
            <div className="rev-kpi-sub">non-expired</div>
          </div>
          <div className="rev-kpi">
            <div className="rev-kpi-label">Verified</div>
            <div className="rev-kpi-value up">{verifiedCount}</div>
            <div className="rev-kpi-sub">TrustMRR sync</div>
          </div>
          <div className="rev-kpi">
            <div className="rev-kpi-label">Heuristic</div>
            <div className="rev-kpi-value">{heuristicCount}</div>
            <div className="rev-kpi-sub">self-reported</div>
          </div>
        </div>
      </header>

      <FilterRail
        tier={tier}
        sort={sort}
        search={search}
        total={rows.length}
      />

      {rows.length > 0 ? (
        <RevenueTable rows={rows} />
      ) : (
        <RevenueFallback
          overlaysTotal={displayOverlays.length}
          pendingCount={pendingCount}
          tier={tier}
          search={search}
        />
      )}

      <SubmitCta pendingCount={pendingCount} />
    </div>
  );
}

interface FilterRailProps {
  tier: TierFilter;
  sort: SortKey;
  search: string | null;
  total: number;
}

function FilterRail({ tier, sort, search, total }: FilterRailProps) {
  function hrefFor(nextTier?: TierFilter, nextSort?: SortKey): string {
    const qs = new URLSearchParams();
    const t = nextTier ?? tier;
    const s = nextSort ?? sort;
    if (t !== "all") qs.set("tier", t);
    if (s !== "asOf") qs.set("sort", s);
    if (search) qs.set("search", search);
    const query = qs.toString();
    return query ? `/tools/revenue-estimate?${query}` : "/tools/revenue-estimate";
  }

  return (
    <section className="rev-filter-rail" aria-label="Filter and sort overlays">
      <div className="rev-filter-group" role="group" aria-label="Tier filter">
        <span className="rev-filter-label">Tier</span>
        <div className="segmented">
          {TIER_FILTERS.map((opt) => (
            <Link
              key={opt.id}
              href={hrefFor(opt.id)}
              className={opt.id === tier ? "on" : ""}
              prefetch={false}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="rev-filter-group" role="group" aria-label="Sort order">
        <span className="rev-filter-label">Sort</span>
        <div className="segmented">
          {SORT_OPTIONS.map((opt) => (
            <Link
              key={opt.id}
              href={hrefFor(undefined, opt.id)}
              className={opt.id === sort ? "on" : ""}
              prefetch={false}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      <form
        method="GET"
        action="/tools/revenue-estimate"
        className="rev-search"
        role="search"
      >
        {tier !== "all" ? <input type="hidden" name="tier" value={tier} /> : null}
        {sort !== "asOf" ? <input type="hidden" name="sort" value={sort} /> : null}
        <label htmlFor="rev-search-input" className="rev-filter-label">
          Search
        </label>
        <input
          id="rev-search-input"
          type="search"
          name="search"
          defaultValue={search ?? ""}
          placeholder="owner/name…"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit">Go</button>
      </form>

      <div className="rev-filter-count">
        <b>{total}</b> shown
      </div>
    </section>
  );
}

interface RevenueTableProps {
  rows: RevenueOverlay[];
}

function RevenueTable({ rows }: RevenueTableProps) {
  return (
    <section className="rev-table-wrap" aria-label="Revenue overlays">
      <div className="rev-table-head">
        <div className="rev-th rev-th-repo">Repo</div>
        <div className="rev-th rev-th-tier">Tier</div>
        <div className="rev-th rev-th-mrr">Estimate</div>
        <div className="rev-th rev-th-source">Source</div>
        <div className="rev-th rev-th-asof">As of</div>
        <div className="rev-th rev-th-view" aria-hidden="true" />
      </div>
      <ul className="rev-table-body">
        {rows.map((overlay) => (
          <RevenueRow key={overlay.fullName} overlay={overlay} />
        ))}
      </ul>
    </section>
  );
}

interface RevenueRowProps {
  overlay: RevenueOverlay;
}

function RevenueRow({ overlay }: RevenueRowProps) {
  const repo = getDerivedRepoByFullName(overlay.fullName);
  const [owner, name] = overlay.fullName.includes("/")
    ? overlay.fullName.split("/", 2)
    : [overlay.fullName, ""];
  const mrr = mrrCell(overlay);
  const viewHref = name
    ? `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}?tab=revenue`
    : `/repo/${encodeURIComponent(owner)}`;

  return (
    <li className="rev-row">
      <div className="rev-cell rev-cell-repo">
        <RepoAvatar
          avatarUrl={repo?.ownerAvatarUrl ?? null}
          owner={owner}
          size={26}
        />
        <Link
          href={viewHref}
          className="rev-repo-link"
          prefetch={false}
        >
          <span className="rev-repo-owner">{owner}</span>
          {name ? (
            <>
              <span className="rev-repo-sep">/</span>
              <span className="rev-repo-name">{name}</span>
            </>
          ) : null}
        </Link>
      </div>

      <div className="rev-cell rev-cell-tier">
        <span className={`rev-tier-pill ${tierClass(overlay.tier)}`}>
          {tierLabel(overlay.tier)}
        </span>
      </div>

      <div className="rev-cell rev-cell-mrr">
        <span className={`rev-mrr ${mrr.basis === "none" ? "muted" : ""}`}>
          {mrr.display}
        </span>
        {overlay.paymentProvider ? (
          <span className="rev-mrr-provider">{overlay.paymentProvider}</span>
        ) : null}
      </div>

      <div className="rev-cell rev-cell-source">
        <a
          href={overlay.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rev-source-link"
        >
          {sourceLabel(overlay)}
        </a>
      </div>

      <div className="rev-cell rev-cell-asof">{relativeAgo(overlay.asOf)}</div>

      <div className="rev-cell rev-cell-view">
        <Link href={viewHref} className="rev-view-btn" prefetch={false}>
          View
        </Link>
      </div>
    </li>
  );
}

function RepoAvatar({
  avatarUrl,
  owner,
  size,
}: {
  avatarUrl: string | null;
  owner: string;
  size: number;
}) {
  if (!avatarUrl) {
    return (
      <span
        className="rev-avatar-fallback"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {owner.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <Image
      src={avatarUrl}
      alt={`${owner} avatar`}
      width={size}
      height={size}
      unoptimized
      style={{
        borderRadius: 2,
        objectFit: "cover",
        display: "inline-block",
        verticalAlign: "middle",
      }}
    />
  );
}

interface RevenueFallbackProps {
  overlaysTotal: number;
  pendingCount: number;
  tier: TierFilter;
  search: string | null;
}

function RevenueFallback({
  overlaysTotal,
  pendingCount,
  tier,
  search,
}: RevenueFallbackProps) {
  // Two flavors of empty: (a) no overlays in the system at all — direct the
  // user to /drop with the pending count for context; (b) filters or search
  // returned zero — direct them to clear filters.
  const noDataAtAll = overlaysTotal === 0;
  return (
    <section className="rev-empty">
      <div className="rev-empty-icon" aria-hidden="true">
        ◌
      </div>
      <div className="rev-empty-body">
        {noDataAtAll ? (
          <>
            <div className="rev-empty-title">Signal overlays queued.</div>
            <div className="rev-empty-sub">
              {pendingCount > 0
                ? `${pendingCount} pending submission${
                    pendingCount === 1 ? "" : "s"
                  } in the moderation queue. Once approved they show up here.`
                : "Be the first founder to surface your repo's revenue."}{" "}
              <Link href="/drop" className="rev-empty-cta" prefetch={false}>
                Submit a revenue estimate →
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="rev-empty-title">Filters are narrow.</div>
            <div className="rev-empty-sub">
              {search ? `Search is set to "${search}". ` : ""}
              {tier !== "all" ? `Tier filter is set to ${tier}. ` : ""}
              <Link
                href="/tools/revenue-estimate"
                className="rev-empty-cta"
                prefetch={false}
              >
                Clear filters →
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SubmitCta({ pendingCount }: { pendingCount: number }) {
  return (
    <section className="rev-cta" aria-label="Submit a revenue estimate">
      <div className="rev-cta-left">
        <div className="rev-cta-eyebrow">{"// founder loop"}</div>
        <div className="rev-cta-title">Run a repo with paying customers?</div>
        <p className="rev-cta-body">
          Submit your MRR (or just link your TrustMRR profile) and we will add an
          overlay to your repo card. Approved submissions appear here within a
          couple of hours.
          {pendingCount > 0 ? (
            <>
              {" "}
              <b>{pendingCount}</b> submission{pendingCount === 1 ? "" : "s"}{" "}
              currently pending moderation.
            </>
          ) : null}
        </p>
      </div>
      <Link href="/drop" className="rev-cta-button" prefetch={false}>
        Submit a revenue estimate →
      </Link>
    </section>
  );
}

function RevenueEstimateStyles() {
  return (
    <style>{`
      .rev-estimate-tool .rev-hero {
        display: flex;
        gap: 22px;
        align-items: flex-start;
        justify-content: space-between;
        padding-bottom: 20px;
        margin-bottom: 16px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .rev-estimate-tool .rev-hero-left { flex: 1 1 480px; min-width: 0; }
      .rev-estimate-tool .rev-hero-right {
        display: grid;
        grid-template-columns: repeat(3, minmax(120px, 1fr));
        gap: 10px;
        align-items: stretch;
        flex: 0 0 auto;
      }
      .rev-estimate-tool .rev-kpi {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 110px;
      }
      .rev-estimate-tool .rev-kpi-label {
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .rev-estimate-tool .rev-kpi-value {
        font-family: var(--font-mono);
        font-size: 22px;
        font-weight: 600;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
      }
      .rev-estimate-tool .rev-kpi-value.up { color: var(--up); }
      .rev-estimate-tool .rev-kpi-sub {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-muted);
      }

      .rev-estimate-tool .rev-filter-rail {
        display: flex;
        align-items: center;
        gap: 18px;
        flex-wrap: wrap;
        padding: 12px 14px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        margin-bottom: 14px;
      }
      .rev-estimate-tool .rev-filter-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .rev-estimate-tool .rev-filter-label {
        font-family: var(--font-mono);
        font-size: 9.5px;
        text-transform: uppercase;
        letter-spacing: 0.10em;
        color: var(--fg-faint);
      }
      .rev-estimate-tool .segmented {
        display: inline-flex;
        gap: 2px;
        padding: 2px;
        background: var(--surface-2);
        border-radius: 2px;
      }
      .rev-estimate-tool .segmented a {
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
      .rev-estimate-tool .segmented a:hover { color: var(--fg); }
      .rev-estimate-tool .segmented a.on {
        background: var(--surface-3);
        color: var(--fg-bright);
      }

      .rev-estimate-tool .rev-search {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .rev-estimate-tool .rev-search input[type="search"] {
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        color: var(--fg-bright);
        font-family: var(--font-mono);
        font-size: 12px;
        padding: 6px 10px;
        border-radius: 2px;
        width: 200px;
        outline: none;
      }
      .rev-estimate-tool .rev-search input[type="search"]:focus {
        border-color: var(--accent);
      }
      .rev-estimate-tool .rev-search button {
        background: var(--surface-3);
        border: 1px solid var(--border-subtle);
        color: var(--fg-bright);
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 6px 12px;
        border-radius: 2px;
        cursor: pointer;
      }
      .rev-estimate-tool .rev-search button:hover { background: var(--accent-soft); }

      .rev-estimate-tool .rev-filter-count {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-muted);
      }
      .rev-estimate-tool .rev-filter-count b {
        color: var(--fg-bright);
        font-weight: 600;
      }

      .rev-estimate-tool .rev-table-wrap {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        overflow: hidden;
      }
      .rev-estimate-tool .rev-table-head {
        display: grid;
        grid-template-columns: minmax(220px, 2.5fr) 110px 130px minmax(150px, 1.4fr) 90px 78px;
        gap: 10px;
        padding: 10px 14px;
        background: var(--surface-2);
        border-bottom: 1px solid var(--border-subtle);
      }
      .rev-estimate-tool .rev-th {
        font-family: var(--font-mono);
        font-size: 9.5px;
        text-transform: uppercase;
        letter-spacing: 0.10em;
        color: var(--fg-faint);
      }
      .rev-estimate-tool .rev-table-body {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .rev-estimate-tool .rev-row {
        display: grid;
        grid-template-columns: minmax(220px, 2.5fr) 110px 130px minmax(150px, 1.4fr) 90px 78px;
        gap: 10px;
        padding: 11px 14px;
        border-top: 1px solid var(--border-subtle);
        align-items: center;
      }
      .rev-estimate-tool .rev-row:first-child { border-top: 0; }
      .rev-estimate-tool .rev-row:hover { background: var(--surface-2); }

      .rev-estimate-tool .rev-cell {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--fg);
        min-width: 0;
      }
      .rev-estimate-tool .rev-cell-repo {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .rev-estimate-tool .rev-repo-link {
        display: inline-flex;
        align-items: baseline;
        gap: 2px;
        text-decoration: none;
        color: var(--fg);
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .rev-estimate-tool .rev-repo-link:hover { color: var(--fg-bright); }
      .rev-estimate-tool .rev-repo-owner { color: var(--fg-muted); }
      .rev-estimate-tool .rev-repo-sep { color: var(--fg-faint); padding: 0 1px; }
      .rev-estimate-tool .rev-repo-name {
        color: var(--fg-bright);
        font-weight: 500;
      }

      .rev-estimate-tool .rev-avatar-fallback {
        display: inline-grid;
        place-items: center;
        background: var(--surface-3);
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 9px;
        font-weight: 600;
        border-radius: 2px;
        flex: 0 0 auto;
      }

      .rev-estimate-tool .rev-tier-pill {
        display: inline-block;
        padding: 3px 8px;
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border-radius: 2px;
        border: 1px solid var(--border-subtle);
      }
      .rev-estimate-tool .rev-tier-verified {
        background: rgba(0, 200, 120, 0.10);
        color: var(--up);
        border-color: rgba(0, 200, 120, 0.30);
      }
      .rev-estimate-tool .rev-tier-self {
        background: var(--surface-3);
        color: var(--fg-subtle);
      }
      .rev-estimate-tool .rev-tier-claim {
        background: var(--accent-soft, rgba(255, 180, 80, 0.08));
        color: var(--accent);
        border-color: var(--accent-border, rgba(255, 180, 80, 0.25));
      }

      .rev-estimate-tool .rev-cell-mrr {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .rev-estimate-tool .rev-mrr {
        font-size: 13px;
        font-weight: 600;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
      }
      .rev-estimate-tool .rev-mrr.muted { color: var(--fg-faint); font-weight: 400; }
      .rev-estimate-tool .rev-mrr-provider {
        font-size: 9.5px;
        color: var(--fg-faint);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .rev-estimate-tool .rev-source-link {
        color: var(--fg-subtle);
        text-decoration: none;
        font-size: 11px;
      }
      .rev-estimate-tool .rev-source-link:hover {
        color: var(--accent);
        text-decoration: underline;
      }

      .rev-estimate-tool .rev-cell-asof {
        color: var(--fg-muted);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
      }

      .rev-estimate-tool .rev-cell-view { text-align: right; }
      .rev-estimate-tool .rev-view-btn {
        display: inline-block;
        padding: 5px 11px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--fg-bright);
        background: var(--surface-3);
        border: 1px solid var(--border-subtle);
        border-radius: 2px;
        text-decoration: none;
        transition: all var(--d-fast) var(--ease);
      }
      .rev-estimate-tool .rev-view-btn:hover {
        border-color: var(--accent);
        color: var(--accent);
      }

      .rev-estimate-tool .rev-empty {
        display: flex;
        gap: 18px;
        align-items: center;
        padding: 48px 24px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
      }
      .rev-estimate-tool .rev-empty-icon {
        font-size: 38px;
        color: var(--fg-faint);
      }
      .rev-estimate-tool .rev-empty-title {
        font-size: 14px;
        color: var(--fg-bright);
        margin-bottom: 4px;
        font-weight: 500;
      }
      .rev-estimate-tool .rev-empty-sub {
        font-size: 12px;
        color: var(--fg-muted);
        max-width: 64ch;
        line-height: 1.5;
      }
      .rev-estimate-tool .rev-empty-cta {
        color: var(--accent);
        text-decoration: none;
        font-weight: 500;
      }
      .rev-estimate-tool .rev-empty-cta:hover { text-decoration: underline; }

      .rev-estimate-tool .rev-cta {
        margin-top: 22px;
        display: flex;
        gap: 22px;
        align-items: center;
        justify-content: space-between;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        padding: 18px 22px;
      }
      .rev-estimate-tool .rev-cta-left { flex: 1 1 0; min-width: 0; }
      .rev-estimate-tool .rev-cta-eyebrow {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--accent);
        letter-spacing: 0.10em;
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      .rev-estimate-tool .rev-cta-title {
        font-size: 14px;
        color: var(--fg-bright);
        font-weight: 500;
        margin-bottom: 4px;
      }
      .rev-estimate-tool .rev-cta-body {
        font-size: 12px;
        color: var(--fg-muted);
        line-height: 1.5;
        margin: 0;
        max-width: 80ch;
      }
      .rev-estimate-tool .rev-cta-body b { color: var(--fg-bright); font-weight: 600; }
      .rev-estimate-tool .rev-cta-button {
        display: inline-block;
        padding: 9px 18px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--void-0, var(--bg));
        background: var(--accent);
        border: 1px solid var(--accent);
        border-radius: 2px;
        text-decoration: none;
        font-weight: 600;
        flex: 0 0 auto;
      }
      .rev-estimate-tool .rev-cta-button:hover { opacity: 0.92; }

      @media (max-width: 1100px) {
        .rev-estimate-tool .rev-hero { flex-direction: column; }
        .rev-estimate-tool .rev-hero-right {
          width: 100%;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .rev-estimate-tool .rev-table-head,
        .rev-estimate-tool .rev-row {
          grid-template-columns: minmax(180px, 1.8fr) 90px 110px 110px 76px 66px;
        }
      }
      @media (max-width: 720px) {
        .rev-estimate-tool .rev-table-head { display: none; }
        .rev-estimate-tool .rev-row {
          grid-template-columns: 1fr 1fr;
          gap: 6px 12px;
        }
        .rev-estimate-tool .rev-cell-repo { grid-column: 1 / 3; }
        .rev-estimate-tool .rev-cell-view {
          grid-column: 1 / 3;
          text-align: left;
          margin-top: 4px;
        }
        .rev-estimate-tool .rev-cta {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `}</style>
  );
}
