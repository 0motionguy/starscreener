// /tools/revenue-estimate — interactive ARR estimator + overlay browser.
//
// Wave-2 rebuild (per UX brief): the page is two surfaces stacked.
//
//   1. ESTIMATOR (above the fold) — left input panel (repo selector +
//      stage segmented + pricing-model segmented + team-size number),
//      right output panel (KPI estimate with confidence band + tier chip +
//      3-row comp set with mini sparks + source-provenance list).
//      Inputs live in the URL (?repo=, ?stage=, ?model=, ?team=) so the
//      whole thing is shareable. No client JS required — it's a form GET.
//
//   2. OVERLAY BROWSER (below the fold) — the existing `overlays` table:
//      filter by tier (?tier=verified|heuristic|all), sort (?sort=...),
//      search (?search=...). Same row shape as before, kept as the
//      provenance pane for the estimate above.
//
// Heuristic: when no verified overlay exists, we synthesize one from the
// repo's live momentum + stars (same formula used by buildSignalOverlays
// pre-rewrite). Comp set picks 3 verified rows from adjacent ARR bands.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { FreshnessPill } from "@/components/shell/FreshnessPill";
import { Icon, SourceLogo } from "@/lib/icons";
import { ShareCTAButton } from "@/components/tools/hub/ShareCTAButton";
import {
  getDerivedRepoByFullName,
  getDerivedRepos,
} from "@/lib/derived-repos";
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
    "Estimate annual revenue for an open-source / SaaS repo. Stage, pricing model, and team-size inputs feed a momentum-weighted ARR band. Verified TrustMRR comps surface alongside the estimate.",
  alternates: { canonical: "/tools/revenue-estimate" },
  openGraph: {
    images: [
      { url: "/api/og/tools/revenue-estimate", width: 1200, height: 630 },
    ],
  },
};

// ─── URL state ────────────────────────────────────────────────────────────

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

const STAGES = [
  { id: "early", label: "Early", multiplier: 0.55 },
  { id: "growth", label: "Growth", multiplier: 1.0 },
  { id: "mature", label: "Mature", multiplier: 1.65 },
] as const;
type StageId = (typeof STAGES)[number]["id"];

const MODELS = [
  { id: "subscription", label: "Subscription", multiplier: 1.0 },
  { id: "usage", label: "Usage", multiplier: 0.78 },
  { id: "one-time", label: "One-time", multiplier: 0.42 },
] as const;
type ModelId = (typeof MODELS)[number]["id"];

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readStringParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function readNumberParam(value: string | string[] | undefined, def: number): number {
  const raw = readStringParam(value);
  if (raw === null) return def;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(10_000, Math.round(n)) : def;
}

function parseTier(raw: string | null): TierFilter {
  return (TIER_FILTERS.find((t) => t.id === raw)?.id ?? "all") as TierFilter;
}
function parseSort(raw: string | null): SortKey {
  return (SORT_OPTIONS.find((s) => s.id === raw)?.id ?? "asOf") as SortKey;
}
function parseStage(raw: string | null): StageId {
  return (STAGES.find((s) => s.id === raw)?.id ?? "growth") as StageId;
}
function parseModel(raw: string | null): ModelId {
  return (MODELS.find((m) => m.id === raw)?.id ?? "subscription") as ModelId;
}

// ─── Tier helpers (reused from previous impl) ─────────────────────────────

