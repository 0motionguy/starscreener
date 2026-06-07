// /breakout — Breakout radar. Real data only — no SEED_BREAKOUTS, no
// completeRepoFromSeed, no makeSparkline, no fabricated mentions. If the
// live data store is sparse, the page shows fewer rows. Honesty contract.
//
// Pipeline:
//   1. refresh + read derived repos (real OSSInsights + GitHub metadata)
//   2. filter to repos with any real signal (starsDelta24h, mentions, arxiv)
//   3. compute velocityPct, activeSources, consensus tier per repo
//   4. sort by velocityPct desc
//   5. compute ConsensusBucket aggregates
//   6. apply filter param + render
//
// Sources of truth (none of these are fabricated):
//   - repo.stars, repo.starsDelta24h, repo.sparklineData → OSSInsights
//   - repo.ownerAvatarUrl, repo.language, repo.description → GitHub API
//   - repo.mentions.perSource → mentions-ledger via decorateWithMentionsRollup
//   - repo.channelStatus → cross-signal decorator
//   - repo.linkedArxivIds → arxiv-cited intake pipeline

import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";
import { getDerivedRepos } from "@/lib/derived-repos";
import { refreshArxivFromStore } from "@/lib/arxiv";

import type { Repo, SocialPlatform } from "@/lib/types";

import { BreakoutHero, type BreakoutWindow, WINDOWS } from "@/components/breakout/BreakoutHero";
import {
  BreakoutConsensusStrip,
  type ConsensusBucket,
  type ConsensusTier,
} from "@/components/breakout/BreakoutConsensusStrip";
import {
  BreakoutVelocityLadder,
  type LadderFilter,
  type LadderItem,
  type VelocityTier,
} from "@/components/breakout/BreakoutVelocityLadder";

export const revalidate = 1800;

export const metadata = {
  title: "Breakout",
  description:
    "Repos accelerating disproportionately to their star base. Velocity, consensus, and mention diversity before the move becomes obvious.",
  alternates: { canonical: "/breakout" },
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const FILTERS: LadderFilter[] = ["all", "hot", "warm", "early", "paper"];

const DISPLAY_SOURCE_ORDER: SocialPlatform[] = [
  "github",
  "hackernews",
  "twitter",
  "reddit",
  "bluesky",
  "devto",
  "producthunt",
  "huggingface",
  "arxiv",
  "npm",
  "lobsters",
];

function activeSourcesForRepo(repo: Repo): SocialPlatform[] {
  const active = new Set<SocialPlatform>();
  const per = repo.mentions?.perSource;
  if (per) {
    for (const source of DISPLAY_SOURCE_ORDER) {
      const channel = per[source];
      if (!channel) continue;
      const count =
        channel.count ?? Math.max(channel.count24h ?? 0, channel.count7d ?? 0);
      if (count > 0) active.add(source);
    }
  }
  if ((repo.starsDelta24h ?? 0) > 0) active.add("github");
  if ((repo.twitter?.mentionCount24h ?? 0) > 0) active.add("twitter");
  if ((repo.reddit?.mentions7d ?? 0) > 0) active.add("reddit");
  if ((repo.bluesky?.mentions7d ?? 0) > 0) active.add("bluesky");
  if ((repo.devto?.mentions7d ?? 0) > 0) active.add("devto");
  if (repo.producthunt?.launchedOnPH) active.add("producthunt");
  if ((repo.linkedArxivIds?.length ?? 0) > 0) active.add("arxiv");
  if ((repo.linkedHfModels?.length ?? 0) > 0) active.add("huggingface");
  if (repo.channelStatus?.github) active.add("github");
  if (repo.channelStatus?.hn) active.add("hackernews");
  if (repo.channelStatus?.twitter) active.add("twitter");
  if (repo.channelStatus?.reddit) active.add("reddit");
  if (repo.channelStatus?.bluesky) active.add("bluesky");
  if (repo.channelStatus?.devto) active.add("devto");
  return DISPLAY_SOURCE_ORDER.filter((source) => active.has(source));
}

function mentionVolumeForRepo(repo: Repo): number {
  return (
    repo.mentions?.total ??
    repo.mentions?.total24h ??
    repo.mentionCount24h ??
    (repo.twitter?.mentionCount24h ?? 0) +
      Math.round((repo.reddit?.mentions7d ?? 0) / 3) +
      Math.round((repo.bluesky?.mentions7d ?? 0) / 3) +
      Math.round((repo.devto?.mentions7d ?? 0) / 3)
  );
}

function windowDelta(repo: Repo, window: BreakoutWindow): number {
  if (window === "1h") {
    // No real 1h field — derive from 24h scaled down, but only if real.
    const d24 = repo.starsDelta24h ?? 0;
    return d24 > 0 ? Math.max(1, Math.round(d24 / 24)) : 0;
  }
  if (window === "7d") return Math.max(0, repo.starsDelta7d ?? 0);
  return Math.max(0, repo.starsDelta24h ?? 0);
}

function velocityPctForRepo(repo: Repo, window: BreakoutWindow): number {
  const stars = typeof repo.stars === "number" && repo.stars > 0 ? repo.stars : 0;
  if (stars === 0) return 0;
  const delta = windowDelta(repo, window);
  if (delta <= 0) return 0;
  return (delta / stars) * 100;
}

function classifyVelocityTier(pct: number): VelocityTier {
  if (pct >= 20) return "explosive";
  if (pct >= 10) return "hot";
  if (pct >= 3) return "warm";
  return "early";
}

// Minimum-base filter. Real breakouts are about acceleration on a credible
// star base — a 30-star repo gaining 30 stars in 24h reads as +100% but it
// is a birth, not a breakout. Require enough stars to make % meaningful.
const MIN_STARS_FOR_BREAKOUT = 500;
const MIN_DELTA_OR_SIGNAL = 5;

function classifyConsensusTier(
  activeSourceCount: number,
  arxivOnly: boolean,
): ConsensusTier | null {
  if (activeSourceCount >= 5) return "high";
  if (activeSourceCount >= 3) return "mid";
  if (activeSourceCount >= 1) return "low";
  if (arxivOnly) return "paper";
  return null;
}

function parseFilter(value: string | string[] | undefined): LadderFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && (FILTERS as string[]).includes(raw)) return raw as LadderFilter;
  return "all";
}

