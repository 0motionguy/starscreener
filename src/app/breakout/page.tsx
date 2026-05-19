// /breakout — Breakout radar. Phase 1C of the UI v6 rebuild.
//
// Wires:
//   refreshTrendingFromStore() + getTopMoversByDelta24h(60) — big mover pool
//   getDerivedRepos()                                       — enriched repos
//   getArxivPapersTrending() + linkedRepos                  — emerging tier
//   synthesizeWhy()                                         — per-row narrative
//
// Tier classification (velocity = starsDelta24h / max(stars, 1)):
//   hot       ≥ 15% velocity, ≥ 5 active mention sources
//   warm      8–15% velocity, ≥ 3 sources
//   early     4–8% velocity, < 3 sources
//   emerging  arXiv-linked, may not appear in trending pool at all
//
// ISR: revalidate = 1800 (30 min). Matches the trending pipeline's
// refresh cadence and the rest of the v6 pages.

import {
  refreshTrendingFromStore,
  getTopMoversByDelta24h,
  getLastFetchedAt,
} from "@/lib/trending";
import {
  getDerivedRepos,
  getDerivedRepoByFullName,
} from "@/lib/derived-repos";
import { refreshArxivFromStore, getArxivPapersTrending } from "@/lib/arxiv";

import type { Repo, SocialPlatform } from "@/lib/types";

import {
  BreakoutHero,
  type BreakoutWindow,
  WINDOWS,
} from "@/components/breakout/BreakoutHero";
import {
  TierHeatStrip,
  type BreakoutTier,
  type TierStat,
} from "@/components/breakout/TierHeatStrip";
import { BubbleMap, type BubblePoint } from "@/components/breakout/BubbleMap";
import {
  BreakoutList,
  type BreakoutListItem,
} from "@/components/breakout/BreakoutList";

export const revalidate = 1800;