function tierBucket(tier: RevenueTier): "verified" | "heuristic" {
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

function tierChipClass(tier: RevenueTier): string {
  switch (tier) {
    case "verified_trustmrr":
      return "chip up";
    case "self_reported":
      return "chip";
    case "trustmrr_claim":
      return "chip accent";
    case "estimated":
    default:
      return "chip info";
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

// ─── Estimator ────────────────────────────────────────────────────────────

interface EstimateResult {
  lowAnnualCents: number;
  midAnnualCents: number;
  highAnnualCents: number;
  confidence: "high" | "medium" | "low";
  basis: "verified" | "heuristic";
  rationale: string;
  sources: { label: string; href: string | null }[];
}

/**
 * Build an ARR band from inputs + (optional) live overlay.
 * - When the repo has a verified overlay we use its MRR/ARR as the mid
 *   and produce a tight ±15% band — confidence: high.
 * - Without an overlay we synthesize from momentum + stars + team size
 *   modulated by stage and model multipliers — confidence: low.
 */
function estimate(
  repo: Repo | null,
  overlay: RevenueOverlay | null,
  stage: StageId,
  model: ModelId,
  teamSize: number,
): EstimateResult {
  const stageMult = STAGES.find((s) => s.id === stage)?.multiplier ?? 1;
  const modelMult = MODELS.find((m) => m.id === model)?.multiplier ?? 1;

  if (overlay && tierBucket(overlay.tier) === "verified") {
    const cell = mrrCell(overlay);
    const annual =
      cell.basis === "arr" ? cell.rankValue * 12 : cell.rankValue * 12;
    return {
      lowAnnualCents: Math.round(annual * 0.85),
      midAnnualCents: Math.round(annual),
      highAnnualCents: Math.round(annual * 1.15),
      confidence: "high",
      basis: "verified",
      rationale: `Verified by ${sourceLabel(overlay)} (${relativeAgo(overlay.asOf)}). Band ±15% accounts for lag between TrustMRR snapshot and current reality.`,
      sources: [
        { label: sourceLabel(overlay), href: overlay.sourceUrl },
        repo ? { label: `GitHub: ${repo.fullName}`, href: `https://github.com/${repo.fullName}` } : null,
      ].filter(Boolean) as { label: string; href: string | null }[],
    };
  }

  // Heuristic — same shape as the previous buildSignalOverlays helper but
  // modulated by inputs.
  const momentum = Math.max(1, repo?.momentumScore ?? 35);
  const stars = Math.max(1, repo?.stars ?? 0);
  const base = (momentum * 1100 + Math.log10(stars + 1) * 18_000) / 100;
  const teamBoost = Math.min(2.4, Math.max(0.5, Math.sqrt(teamSize) / 2));
  const monthlyDollars = base * stageMult * modelMult * teamBoost;
  const annualCents = Math.round(monthlyDollars * 12 * 100);
  // Wide low/high — heuristic is a guess. ±60% band.
  return {
    lowAnnualCents: Math.round(annualCents * 0.40),
    midAnnualCents: annualCents,
    highAnnualCents: Math.round(annualCents * 1.80),
    confidence: "low",
    basis: "heuristic",
    rationale: `Heuristic estimate: momentum ${momentum.toFixed(1)} × log10(stars) × stage(${stage}) × model(${model}) × team(√${teamSize}). Replace by submitting a verified TrustMRR or self-report.`,
    sources: [
      repo ? { label: `GitHub: ${repo.fullName}`, href: `https://github.com/${repo.fullName}` } : null,
      { label: "Heuristic model · src/app/tools/revenue-estimate/page.tsx", href: null },
    ].filter(Boolean) as { label: string; href: string | null }[],
  };
}

/** Format an annual band into a human "$80K–$240K ARR" string. */
function formatBand(low: number, high: number): string {
  return `${formatCurrency(low)}–${formatCurrency(high)} ARR`;
}

// ─── Filter / sort ─────────────────────────────────────────────────────────

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

/** Pick 3 verified overlays nearest to the estimated mid-band ARR. */
function pickCompSet(
  overlays: RevenueOverlay[],
  midAnnualCents: number,
  excludeFullName: string | null,
): RevenueOverlay[] {
  const verified = overlays
    .filter((o) => tierBucket(o.tier) === "verified")
    .filter((o) => !excludeFullName || o.fullName.toLowerCase() !== excludeFullName.toLowerCase());
  const scored = verified.map((o) => {
    const cell = mrrCell(o);
    const annual =
      cell.basis === "arr" ? cell.rankValue * 12 : cell.rankValue * 12;
    return { overlay: o, distance: Math.abs(annual - midAnnualCents) };
  });
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, 3).map((s) => s.overlay);
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default async function RevenueEstimatePage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};

  // Estimator state
  const repoParam = readStringParam(params.repo);
  const stage = parseStage(readStringParam(params.stage));
  const model = parseModel(readStringParam(params.model));
  const teamSize = readNumberParam(params.team, 8);

  // Browser state
  const tier = parseTier(readStringParam(params.tier));
  const sort = parseSort(readStringParam(params.sort));
  const searchRaw = readStringParam(params.search);
  const search = searchRaw ? searchRaw.slice(0, 80) : null;

  await Promise.allSettled([
    refreshRevenueOverlaysFromStore(),
    refreshTrendingFromStore(),
  ]);

  const overlays = listRevenueOverlays();
  const meta = getRevenueOverlaysMeta();
  const submissions = await listRevenueSubmissions().catch(() => []);

  // Resolve the selected repo for the estimator.
  const selectedRepo = repoParam ? getDerivedRepoByFullName(repoParam) : null;
  // Resolve an overlay for that repo (if it exists).
  const selectedOverlay =
    selectedRepo
      ? overlays.find(
          (o) => o.fullName.toLowerCase() === selectedRepo.fullName.toLowerCase(),
        ) ?? null
      : null;

  const result = estimate(selectedRepo, selectedOverlay, stage, model, teamSize);
  const compSet = pickCompSet(
    overlays,
    result.midAnnualCents,
    selectedRepo?.fullName ?? null,
  );

  // Repo autocomplete options — top 16 trending repos for the datalist.
  const repoOptions: string[] = [...getDerivedRepos()]
    .filter((r) => r.fullName.includes("/"))
    .sort((a, b) => (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0))
    .slice(0, 16)
    .map((r) => r.fullName);

  const pendingCount = submissions.filter(
    (s) => s.status === "pending_moderation",
  ).length;
  const verifiedCount = overlays.filter(
    (o) => tierBucket(o.tier) === "verified",
  ).length;

  const rows = filterAndSort(overlays, tier, sort, search);

  return (
    <div className="rev-page">
      <RevenuePageStyles />

      {/* ─── Hero ─── */}
      <header className="rev-hero hero">
        <div className="rev-hero-row">
          <div className="rev-hero-left">
            <div className="hero-eyebrow">
              <span className="eb-num">{"// REVENUE"}</span>
              <span className="eb-sep">·</span>
              <span className="eb-tag">ESTIMATOR + COMP SET</span>
              <span className="eb-sep">·</span>
              <FreshnessPill source="repos" fetchedAt={meta.generatedAt ?? null} />
            </div>
            <h1 className="page-title">
              Revenue estimate<span className="hero-dot">.</span>
            </h1>
            <p className="page-sub">
              Pick a repo and tune the inputs. We pull a verified TrustMRR
              row if one exists, fall through to a momentum-weighted
              heuristic otherwise, and show a confidence band, comp set,
              and source provenance for every estimate.
            </p>
            <div className="rev-hero-chips">
              <ShareCTAButton
                size="sm"
                shareText={
                  selectedRepo
                    ? `Estimated ARR for ${selectedRepo.fullName}: ${formatBand(result.lowAnnualCents, result.highAnnualCents)}`
                    : "Estimate ARR for any open-source repo on TrendingRepo."
                }
                hashtags={["opensource", "saas"]}
              />
              <Link href="/drop" className="chip accent" prefetch={false}>
                <Icon name="plus" size="sm" /> Submit revenue
              </Link>
            </div>
          </div>
          <aside className="rev-hero-kpis" aria-label="Catalog statistics">
            <div className="kpi">
              <div className="kpi-label">Overlays</div>
              <div className="kpi-value">{overlays.length}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Verified</div>
              <div className="kpi-value up">{verifiedCount}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Pending</div>
              <div className="kpi-value">{pendingCount}</div>
            </div>
          </aside>
        </div>
      </header>

      {/* ─── Estimator (inputs | output) ─── */}
      <section className="rev-estimator" aria-label="Revenue estimator">
        <form
          method="GET"
          action="/tools/revenue-estimate"
          className="rev-inputs card"
          aria-label="Estimator inputs"
        >
          {/* Preserve browser-pane state via hidden inputs */}
          {tier !== "all" ? <input type="hidden" name="tier" value={tier} /> : null}
          {sort !== "asOf" ? <input type="hidden" name="sort" value={sort} /> : null}
          {search ? <input type="hidden" name="search" value={search} /> : null}

          <div className="rev-inputs-head">
            <span className="eyebrow-num">{"// 01"}</span>
            <span className="eyebrow-title">Inputs</span>
          </div>

          <div className="rev-field">
            <label htmlFor="rev-repo" className="rev-field-label">Repo</label>
            <input
              id="rev-repo"
              type="search"
              name="repo"
              list="rev-repo-options"
              defaultValue={selectedRepo?.fullName ?? repoParam ?? ""}
              placeholder="owner/name (e.g. vercel/next.js)"
              autoComplete="off"
              spellCheck={false}
              className="rev-field-input"
            />
            <datalist id="rev-repo-options">
              {repoOptions.map((fullName) => (
                <option key={fullName} value={fullName} />
              ))}
            </datalist>
          </div>

          <div className="rev-field">
            <span className="rev-field-label">Stage</span>
            <div className="segmented rev-seg" role="group" aria-label="Stage">
              {STAGES.map((s) => (
                <label key={s.id} className={s.id === stage ? "on" : ""}>
                  <input
                    type="radio"
                    name="stage"
                    value={s.id}
                    defaultChecked={s.id === stage}
                    className="rev-seg-input"
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          <div className="rev-field">
            <span className="rev-field-label">Pricing model</span>
            <div className="segmented rev-seg" role="group" aria-label="Pricing model">
              {MODELS.map((m) => (
                <label key={m.id} className={m.id === model ? "on" : ""}>
                  <input
                    type="radio"
                    name="model"
                    value={m.id}
                    defaultChecked={m.id === model}
                    className="rev-seg-input"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          <div className="rev-field">
            <label htmlFor="rev-team" className="rev-field-label">Team size</label>
            <input
              id="rev-team"
              type="number"
              name="team"
              min={1}
              max={5000}
              defaultValue={teamSize}
              className="rev-field-input rev-field-input--narrow"
            />
            <span className="rev-field-hint">heuristic only · ignored when verified</span>
          </div>

          <button type="submit" className="btn primary rev-submit">
            <Icon name="trending-dollar" size="sm" /> Recompute estimate
          </button>
        </form>

        <div className="rev-output card">
          <div className="rev-output-head">
            <span className="eyebrow-num">{"// 02"}</span>
            <span className="eyebrow-title">
              Estimate {selectedRepo ? `· ${selectedRepo.fullName}` : "· pick a repo"}
            </span>
            <span className={`chip ${result.confidence === "high" ? "up" : result.confidence === "medium" ? "info" : "warn"}`}>
              {result.confidence} confidence
            </span>
            <span className={tierChipClass(result.basis === "verified" ? "verified_trustmrr" : "estimated")}>
              {result.basis === "verified" ? "Verified source" : "Heuristic model"}
            </span>
          </div>
          <div className="rev-kpi-row">
            <div className="rev-kpi">
              <div className="rev-kpi-label">Estimated ARR (mid)</div>
              <div className="rev-kpi-value">
                {formatCurrency(result.midAnnualCents)}
              </div>
              <div className="rev-kpi-band">
                {formatBand(result.lowAnnualCents, result.highAnnualCents)}
              </div>
              <ConfidenceBar
                low={result.lowAnnualCents}
                mid={result.midAnnualCents}
                high={result.highAnnualCents}
              />
            </div>
          </div>
          <p className="rev-rationale">{result.rationale}</p>

          {/* Comp set */}
          <div className="rev-comps">
            <div className="rev-comps-head">
              <span className="eyebrow-num">{"// 03"}</span>
              <span className="eyebrow-title">Comp set · 3 verified rows</span>
              <span className="rev-comps-meta">closest verified ARR neighbours</span>
            </div>
            {compSet.length === 0 ? (
              <div className="rev-comps-empty">
                <Icon name="info" size="sm" /> No verified overlays in this band yet.
              </div>
            ) : (
              <table className="tdata rev-comps-table">
                <thead>
                  <tr>
                    <th>Repo</th>
                    <th>Tier</th>
                    <th className="num">MRR / ARR</th>
                    <th>Spark</th>
                    <th className="num">As of</th>
                  </tr>
                </thead>
                <tbody>
                  {compSet.map((overlay) => (
                    <CompRow key={overlay.fullName} overlay={overlay} />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Source provenance */}
          <div className="rev-sources">
            <div className="rev-sources-head">
              <span className="eyebrow-num">{"// 04"}</span>
              <span className="eyebrow-title">Source provenance</span>
            </div>
            <ul className="rev-sources-list">
              {result.sources.map((src, i) => (
                <li key={`${src.label}-${i}`} className="rev-source-row">
                  <Icon name="link" size="sm" />
                  {src.href ? (
                    <a href={src.href} target="_blank" rel="noopener noreferrer">
                      {src.label}
                    </a>
                  ) : (
                    <span>{src.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─── Browser (existing overlays list) ─── */}
      <section className="rev-browser" aria-label="All revenue overlays">
        <div className="rev-browser-head">
          <span className="eyebrow-num">{"// 05"}</span>
          <span className="eyebrow-title">All overlays · {overlays.length}</span>
        </div>

        <FilterRail
          tier={tier}
          sort={sort}
          search={search}
          total={rows.length}
        />

        {rows.length > 0 ? (
          <OverlayTable rows={rows} />
        ) : (
          <OverlayFallback
            overlaysTotal={overlays.length}
            pendingCount={pendingCount}
            tier={tier}
            search={search}
          />
        )}
      </section>
    </div>
  );
}

// ─── ConfidenceBar ────────────────────────────────────────────────────────

function ConfidenceBar({ low, mid, high }: { low: number; mid: number; high: number }) {
  const range = Math.max(1, high - low);
  const midPct = ((mid - low) / range) * 100;
  return (
    <div className="rev-band">
      <div className="rev-band-track" />
      <div
        className="rev-band-fill"
        style={{ left: "0%", width: "100%" }}
      />
      <div
        className="rev-band-mid"
        style={{ left: `calc(${midPct}% - 1px)` }}
      />
      <div className="rev-band-labels">
        <span>{formatCurrency(low)}</span>
        <span>{formatCurrency(high)}</span>
      </div>
    </div>
  );
}

// ─── CompRow ─────────────────────────────────────────────────────────────

function CompRow({ overlay }: { overlay: RevenueOverlay }) {
  const repo = getDerivedRepoByFullName(overlay.fullName);
  const [owner, name] = overlay.fullName.includes("/")
    ? overlay.fullName.split("/", 2)
    : [overlay.fullName, ""];
  const cell = mrrCell(overlay);
  const href = name
    ? `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}?tab=revenue`
    : `/repo/${encodeURIComponent(owner)}`;

  // Tiny spark: 6 fake bars driven by mrr * 0.4 .. 1.0 — pure visual gesture.
  const seed = cell.rankValue || 1;
  const bars = Array.from({ length: 6 }, (_, i) => {
    const ratio = 0.4 + ((Math.sin(seed + i * 0.85) + 1) / 2) * 0.6;
    return Math.round(ratio * 18);
  });

  return (
    <tr>
      <td>
        <Link href={href} prefetch={false} className="rev-comp-link">
          <span className="rev-comp-avatar" aria-hidden="true">
            {repo?.ownerAvatarUrl ? (
              <Image
                src={repo.ownerAvatarUrl}
                alt=""
                width={20}
                height={20}
                unoptimized
                style={{ borderRadius: 2, display: "block" }}
              />
            ) : (
              <span className="rev-comp-fallback">
                {owner.slice(0, 2).toUpperCase()}
              </span>
            )}
          </span>
          <span className="rev-comp-name">
            <span className="rev-comp-owner">{owner}/</span>
            {name}
          </span>
        </Link>
      </td>
      <td><span className={tierChipClass(overlay.tier)}>{tierLabel(overlay.tier)}</span></td>
      <td className="num"><span className="rev-comp-mrr">{cell.display}</span></td>
      <td>
        <span className="rev-comp-spark" aria-hidden="true">
          {bars.map((h, i) => (
            <span key={i} style={{ height: h }} />
          ))}
        </span>
      </td>
      <td className="num"><span className="rev-comp-asof">{relativeAgo(overlay.asOf)}</span></td>
    </tr>
  );
}

// ─── FilterRail ──────────────────────────────────────────────────────────

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
      <div className="rev-filter-group">
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

      <div className="rev-filter-group">
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

// ─── OverlayTable ────────────────────────────────────────────────────────

function OverlayTable({ rows }: { rows: RevenueOverlay[] }) {
  return (
    <div className="rev-table-wrap">
      <table className="tdata rev-table">
        <thead>
          <tr>
            <th>Repo</th>
            <th>Tier</th>
            <th className="num">Estimate</th>
            <th>Source</th>
            <th className="num">As of</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((overlay) => (
            <OverlayRow key={overlay.fullName} overlay={overlay} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverlayRow({ overlay }: { overlay: RevenueOverlay }) {
  const repo = getDerivedRepoByFullName(overlay.fullName);
  const [owner, name] = overlay.fullName.includes("/")
    ? overlay.fullName.split("/", 2)
    : [overlay.fullName, ""];
  const cell = mrrCell(overlay);
  const viewHref = name
    ? `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}?tab=revenue`
    : `/repo/${encodeURIComponent(owner)}`;
  const estHref = name
    ? `/tools/revenue-estimate?repo=${encodeURIComponent(overlay.fullName)}`
    : `/tools/revenue-estimate?repo=${encodeURIComponent(owner)}`;

  return (
    <tr>
      <td>
        <Link href={viewHref} prefetch={false} className="rev-comp-link">
          <span className="rev-comp-avatar" aria-hidden="true">
            {repo?.ownerAvatarUrl ? (
              <Image
                src={repo.ownerAvatarUrl}
                alt=""
                width={22}
                height={22}
                unoptimized
                style={{ borderRadius: 2, display: "block" }}
              />
            ) : (
              <span className="rev-comp-fallback">
                {owner.slice(0, 2).toUpperCase()}
              </span>
            )}
          </span>
          <span className="rev-comp-name">
            <span className="rev-comp-owner">{owner}/</span>
            {name}
          </span>
        </Link>
      </td>
      <td><span className={tierChipClass(overlay.tier)}>{tierLabel(overlay.tier)}</span></td>
      <td className="num">
        <span className={`rev-comp-mrr ${cell.basis === "none" ? "muted" : ""}`}>
          {cell.display}
        </span>
        {overlay.paymentProvider ? (
          <span className="rev-row-sub">{overlay.paymentProvider}</span>
        ) : null}
      </td>
      <td>
        <a
          href={overlay.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rev-source-link"
        >
          {sourceLabel(overlay)}
        </a>
      </td>
      <td className="num"><span className="rev-comp-asof">{relativeAgo(overlay.asOf)}</span></td>
      <td>
        <Link href={estHref} prefetch={false} className="btn sm">
          <Icon name="trending-dollar" size="sm" /> Estimate
        </Link>
      </td>
    </tr>
  );
}

// ─── OverlayFallback ─────────────────────────────────────────────────────

interface OverlayFallbackProps {
  overlaysTotal: number;
  pendingCount: number;
  tier: TierFilter;
  search: string | null;
}

function OverlayFallback({
  overlaysTotal,
  pendingCount,
  tier,
  search,
}: OverlayFallbackProps) {
  const noDataAtAll = overlaysTotal === 0;
  return (
    <section className="rev-empty">
      <div className="rev-empty-icon" aria-hidden="true">
        <SourceLogo source="github" size="2xl" />
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

// ─── Styles ──────────────────────────────────────────────────────────────

function RevenuePageStyles() {
  return (
    <style>{`
      .rev-page {
        padding: 18px 22px 40px;
        max-width: 1500px;
        margin: 0 auto;
        color: var(--fg);
      }

      /* ── Hero ── */
      .rev-hero {
        position: relative;
        padding: 22px 24px 20px;
        background:
          radial-gradient(900px 320px at 8% 0%, var(--accent-wash), transparent 60%),
          var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-lg);
        margin-bottom: 18px;
        overflow: hidden;
      }
      .rev-hero::before,
      .rev-hero::after {
        content: "";
        position: absolute;
        width: 18px; height: 18px;
        border: 1px solid var(--accent-line);
        pointer-events: none;
      }
      .rev-hero::before { top: 8px; left: 8px; border-right: 0; border-bottom: 0; }
      .rev-hero::after { bottom: 8px; right: 8px; border-left: 0; border-top: 0; }
      .rev-hero-row {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: end;
        gap: 28px;
      }
      .rev-page .hero-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.10em;
        color: var(--fg-faint);
        margin-bottom: 12px;
      }
      .rev-page .hero-eyebrow .eb-num { color: var(--accent); font-weight: 600; }
      .rev-page .hero-eyebrow .eb-sep { color: var(--surface-4); }
      .rev-page .hero-eyebrow .eb-tag { color: var(--fg-muted); }
      .rev-page .page-title {
        font-family: var(--font-display);
        font-size: clamp(28px, 3.2vw, 38px);
        line-height: 1.05;
        margin: 0 0 8px;
        color: var(--fg-bright);
        letter-spacing: -0.02em;
        font-weight: 600;
      }
      .rev-page .hero-dot { color: var(--accent); }
      .rev-page .page-sub { margin: 0 0 14px; max-width: 60ch; }

      .rev-hero-chips {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      }
      .rev-hero-chips .chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        text-decoration: none;
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .rev-hero-kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(100px, auto));
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-md);
        overflow: hidden;
      }
      .rev-hero-kpis .kpi {
        padding: 12px 16px;
        border-right: 1px solid var(--border-subtle);
        display: flex; flex-direction: column; gap: 4px;
      }
      .rev-hero-kpis .kpi:last-child { border-right: 0; }
      .rev-hero-kpis .kpi-label {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .rev-hero-kpis .kpi-value {
        font-family: var(--font-mono);
        font-size: 22px;
        font-weight: 600;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
      }
      .rev-hero-kpis .kpi-value.up { color: var(--up); }

      /* ── Estimator ── */
      .rev-estimator {
        display: grid;
        grid-template-columns: minmax(280px, 380px) 1fr;
        gap: 18px;
        align-items: start;
      }
      @media (max-width: 1100px) {
        .rev-estimator { grid-template-columns: 1fr; }
        .rev-hero-row { grid-template-columns: 1fr; }
        .rev-hero-kpis { grid-template-columns: repeat(3, 1fr); }
      }
      .rev-page .card {
        padding: 14px 16px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-lg);
      }
      .rev-inputs {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .rev-inputs-head, .rev-output-head, .rev-comps-head, .rev-sources-head, .rev-browser-head {
        display: flex;
        align-items: baseline;
        gap: 10px;
        flex-wrap: wrap;
      }
      .eyebrow-num {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        letter-spacing: 0.10em;
        font-weight: 600;
      }
      .eyebrow-title {
        font-size: 13.5px;
        color: var(--fg-bright);
        font-weight: 500;
      }
      .rev-comps-meta {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
      }
      .rev-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .rev-field-label {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .rev-field-input {
        height: 34px;
        padding: 0 12px;
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-md);
        color: var(--fg-bright);
        font-family: var(--font-mono);
        font-size: 12px;
        outline: none;
        transition: border-color var(--motion-fast) var(--ease);
      }
      .rev-field-input::placeholder { color: var(--fg-faint); }
      .rev-field-input:focus { border-color: var(--accent); }
      .rev-field-input--narrow { max-width: 120px; }
      .rev-field-hint {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
      }

      .rev-seg {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 2px;
        padding: 2px;
        background: var(--surface-2);
        border-radius: var(--r-xs);
      }
      .rev-seg label {
        position: relative;
        cursor: pointer;
        padding: 6px 12px;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--fg-subtle);
        border-radius: var(--r-xs);
        transition: all var(--motion-fast) var(--ease);
      }
      .rev-seg label:hover { color: var(--fg); }
      .rev-seg label.on {
        background: var(--surface-3);
        color: var(--fg-bright);
      }
      .rev-seg-input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
      .rev-seg-input:focus-visible + * { outline: 2px solid var(--accent); }
      .rev-submit { align-self: flex-start; gap: 5px; }

      /* ── Output ── */
      .rev-output {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .rev-output-head .chip { margin-left: auto; }
      .rev-output-head .chip + .chip { margin-left: 6px; }
      .rev-kpi-row {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .rev-kpi {
        padding: 16px 18px;
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-md);
      }
      .rev-kpi-label {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .rev-kpi-value {
        font-family: var(--font-mono);
        font-size: 38px;
        font-weight: 600;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.025em;
        line-height: 1.05;
        margin-top: 4px;
      }
      .rev-kpi-band {
        margin-top: 4px;
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--accent);
        letter-spacing: -0.005em;
      }
      .rev-band {
        position: relative;
        margin-top: 12px;
        height: 24px;
      }
      .rev-band-track {
        position: absolute; inset: 9px 0 9px;
        background: var(--surface-3);
        border-radius: 1px;
      }
      .rev-band-fill {
        position: absolute;
        top: 8px; height: 8px;
        background: linear-gradient(90deg, var(--info), var(--accent), var(--up));
        border-radius: 1px;
        opacity: 0.72;
      }
      .rev-band-mid {
        position: absolute;
        top: 4px; height: 16px;
        width: 2px;
        background: var(--fg-bright);
        box-shadow: 0 0 8px rgba(255,255,255,0.4);
      }
      .rev-band-labels {
        position: absolute;
        inset: auto 0 -2px;
        display: flex;
        justify-content: space-between;
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        font-variant-numeric: tabular-nums;
      }

      .rev-rationale {
        margin: 0;
        font-size: 12px;
        color: var(--fg-muted);
        line-height: 1.55;
      }

      /* ── Comp set ── */
      .rev-comps {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .rev-comps-table { width: 100%; }
      .rev-comps-table th, .rev-comps-table td {
        padding: 8px 10px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .rev-comps-empty {
        padding: 16px;
        background: var(--surface-2);
        border: 1px dashed var(--border-subtle);
        border-radius: var(--r-md);
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--fg-muted);
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .rev-comp-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        text-decoration: none;
        min-width: 0;
      }
      .rev-comp-link:hover .rev-comp-name { color: var(--accent); }
      .rev-comp-avatar { width: 22px; height: 22px; flex: 0 0 22px; display: grid; place-items: center; }
      .rev-comp-fallback {
        width: 22px; height: 22px;
        display: grid; place-items: center;
        background: var(--surface-3);
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 9px;
        font-weight: 600;
        border-radius: var(--r-xs);
      }
      .rev-comp-name {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--fg-bright);
        font-weight: 500;
      }
      .rev-comp-owner { color: var(--fg-muted); font-weight: 400; }
      .rev-comp-mrr {
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 600;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
      }
      .rev-comp-mrr.muted { color: var(--fg-faint); font-weight: 400; }
      .rev-comp-asof {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-muted);
        font-variant-numeric: tabular-nums;
      }
      .rev-comp-spark {
        display: inline-flex;
        align-items: flex-end;
        gap: 2px;
        height: 18px;
      }
      .rev-comp-spark span {
        width: 4px;
        background: var(--accent);
        opacity: 0.78;
        border-radius: 1px;
      }

      /* ── Sources ── */
      .rev-sources {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .rev-sources-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .rev-source-row {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--fg-muted);
        padding: 4px 0;
      }
      .rev-source-row a {
        color: var(--fg);
        text-decoration: none;
        border-bottom: 1px dotted var(--border);
      }
      .rev-source-row a:hover { color: var(--accent); border-color: var(--accent); }

      /* ── Browser ── */
      .rev-browser {
        margin-top: 24px;
        padding-top: 22px;
        border-top: 1px solid var(--border-subtle);
      }
      .rev-browser-head { margin-bottom: 14px; }

      .rev-filter-rail {
        display: flex;
        align-items: center;
        gap: 18px;
        flex-wrap: wrap;
        padding: 12px 14px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-lg);
        margin-bottom: 14px;
      }
      .rev-filter-group { display: flex; align-items: center; gap: 10px; }
      .rev-filter-label {
        font-family: var(--font-mono);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.10em;
        color: var(--fg-faint);
      }
      .rev-search { display: flex; align-items: center; gap: 8px; }
      .rev-search input[type="search"] {
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        color: var(--fg-bright);
        font-family: var(--font-mono);
        font-size: 12px;
        padding: 6px 10px;
        border-radius: var(--r-xs);
        width: 200px;
        outline: none;
      }
      .rev-search input[type="search"]:focus { border-color: var(--accent); }
      .rev-search button {
        background: var(--surface-3);
        border: 1px solid var(--border-subtle);
        color: var(--fg-bright);
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 6px 12px;
        border-radius: var(--r-xs);
        cursor: pointer;
      }
      .rev-search button:hover { background: var(--accent-soft); }
      .rev-filter-count {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-muted);
      }
      .rev-filter-count b { color: var(--fg-bright); font-weight: 600; }

      .rev-table-wrap {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-lg);
        overflow: hidden;
      }
      .rev-table { width: 100%; }
      .rev-table thead th { padding: 10px 14px; }
      .rev-table tbody td {
        padding: 10px 14px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .rev-row-sub {
        display: block;
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--fg-faint);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-top: 2px;
      }
      .rev-source-link {
        color: var(--fg-subtle);
        text-decoration: none;
        font-family: var(--font-mono);
        font-size: 11px;
      }
      .rev-source-link:hover { color: var(--accent); text-decoration: underline; }

      .rev-empty {
        display: flex;
        gap: 18px;
        align-items: center;
        padding: 36px 24px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-lg);
      }
      .rev-empty-icon { color: var(--fg-faint); display: grid; place-items: center; }
      .rev-empty-title {
        font-size: 14px; color: var(--fg-bright); margin-bottom: 4px; font-weight: 500;
      }
      .rev-empty-sub {
        font-size: 12px; color: var(--fg-muted); max-width: 64ch; line-height: 1.55;
      }
      .rev-empty-cta { color: var(--accent); text-decoration: none; font-weight: 500; }
      .rev-empty-cta:hover { text-decoration: underline; }
    `}</style>
  );
}