function passesFilter(item: LadderItem, filter: LadderFilter): boolean {
  if (filter === "all") return true;
  if (filter === "paper") return item.consensusTier === "paper";
  if (filter === "hot") return item.velocityPct >= 10;
  if (filter === "warm") return item.velocityPct >= 3 && item.velocityPct < 10;
  if (filter === "early") return item.velocityPct >= 0 && item.velocityPct < 3;
  return true;
}

// Top-N mean. Used by consensus tiles to surface a "leading edge" signal
// rather than a whole-tier mean dragged down by the long tail of slow repos.
function topNAverage(values: number[], n: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  const slice = sorted.slice(0, Math.min(n, sorted.length));
  return slice.reduce((acc, v) => acc + v, 0) / slice.length;
}

export default async function BreakoutPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawWin = typeof params.window === "string" ? params.window : "24h";
  const timeWindow = (WINDOWS.find((w) => w.id === rawWin)?.id ??
    "24h") as BreakoutWindow;
  const filter = parseFilter(params.filter);

  await Promise.allSettled([refreshTrendingFromStore(), refreshArxivFromStore()]);

  const derived: Repo[] = (() => {
    try {
      return getDerivedRepos();
    } catch {
      return [];
    }
  })();

  const fetchedAt = (() => {
    try {
      return getLastFetchedAt() || null;
    } catch {
      return null;
    }
  })();

  // Build LadderItems from REAL repos only.
  //
  // Two inclusion gates — both must hold so the radar reads as honest
  // breakouts, not statistical noise from tiny bases:
  //   1. stars >= MIN_STARS_FOR_BREAKOUT (credible base for % to be meaningful)
  //   2. has at least one real signal: meaningful star momentum (delta >= 5),
  //      OR 2+ active sources, OR an arxiv citation
  const candidates: LadderItem[] = [];
  for (const repo of derived) {
    if (!repo.fullName || repo.archived || repo.deleted) continue;
    if ((repo.stars ?? 0) < MIN_STARS_FOR_BREAKOUT) continue;

    const sources = activeSourcesForRepo(repo);
    const hasArxiv = (repo.linkedArxivIds?.length ?? 0) > 0;
    const starsDelta24h = windowDelta(repo, timeWindow);
    const hasMomentum = starsDelta24h >= MIN_DELTA_OR_SIGNAL;
    const hasBroadSources = sources.length >= 2;
    if (!hasMomentum && !hasBroadSources && !hasArxiv) continue;

    const consensus = classifyConsensusTier(sources.length, hasArxiv);
    if (!consensus) continue;

    const velocityPct = velocityPctForRepo(repo, timeWindow);
    const velocityTier = classifyVelocityTier(velocityPct);
    const mentions24h = mentionVolumeForRepo(repo);

    candidates.push({
      rank: 0, // assigned after sorting
      repo,
      velocityPct,
      velocityTier,
      consensusTier: consensus,
      activeSources: sources,
      mentions24h,
      starsDelta24h,
    });
  }

  // Sort by velocity desc, tiebreak by absolute star momentum — keeps the
  // radar ordered by % acceleration but breaks ties in favor of louder repos.
  candidates.sort((a, b) => {
    const v = b.velocityPct - a.velocityPct;
    if (v !== 0) return v;
    return b.starsDelta24h - a.starsDelta24h;
  });

  // Assign ranks BEFORE filtering so they stay stable across filter views.
  const ranked = candidates.map((item, index) => ({ ...item, rank: index + 1 }));

  // Consensus buckets aggregate across ALL real candidates (not filtered).
  // The headline % is the top-3 mean velocity in that tier — a leading-edge
  // signal that surfaces "what's hottest among repos with this consensus
  // level" rather than a whole-tier average dulled by slow long-tail repos.
  const buildBucket = (tier: ConsensusTier): ConsensusBucket => {
    const inTier = ranked.filter((c) => c.consensusTier === tier);
    return {
      tier,
      count: inTier.length,
      avgVelocityPct: topNAverage(inTier.map((c) => c.velocityPct), 3),
    };
  };
  const buckets: ConsensusBucket[] = [
    buildBucket("high"),
    buildBucket("mid"),
    buildBucket("low"),
    buildBucket("paper"),
  ];

  // Tier counts for filter tabs — must match passesFilter thresholds.
  const tierCounts: Record<LadderFilter, number> = {
    all: ranked.length,
    hot: ranked.filter((c) => c.velocityPct >= 10).length,
    warm: ranked.filter((c) => c.velocityPct >= 3 && c.velocityPct < 10).length,
    early: ranked.filter((c) => c.velocityPct >= 0 && c.velocityPct < 3).length,
    paper: ranked.filter((c) => c.consensusTier === "paper").length,
  };

  // Apply the active filter to displayed rows (rank is preserved).
  const displayed = ranked.filter((item) => passesFilter(item, filter));

  // Cap displayed rows — keep it scannable, not infinite.
  const items = displayed.slice(0, 40);

  return (
    <div className="breakout-page">
      <BreakoutPageStyles />
      <BreakoutHero
        window={timeWindow}
        totalCount={ranked.length}
        fetchedAt={fetchedAt}
      />
      <BreakoutConsensusStrip buckets={buckets} total={ranked.length} />
      <BreakoutVelocityLadder
        items={items}
        tierCounts={tierCounts}
        activeFilter={filter}
        windowLabel={timeWindow.toUpperCase()}
      />
    </div>
  );
}

function BreakoutPageStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.breakout-page {
  padding: 16px 22px 48px;
  max-width: 1640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ─── Consensus strip — 4 KPI tiles ─── */
.bk-consensus-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.bk-consensus-tile {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  padding: 14px 16px 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  min-height: 110px;
  overflow: hidden;
}
.bk-consensus-tile::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    var(--tier-color, var(--accent)) 15%,
    var(--tier-color, var(--accent)) 85%,
    transparent 100%
  );
  pointer-events: none;
}
.bk-consensus-tile--high { --tier-color: var(--accent); }
.bk-consensus-tile--mid { --tier-color: var(--warning); }
.bk-consensus-tile--low { --tier-color: var(--info); }
.bk-consensus-tile--paper { --tier-color: var(--cyan); }

.bk-ct-head { display: flex; align-items: center; justify-content: space-between; }
.bk-ct-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-subtle);
  font-weight: 600;
}
.bk-ct-body { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.bk-ct-pct {
  font-family: var(--font-mono);
  font-size: 30px;
  font-weight: 700;
  color: var(--tier-color, var(--accent));
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}
.bk-ct-dots {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  padding-bottom: 4px;
}
.bk-ct-dot {
  width: 5px;
  height: 5px;
  border-radius: var(--r-pill);
  background: var(--surface-4);
}
.bk-ct-dot.on { background: var(--tier-color, var(--accent)); }
.bk-ct-paper-mark {
  font-size: 9px;
  color: var(--tier-color, var(--cyan));
  padding-bottom: 4px;
}
.bk-ct-paper-tag {
  font-size: 11px;
  color: var(--fg-subtle);
  font-weight: 400;
  letter-spacing: 0;
  padding-bottom: 4px;
}
.bk-ct-count {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
}
.bk-ct-count-num { color: var(--fg); font-weight: 600; }
.bk-ct-count-sep { color: var(--fg-faint); margin: 0 2px; }
.bk-ct-count-total { color: var(--fg-faint); }
.bk-ct-foot {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg-faint);
  letter-spacing: 0.02em;
}