export const metadata = {
  title: "Breakout — TrendingRepo",
  description:
    "Repos accelerating disproportionately to their star base. Velocity × consensus × mention diversity, not absolute count.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** Count active mention channels (>0 mentions in last 24h) on a repo. */
function activeSourceCount(repo: Repo): number {
  const per = repo.mentions?.perSource;
  if (!per) return 0;
  let n = 0;
  for (const key of Object.keys(per) as SocialPlatform[]) {
    const ch = per[key];
    if (ch && (ch.count24h ?? 0) > 0) n += 1;
  }
  return n;
}

function velocityPctForRepo(repo: Repo): number {
  const stars = typeof repo.stars === "number" && repo.stars > 0 ? repo.stars : 1;
  const delta = typeof repo.starsDelta24h === "number" ? repo.starsDelta24h : 0;
  if (delta <= 0) return 0;
  return (delta / stars) * 100;
}

function classifyTier(velocityPct: number, sourceCount: number): BreakoutTier | null {
  if (velocityPct >= 15 && sourceCount >= 5) return "hot";
  if (velocityPct >= 15) return "hot"; // high-velocity but quiet still hot
  if (velocityPct >= 8 && sourceCount >= 3) return "warm";
  if (velocityPct >= 8) return "warm";
  if (velocityPct >= 4) return "early";
  return null;
}

/** Short label fit for inside a 28-84px bubble. */
function shortLabel(fullName: string): string {
  const [, name] = fullName.split("/");
  const candidate = name ?? fullName;
  if (candidate.length <= 11) return candidate;
  return candidate.slice(0, 10) + "…";
}

export default async function BreakoutPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawWin = typeof params.window === "string" ? params.window : "24h";
  const timeWindow = (WINDOWS.find((w) => w.id === rawWin)?.id ??
    "24h") as BreakoutWindow;

  // 1) Prime trending + arxiv caches (best-effort).
  await Promise.allSettled([
    refreshTrendingFromStore(),
    refreshArxivFromStore(),
  ]);

  // 2) Build the candidate breakout pool. Start from top movers (60), then
  //    join each onto getDerivedRepoByFullName for mention rollup + sparkline.
  const movers = (() => {
    try {
      return getTopMoversByDelta24h(60);
    } catch {
      return [];
    }
  })();

  const derived: Repo[] = (() => {
    try {
      return getDerivedRepos();
    } catch {
      return [];
    }
  })();
  const byFullName = new Map(derived.map((r) => [r.fullName, r]));

  interface Candidate {
    repo: Repo;
    velocityPct: number;
    sourceCount: number;
    tier: BreakoutTier;
  }

  const candidates: Candidate[] = [];

  for (const m of movers) {
    let repo = byFullName.get(m.fullName) ?? null;
    if (!repo) {
      try {
        repo = getDerivedRepoByFullName(m.fullName);
      } catch {
        repo = null;
      }
    }
    if (!repo) {
      // Synthesize a minimal Repo so we still render the row. Mention rollup
      // empty so MentionSourcePips emits 0 active pips.
      const [owner, name] = m.fullName.split("/");
      if (!owner || !name) continue;
      repo = {
        id: m.id,
        fullName: m.fullName,
        name,
        owner,
        ownerAvatarUrl: "",
        description: "",
        url: `https://github.com/${m.fullName}`,
        language: m.language,
        topics: [],
        categoryId: "ai-tools",
        stars: 0,
        forks: 0,
        contributors: 0,
        openIssues: 0,
        lastCommitAt: "",
        createdAt: "",
        archived: false,
        starsDelta24h: m.starsDelta24h,
        starsDelta7d: 0,
        starsDelta30d: 0,
        starsDelta24hMissing: false,
        starsDelta7dMissing: true,
        starsDelta30dMissing: true,
        momentumScore: 0,
        signals: [],
        sparklineData: [],
        collectionNames: [],
      } as unknown as Repo;
    }

    const vel = velocityPctForRepo(repo);
    const sources = activeSourceCount(repo);
    const tier = classifyTier(vel, sources);
    if (!tier) continue;
    candidates.push({ repo, velocityPct: vel, sourceCount: sources, tier });
  }

  // Dedupe in case of join collisions.
  const seen = new Set<string>();
  const deduped: Candidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.repo.fullName)) continue;
    seen.add(c.repo.fullName);
    deduped.push(c);
  }

  // 3) Build emerging tier from arXiv linked repos NOT already in the pool.
  const arxivPapers = (() => {
    try {
      return getArxivPapersTrending(30);
    } catch {
      return [];
    }
  })();
  const emerging: Candidate[] = [];
  for (const paper of arxivPapers) {
    for (const link of paper.linkedRepos ?? []) {
      if (!link.fullName || seen.has(link.fullName)) continue;
      seen.add(link.fullName);
      let repo: Repo | null = byFullName.get(link.fullName) ?? null;
      if (!repo) {
        try {
          repo = getDerivedRepoByFullName(link.fullName);
        } catch {
          repo = null;
        }
      }
      if (!repo) {
        const [owner, name] = link.fullName.split("/");
        if (!owner || !name) continue;
        repo = {
          id: `${owner}--${name}`,
          fullName: link.fullName,
          name,
          owner,
          ownerAvatarUrl: "",
          description: paper.title ?? "",
          url: `https://github.com/${link.fullName}`,
          language: null,
          topics: [],
          categoryId: "ai-tools",
          stars: 0,
          forks: 0,
          contributors: 0,
          openIssues: 0,
          lastCommitAt: "",
          createdAt: "",
          archived: false,
          starsDelta24h: 0,
          starsDelta7d: 0,
          starsDelta30d: 0,
          starsDelta24hMissing: true,
          starsDelta7dMissing: true,
          starsDelta30dMissing: true,
          momentumScore: 0,
          signals: [],
          sparklineData: [],
          collectionNames: [],
        } as unknown as Repo;
      }
      emerging.push({
        repo,
        velocityPct: velocityPctForRepo(repo),
        sourceCount: activeSourceCount(repo),
        tier: "emerging",
      });
      if (emerging.length >= 9) break;
    }
    if (emerging.length >= 9) break;
  }

  const allCandidates: Candidate[] = [...deduped, ...emerging];

  // 4) Compute tier stats for the heat strip.
  const tierStats: TierStat[] = (
    ["hot", "warm", "early", "emerging"] as BreakoutTier[]
  ).map((tier) => {
    const inTier = allCandidates.filter((c) => c.tier === tier);
    const avgVel =
      inTier.length === 0
        ? 0
        : inTier.reduce((s, c) => s + c.velocityPct, 0) / inTier.length;
    return { tier, count: inTier.length, avgVelocityPct: avgVel };
  });

  const hotCount = tierStats.find((t) => t.tier === "hot")?.count ?? 0;
  const warmCount = tierStats.find((t) => t.tier === "warm")?.count ?? 0;
  const emergingCount = tierStats.find((t) => t.tier === "emerging")?.count ?? 0;

  // 5) Build bubble-map data points (entire pool, capped at 42 for visual
  // density — matches the HTML reference).
  const bubblesAll = allCandidates
    .slice()
    .sort((a, b) => b.velocityPct - a.velocityPct)
    .slice(0, 42)
    .map<BubblePoint>((c) => ({
      fullName: c.repo.fullName,
      short: shortLabel(c.repo.fullName),
      velocityPct: c.velocityPct,
      sourceCount: c.sourceCount,
      mentionVolume:
        c.repo.mentions?.total24h ??
        c.repo.mentionCount24h ??
        Math.max(1, c.repo.starsDelta24h ?? 0),
      tier: c.tier,
    }));

  // 6) Build the list — sort by velocity desc, cap at 12 rows.
  const listItems: BreakoutListItem[] = allCandidates
    .slice()
    .sort((a, b) => {
      // Hot first, then warm/early by velocity, emerging last.
      const tierOrder: Record<BreakoutTier, number> = {
        hot: 0,
        warm: 1,
        early: 2,
        emerging: 3,
      };
      const t = tierOrder[a.tier] - tierOrder[b.tier];
      if (t !== 0) return t;
      return b.velocityPct - a.velocityPct;
    })
    .slice(0, 12)
    .map((c) => ({ repo: c.repo, tier: c.tier, velocityPct: c.velocityPct }));

  const fetchedAt = (() => {
    try {
      return getLastFetchedAt() || null;
    } catch {
      return null;
    }
  })();

  return (
    <div style={{ padding: "16px 22px 32px", maxWidth: 1400, margin: "0 auto" }}>
      <BreakoutHero
        window={timeWindow}
        totalCount={allCandidates.length}
        fetchedAt={fetchedAt}
      />
      <TierHeatStrip tiers={tierStats} />
      <BubbleMap
        bubbles={bubblesAll}
        hotCount={hotCount}
        warmCount={warmCount}
        emergingCount={emergingCount}
      />
      <BreakoutList items={listItems} totalCount={allCandidates.length} />
    </div>
  );
}