/* ─── Velocity ladder ─── */
.bk-ladder {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.bk-ladder-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  flex-wrap: wrap;
}
.bk-ladder-eyebrow { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.bk-ladder-slashes { color: var(--accent); font-family: var(--font-mono); font-size: 11px; font-weight: 700; }
.bk-ladder-title {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-bright);
  font-weight: 600;
}
.bk-ladder-sub {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg-faint);
  letter-spacing: 0.02em;
}

.bk-ladder-filters { display: flex; gap: 1px; background: var(--border-subtle); border: 1px solid var(--border-subtle); border-radius: var(--r-md); padding: 1px; }
.bk-ladder-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border-radius: var(--r-sm);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-subtle);
  font-weight: 600;
  text-decoration: none;
  transition: background var(--d-fast) var(--ease), color var(--d-fast) var(--ease);
}
.bk-ladder-filter:hover { color: var(--fg); background: var(--surface-2); }
.bk-ladder-filter.on { background: var(--surface-3); color: var(--fg-bright); }
.bk-ladder-filter-range { color: var(--fg-faint); font-size: 9px; }
.bk-ladder-filter-count { color: var(--fg-faint); font-size: 10px; font-weight: 500; }
.bk-ladder-filter.on .bk-ladder-filter-count { color: var(--accent); }

/* Table layout — grid-based for column control on every row */
.bk-ladder-table { display: flex; flex-direction: column; }
.bk-ladder-row {
  display: grid;
  grid-template-columns: 38px 1fr 220px 56px 80px 120px 130px 70px;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle);
  position: relative;
}
.bk-ladder-row--head {
  border-top: 0;
  padding: 8px 16px;
  background: transparent;
}
.bk-ladder-row--head > span {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-faint);
  font-weight: 500;
}
.bk-row-link {
  text-decoration: none;
  color: inherit;
  transition: background var(--d-fast) var(--ease);
}
.bk-row-link:hover { background: var(--surface-2); }
.bk-row-link:hover::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    var(--accent) 15%,
    var(--accent) 85%,
    transparent 100%
  );
  pointer-events: none;
}

.bk-col-rank, .bk-row-rank {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-faint);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.bk-row--explosive .bk-row-rank { color: var(--accent); }
.bk-row--hot .bk-row-rank { color: var(--warning); }

.bk-col-repo, .bk-row-repo { display: flex; align-items: center; gap: 12px; min-width: 0; }
.bk-row-avatar {
  width: 28px; height: 28px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid var(--border);
  overflow: hidden;
  display: grid; place-items: center;
  flex-shrink: 0;
}
.bk-row-avatar-img { display: block; }
.bk-row-avatar-fallback {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--fg-muted);
}
.bk-row-repo-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.bk-row-repo-line { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: nowrap; }
.bk-row-owner {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-muted);
  white-space: nowrap;
}
.bk-row-slash { color: var(--fg-faint); font-family: var(--font-mono); font-size: 12px; }
.bk-row-name {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--fg-bright);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bk-row-lang {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: var(--surface-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--fg-muted);
  letter-spacing: 0.02em;
  flex-shrink: 0;
}
.bk-row-lang-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--r-pill);
  flex-shrink: 0;
}
.bk-row-desc {
  font-size: 11.5px;
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.bk-col-vel, .bk-row-velbar {
  height: 22px;
  position: relative;
  background: var(--surface-3);
  border-radius: var(--r-sm);
  overflow: hidden;
  display: flex;
  align-items: center;
}
.bk-row-velbar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, var(--accent-dim), var(--accent));
  transition: width var(--d-base) var(--ease);
}
.bk-row-velbar--explosive .bk-row-velbar-fill {
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  box-shadow: 0 0 12px rgba(255,107,53,0.35);
}
.bk-row-velbar--hot .bk-row-velbar-fill {
  background: linear-gradient(90deg, var(--warning), var(--accent));
}
.bk-row-velbar--warm .bk-row-velbar-fill {
  background: linear-gradient(90deg, var(--info), var(--warning));
}
.bk-row-velbar--early .bk-row-velbar-fill {
  background: linear-gradient(90deg, var(--info-soft), var(--info));
}
.bk-row-velbar-badge {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  border-radius: var(--r-xs);
  background: var(--accent);
  color: var(--bg);
  z-index: 1;
}
.bk-row-velbar--hot .bk-row-velbar-badge { background: var(--warning); color: var(--bg); }
.bk-row-velbar--warm .bk-row-velbar-badge { background: var(--info); color: var(--bg); }
.bk-row-velbar--early .bk-row-velbar-badge { background: var(--surface-4); color: var(--fg-muted); }

.bk-col-pct, .bk-row-pct {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.bk-row-pct--hot { color: var(--warning); }
.bk-row-pct--warm { color: var(--info); }
.bk-row-pct--early { color: var(--fg-muted); }

.bk-col-consensus, .bk-row-consensus { display: inline-flex; gap: 4px; align-items: center; }
.bk-row-cdot {
  width: 6px;
  height: 6px;
  border-radius: var(--r-pill);
  background: var(--surface-4);
}
.bk-row-consensus--high .bk-row-cdot.on { background: var(--accent); }
.bk-row-consensus--mid .bk-row-cdot.on { background: var(--warning); }
.bk-row-consensus--low .bk-row-cdot.on { background: var(--info); }
.bk-row-consensus--paper .bk-row-cdot.on { background: var(--cyan); }

.bk-col-sources, .bk-row-sources { display: inline-flex; align-items: center; gap: 3px; flex-wrap: nowrap; }
/* .spip already has shell.css base + brand background per source class;
   we only widen + reshape it inside this ladder, keeping the brand fill. */
.bk-row-sources .spip {
  width: 18px;
  height: 18px;
  border-radius: var(--r-xs);
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  overflow: hidden;
}
.bk-row-sources .spip-more {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--fg-faint);
  padding: 0 4px;
}

.bk-col-mentions, .bk-row-mentions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
.bk-row-mentions .spark {
  width: 120px;
  height: 28px;
  color: var(--accent);
}
.bk-row-mentions--explosive .spark { color: var(--accent); }
.bk-row-mentions--hot .spark { color: var(--warning); }
.bk-row-mentions--warm .spark { color: var(--info); }
.bk-row-mentions--early .spark { color: var(--info); opacity: 0.7; }
.bk-row-mentions-empty {
  color: var(--fg-faint);
  font-family: var(--font-mono);
  font-size: 14px;
}

.bk-col-stars, .bk-row-stars {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--up);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.bk-ladder-empty {
  padding: 32px 16px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--fg-faint);
  border-top: 1px solid var(--border-subtle);
}

/* Responsive — drop low-value columns first */
@media (max-width: 1280px) {
  .bk-ladder-row { grid-template-columns: 36px 1fr 180px 56px 70px 100px 110px 60px; gap: 10px; }
  .bk-row-mentions .spark { width: 100px; }
}
@media (max-width: 1024px) {
  .bk-ladder-row { grid-template-columns: 32px 1fr 60px 100px 110px 60px; }
  .bk-col-vel, .bk-row-velbar { display: none; }
  .bk-col-consensus, .bk-row-consensus { display: none; }
  .bk-ladder-row--head .bk-col-vel,
  .bk-ladder-row--head .bk-col-consensus { display: none; }
}
@media (max-width: 768px) {
  .breakout-page { padding: 12px 12px 32px; }
  .bk-consensus-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bk-ladder-head { flex-direction: column; align-items: flex-start; gap: 10px; }
  .bk-ladder-row { grid-template-columns: 28px 1fr 90px 50px; gap: 10px; padding: 11px 12px; }
  .bk-col-sources, .bk-row-sources,
  .bk-col-mentions, .bk-row-mentions { display: none; }
  .bk-ladder-row--head .bk-col-sources,
  .bk-ladder-row--head .bk-col-mentions { display: none; }
  .bk-row-desc { display: none; }
}
`,
      }}
    />
  );
}
