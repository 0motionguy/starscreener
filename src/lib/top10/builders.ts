// /top10 — per-category builders.
//
// Each builder takes a Top10Window + the underlying corpus reader's payload
// (already pulled by the page) and returns a Top10Bundle. All readers stay
// at the data-store boundary; builders are pure transforms.

import type { Repo } from "@/lib/types";
import type { HfModelTrending } from "@/lib/huggingface";
import type {
  EcosystemLeaderboardItem,
  EcosystemBoard,
} from "@/lib/ecosystem-leaderboards";
import type { HnStory } from "@/lib/hackernews";
import type { BskyPost } from "@/lib/bluesky";
import type { DevtoArticle } from "@/lib/devto";
import type { LobstersStory } from "@/lib/lobsters";
import type { Launch } from "@/lib/producthunt";
import type { FundingSignal } from "@/lib/funding/types";

import {
  selectAgentRepos,
} from "@/lib/agent-repos";

import type {
  RepoSliceLite,
  Top10Badge,
  Top10Bundle,
  Top10Item,
  Top10MetaStats,
  Top10Metric,
  Top10Window,
} from "./types";

// ---------------------------------------------------------------------------
// Avatar gradient — deterministic from the slug so a repo always paints the
// same colour across categories + share cards. Mockup uses 8 stops; we cycle
// through them by hash mod length.
// ---------------------------------------------------------------------------

const GRADIENTS: ReadonlyArray<[string, string]> = [
  ["#ff6b35", "#ffd24d"],
  ["#6366f1", "#a78bfa"],
  ["#22c55e", "#3ad6c5"],
  ["#1d9bf0", "#60a5fa"],
  ["#f472b6", "#ff4d4d"],
  ["#ffb547", "#ff6b35"],
  ["#3ad6c5", "#60a5fa"],
  ["#a78bfa", "#f472b6"],
  ["#ff4d4d", "#ffb547"],
  ["#60a5fa", "#a78bfa"],
];

function hashSlug(slug: string): number {
  // FNV-1a 32-bit — same family used in tier-list/url.ts; fine for color picks.
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h);
}

function gradientFor(slug: string): [string, string] {
  return GRADIENTS[hashSlug(slug) % GRADIENTS.length];
}

function avatarLetter(name: string): string {
  const first = (name || "?").trim().charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(first) ? first : "·";
}

// ---------------------------------------------------------------------------
// Optional decoration applied to every builder's output: the NEW ENTRY badge
// and the per-slug sparkline. Both are sourced from upstream snapshots
// (yesterday's top-10 + the per-slug ring buffer in `sparkline-store`).
// Pure transform — when the maps are empty/undefined the items pass through
// unchanged, so cold-start without snapshots stays renderable.
// ---------------------------------------------------------------------------

export interface BuildExtras {
  /** Slugs that were in the prior-day snapshot for this category. Items not
   *  in this set get the NEW badge. Undefined → skip the badge entirely. */
  priorTopSlugs?: Set<string>;
  /** slug → daily values for the trailing window. Caller controls window
   *  size via the read helper. Items with ≥ 2 points overwrite the existing
   *  sparkline; fewer points leave the field unchanged. */
  sparklines?: Map<string, number[]>;
}

function decorateItems(items: Top10Item[], extras?: BuildExtras): Top10Item[] {
  if (!extras) return items;
  const { priorTopSlugs, sparklines } = extras;
  // Skip the work entirely when there's nothing to decorate. A new pass costs
  // nothing functional but doubles the per-render work in dev hot-reload.
  if (!priorTopSlugs && !sparklines) return items;
  return items.map((item) => {
    let next: Top10Item = item;
    if (priorTopSlugs && !priorTopSlugs.has(item.slug)) {
      // Don't re-add NEW if the builder already set it (movers/news/funding
      // tag the top item HOT; NEW is a different signal that can co-exist).
      if (!item.badges.includes("NEW")) {
        next = { ...next, badges: [...next.badges, "NEW"] };
      }
    }
    if (sparklines) {
      const points = sparklines.get(item.slug);
      if (points && points.length >= 2) {
        next = { ...next, sparkline: points };
      }
    }
    return next;
  });
}

// ---------------------------------------------------------------------------
// Repo-derived helpers (REPOS, AGENTS, MOVERS).
// ---------------------------------------------------------------------------

function deltaFor(repo: Repo, window: Top10Window): number | undefined {
  const total = repo.stars || 0;
  // % change from "stars at window-ago" = delta / (total - delta). Falls back
  // to undefined when basis is missing so we don't paint a bogus 0%.
  const pickDelta = (
    raw: number,
    missing: boolean | undefined,
  ): number | undefined => {
    if (missing) return undefined;
    if (!Number.isFinite(raw)) return undefined;
    const baseline = total - raw;
    if (baseline <= 0) return undefined;
    return (raw / baseline) * 100;
  };

  switch (window) {
    case "24h":
      return pickDelta(repo.starsDelta24h, repo.starsDelta24hMissing);
    case "7d":
      return pickDelta(repo.starsDelta7d, repo.starsDelta7dMissing);
    case "30d":
      return pickDelta(repo.starsDelta30d, repo.starsDelta30dMissing);
    case "ytd":
      // No YTD field on Repo; fall back to 30d as the closest proxy.
      return pickDelta(repo.starsDelta30d, repo.starsDelta30dMissing);
  }
}

function badgesForRepo(repo: Repo): Top10Badge[] {
  const out: Top10Badge[] = [];
  const firing = repo.channelsFiring ?? 0;
  if (firing >= 5) out.push("FIRING_5");
  else if (firing === 4) out.push("FIRING_4");
  else if (firing === 3) out.push("FIRING_3");
  if (repo.movementStatus === "breakout") out.push("HOT");
  return out;
}

function repoToItem(repo: Repo, rank: number, window: Top10Window): Top10Item {
  const score = Math.max(
    0,
    Math.min(5, repo.crossSignalScore ?? (repo.momentumScore ?? 0) / 20),
  );
  return {
    rank,
    slug: repo.fullName,
    title: repo.name,
    owner: repo.owner,
    description: (repo.description || "").trim() || "—",
    avatarLetter: avatarLetter(repo.name),
    avatarGradient: gradientFor(repo.fullName),
    score,
    deltaPct: deltaFor(repo, window),
    sparkline: Array.isArray(repo.sparklineData)
      ? repo.sparklineData.slice(-14)
      : undefined,
    badges: badgesForRepo(repo),
    href: `/repo/${repo.owner}/${repo.name}`,
  };
}

// ---------------------------------------------------------------------------
// Stats strip — total movement / mean / hottest / coldest. Driven off the
// final 10 items so the labels track exactly what's on screen.
// ---------------------------------------------------------------------------

function buildMeta(items: Top10Item[], windowLabel: string): Top10MetaStats {
  const valid = items.filter((it) => typeof it.deltaPct === "number");
  const sumPct = valid.reduce((s, it) => s + (it.deltaPct ?? 0), 0);
  const meanScore =
    items.length === 0
      ? 0
      : items.reduce((s, it) => s + it.score, 0) / items.length;

  const newEntries = items.filter((it) => it.badges.includes("NEW")).length;
  const totalMovement = newEntries > 0
    ? `+${newEntries} new entries`
    : valid.length > 0
      ? `${sumPct >= 0 ? "+" : ""}${sumPct.toFixed(0)}% net`
      : "—";

  const hottest = [...valid].sort(
    (a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0),
  )[0];
  const coldest = [...valid].sort(
    (a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0),
  )[0];

  return {
    totalMovement,
    totalMovementSub: "vs. last week",
    meanScore: `${meanScore.toFixed(2)} / 5.0`,
    meanScoreSub: windowLabel,
    hottest: hottest ? hottest.slug : "—",
    hottestSub: hottest && hottest.deltaPct !== undefined
      ? `${hottest.deltaPct >= 0 ? "+" : ""}${hottest.deltaPct.toFixed(0)}% · ${windowLabel}`
      : "",
    coldest:
      coldest && coldest !== hottest && (coldest.deltaPct ?? 0) < 0
        ? coldest.slug
        : null,
    coldestSub:
      coldest && coldest.deltaPct !== undefined
        ? `${coldest.deltaPct.toFixed(0)}% · ${windowLabel}`
        : "",
  };
}

function windowLabel(w: Top10Window): string {
  return w === "24h" ? "24h" : w === "7d" ? "7d" : w === "30d" ? "30d" : "YTD";
}

// ---------------------------------------------------------------------------
// Metric-aware sort — drives REPOS / AGENTS / MOVERS column ordering when
// the user flips the METRIC chip. All four metrics return a "bigger = better"
// number, so the comparator just sorts desc on the picked function output.
// ---------------------------------------------------------------------------

function metricKey(repo: Repo, window: Top10Window, metric: Top10Metric): number {
  switch (metric) {
    case "stars":
      return repo.stars ?? 0;
    case "mentions":
      return repo.mentionCount24h ?? 0;
    case "velocity": {
      // Velocity = window-aligned trend score where available, else stars
      // delta as a proxy. Larger window → broader signal; same chip is
      // honoured across categories.
      const tsByWindow: Record<Top10Window, number | undefined> = {
        "24h": repo.trendScore24h,
        "7d": repo.trendScore7d,
        "30d": repo.trendScore30d,
        ytd: repo.trendScore30d,
      };
      const ts = tsByWindow[window];
      if (typeof ts === "number") return ts;
      const deltaByWindow: Record<Top10Window, number> = {
        "24h": repo.starsDelta24h ?? 0,
        "7d": repo.starsDelta7d ?? 0,
        "30d": repo.starsDelta30d ?? 0,
        ytd: repo.starsDelta30d ?? 0,
      };
      return deltaByWindow[window];
    }
    case "cross-signal":
    default:
      return repo.crossSignalScore ?? 0;
  }
}

// ---------------------------------------------------------------------------
// REPOS
// ---------------------------------------------------------------------------

export function buildRepoTop10(
  repos: Repo[],
  window: Top10Window = "7d",
  metric: Top10Metric = "cross-signal",
  extras?: BuildExtras,
): Top10Bundle {
  const sorted = [...repos]
    .filter((r) => !r.archived && !r.deleted)
    .sort(
      (a, b) =>
        metricKey(b, window, metric) - metricKey(a, window, metric) ||
        b.momentumScore - a.momentumScore,
    )
    .slice(0, 10);
  const items = decorateItems(
    sorted.map((r, i) => repoToItem(r, i + 1, window)),
    extras,
  );
  return {
    items,
    meta: buildMeta(items, windowLabel(window)),
    supportedWindows: ["24h", "7d", "30d", "ytd"],
    window,
  };
}

// ---------------------------------------------------------------------------
// AGENTS
// ---------------------------------------------------------------------------

export function buildAgentTop10(
  repos: Repo[],
  window: Top10Window = "7d",
  metric: Top10Metric = "cross-signal",
  extras?: BuildExtras,
): Top10Bundle {
  const sorted = selectAgentRepos(repos)
    .sort(
      (a, b) =>
        metricKey(b, window, metric) - metricKey(a, window, metric) ||
        b.momentumScore - a.momentumScore,
    )
    .slice(0, 10);
  const items = decorateItems(
    sorted.map((r, i) => repoToItem(r, i + 1, window)),
    extras,
  );
  return {
    items,
    meta: buildMeta(items, windowLabel(window)),
    supportedWindows: ["24h", "7d", "30d", "ytd"],
    window,
  };
}

// ---------------------------------------------------------------------------
// MOVERS — sorted by absolute delta % at the active window.
// ---------------------------------------------------------------------------

export function buildMoversTop10(
  repos: Repo[],
  window: Top10Window = "24h",
  extras?: BuildExtras,
): Top10Bundle {
  const candidates = repos
    .filter((r) => !r.archived && !r.deleted && (r.stars ?? 0) > 100)
    .map((r) => ({ repo: r, pct: deltaFor(r, window) }))
    .filter((x): x is { repo: Repo; pct: number } => typeof x.pct === "number")
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);
  const items = decorateItems(
    candidates.map((x, i) => ({
      ...repoToItem(x.repo, i + 1, window),
      deltaPct: x.pct,
    })),
    extras,
  );
  return {
    items,
    meta: buildMeta(items, windowLabel(window)),
    supportedWindows: ["24h", "7d", "30d"],
    window,
  };
}

// ---------------------------------------------------------------------------
// LLMS — Hugging Face trending models.
// ---------------------------------------------------------------------------

function llmDescription(m: HfModelTrending): string {
  const parts: string[] = [];
  if (m.pipelineTag) parts.push(m.pipelineTag);
  if (m.libraryName) parts.push(m.libraryName);
  if (parts.length === 0 && m.tags?.length) parts.push(m.tags.slice(0, 3).join(", "));
  if (parts.length === 0) return `Hugging Face model — ${m.id}`;
  return parts.join(" · ");
}

export function buildLlmTop10(
  models: HfModelTrending[],
  window: Top10Window = "7d",
  extras?: BuildExtras,
): Top10Bundle {
  const top = models.slice(0, 10);
  const items: Top10Item[] = decorateItems(
    top.map((m, i) => {
      const score = Math.max(0, Math.min(5, m.momentum / 20));
      const shortName = m.id.includes("/") ? m.id.split("/").slice(1).join("/") : m.id;
      return {
        rank: i + 1,
        slug: m.id,
        title: shortName,
        owner: m.author,
        description: llmDescription(m),
        avatarLetter: avatarLetter(shortName),
        avatarGradient: gradientFor(m.id),
        score,
        // HF is snapshot-only — no honest deltaPct yet. Leave undefined so the
        // chip + sparkline cell render as neutral.
        deltaPct: undefined,
        sparkline: undefined,
        badges: [],
        href: `/huggingface/${encodeURIComponent(m.id)}`,
      };
    }),
    extras,
  );
  return {
    items,
    meta: buildMeta(items, "snapshot"),
    supportedWindows: ["7d"], // snapshot — other chips disabled in UI
    window,
  };
}

// ---------------------------------------------------------------------------
// MCPS — top servers from the merged trending-mcp board.
// ---------------------------------------------------------------------------

function ecosystemToItem(
  it: EcosystemLeaderboardItem,
  rank: number,
  hrefPrefix: string,
): Top10Item {
  const score = Math.max(0, Math.min(5, (it.signalScore ?? 0) / 20));
  const shortName = it.title.split("/").slice(-1)[0] || it.title;
  const badges: Top10Badge[] = [];
  if (it.crossSourceCount >= 4) badges.push("FIRING_5");
  else if (it.crossSourceCount === 3) badges.push("FIRING_4");
  else if (it.crossSourceCount === 2) badges.push("FIRING_3");
  if (it.verified) badges.push("HOT");
  return {
    rank,
    slug: it.id,
    title: shortName,
    owner: it.author ?? undefined,
    description: (it.description || "").trim() || `${it.sourceLabel} · ${it.popularityLabel}`,
    avatarLetter: avatarLetter(shortName),
    avatarGradient: gradientFor(it.id),
    score,
    deltaPct: undefined,
    sparkline: undefined,
    badges,
    href: it.url || `${hrefPrefix}${encodeURIComponent(it.id)}`,
  };
}

export function buildMcpTop10(
  board: EcosystemBoard | null,
  window: Top10Window = "7d",
  extras?: BuildExtras,
): Top10Bundle {
  const top = (board?.items ?? []).slice(0, 10);
  const items = decorateItems(
    top.map((it, i) => ecosystemToItem(it, i + 1, "/mcp/")),
    extras,
  );
  return {
    items,
    meta: buildMeta(items, "7d"),
    supportedWindows: ["7d"],
    window,
  };
}

// ---------------------------------------------------------------------------
// SKILLS — combined skills board (skills.sh + GitHub topic + lobehub + ...).
// ---------------------------------------------------------------------------

export function buildSkillsTop10(
  board: EcosystemBoard | null,
  window: Top10Window = "7d",
  extras?: BuildExtras,
): Top10Bundle {
  const top = (board?.items ?? []).slice(0, 10);
  const items = decorateItems(
    top.map((it, i) => ecosystemToItem(it, i + 1, "/skills/")),
    extras,
  );
  return {
    items,
    meta: buildMeta(items, "7d"),
    supportedWindows: ["7d"],
    window,
  };
}

// ---------------------------------------------------------------------------
// NEWS — fused multi-source. Each source is normalized to 0–1 by per-source
// max, items are then sorted by the normalized score and capped at 10.
// ---------------------------------------------------------------------------

interface NormalizedNewsItem {
  source: "hn" | "bluesky" | "devto" | "lobsters" | "ph";
  id: string;
  title: string;
  url: string;
  author: string;
  raw: number; // raw source-specific engagement
  norm: number; // 0–1 within source
  publishedAt: number; // epoch ms
}

function normalizeBy<T>(arr: T[], pick: (x: T) => number): number[] {
  const max = arr.reduce((m, x) => Math.max(m, pick(x)), 0);
  if (max <= 0) return arr.map(() => 0);
  return arr.map((x) => Math.max(0, pick(x)) / max);
}

export function buildNewsTop10(
  input: {
    hn: HnStory[];
    bluesky: BskyPost[];
    devto: DevtoArticle[];
    lobsters: LobstersStory[];
    producthunt: Launch[];
  },
  extras?: BuildExtras,
): Top10Bundle {
  const hnNorm = normalizeBy(input.hn, (s) => s.trendingScore ?? s.score);
  const bskyNorm = normalizeBy(input.bluesky, (p) => p.trendingScore ?? p.likeCount + 2 * p.repostCount);
  const devNorm = normalizeBy(input.devto, (a) => a.trendingScore ?? a.reactionsCount);
  const lobNorm = normalizeBy(input.lobsters, (s) => s.trendingScore ?? s.score);
  const phNorm = normalizeBy(input.producthunt, (l) => l.votesCount);

  const merged: NormalizedNewsItem[] = [
    ...input.hn.map((s, i) => ({
      source: "hn" as const,
      id: `hn-${s.id}`,
      title: s.title,
      url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
      author: s.by,
      raw: s.trendingScore ?? s.score,
      norm: hnNorm[i] ?? 0,
      publishedAt: (s.createdUtc || 0) * 1000,
    })),
    ...input.bluesky.map((p, i) => ({
      source: "bluesky" as const,
      id: `bsky-${p.cid}`,
      title: p.text.length > 100 ? p.text.slice(0, 99) + "…" : p.text,
      url: p.bskyUrl,
      author: p.author?.handle ?? "bluesky",
      raw: p.trendingScore ?? 0,
      norm: bskyNorm[i] ?? 0,
      publishedAt: Date.parse(p.createdAt) || 0,
    })),
    ...input.devto.map((a, i) => ({
      source: "devto" as const,
      id: `devto-${a.id}`,
      title: a.title,
      url: a.url,
      author: a.author?.username ?? "devto",
      raw: a.trendingScore ?? a.reactionsCount,
      norm: devNorm[i] ?? 0,
      publishedAt: Date.parse(a.publishedAt) || 0,
    })),
    ...input.lobsters.map((s, i) => ({
      source: "lobsters" as const,
      id: `lob-${s.shortId}`,
      title: s.title,
      url: s.url || s.commentsUrl,
      author: s.by,
      raw: s.trendingScore ?? s.score,
      norm: lobNorm[i] ?? 0,
      publishedAt: (s.createdUtc || 0) * 1000,
    })),
    ...input.producthunt.map((l, i) => ({
      source: "ph" as const,
      id: `ph-${l.id}`,
      title: `${l.name} — ${l.tagline || ""}`.trim().replace(/\s+—\s+$/, ""),
      url: l.url,
      author: l.makers?.[0]?.username ?? "producthunt",
      raw: l.votesCount,
      norm: phNorm[i] ?? 0,
      publishedAt: Date.parse(l.createdAt) || 0,
    })),
  ];

  // Dedupe by canonical URL — same article surfaced on multiple sources keeps
  // the highest normalized score.
  const seen = new Map<string, NormalizedNewsItem>();
  for (const it of merged) {
    const key = canonicalUrl(it.url);
    const prev = seen.get(key);
    if (!prev || prev.norm < it.norm) seen.set(key, it);
  }

  const top = [...seen.values()]
    .sort((a, b) => b.norm - a.norm || b.publishedAt - a.publishedAt)
    .slice(0, 10);

  const sourceLabel: Record<NormalizedNewsItem["source"], string> = {
    hn: "Hacker News",
    bluesky: "Bluesky",
    devto: "dev.to",
    lobsters: "Lobsters",
    ph: "Product Hunt",
  };

  const items: Top10Item[] = decorateItems(
    top.map((n, i) => ({
      rank: i + 1,
      slug: n.id,
      title: n.title || "(untitled)",
      owner: sourceLabel[n.source],
      description: `${sourceLabel[n.source]} · ${n.author} · score ${Math.round(n.raw)}`,
      avatarLetter: sourceLabel[n.source].charAt(0),
      avatarGradient: gradientFor(n.id),
      score: Math.max(0, Math.min(5, n.norm * 5)),
      deltaPct: undefined,
      sparkline: undefined,
      badges: i === 0 ? (["HOT"] as Top10Badge[]) : [],
      href: n.url,
    })),
    extras,
  );

  return {
    items,
    meta: buildMeta(items, "24h"),
    supportedWindows: ["24h", "7d"],
    window: "24h",
  };
}

function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// FUNDING — top 10 funding signals this week, ranked by amount (with recency
// fallback when amount is missing).
// ---------------------------------------------------------------------------

export function buildFundingTop10(
  signals: FundingSignal[],
  extras?: BuildExtras,
): Top10Bundle {
  const sorted = [...signals]
    .sort((a, b) => {
      const aAmt = a.extracted?.amount ?? 0;
      const bAmt = b.extracted?.amount ?? 0;
      if (aAmt !== bAmt) return bAmt - aAmt;
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    })
    .slice(0, 10);

  // Amount-based normalization: 0–5 scale by amount-vs-max within this slice.
  const maxAmt = sorted.reduce(
    (m, s) => Math.max(m, s.extracted?.amount ?? 0),
    0,
  );

  const items: Top10Item[] = decorateItems(
    sorted.map((s, i) => {
      const company =
        s.extracted?.companyName ?? s.headline.split("—")[0]?.trim() ?? s.headline;
      const round = s.extracted?.roundType ?? "round";
      const amt = s.extracted?.amount ?? 0;
      const amountLabel = s.extracted?.amountDisplay ?? "—";
      const score = maxAmt > 0 ? Math.max(0, Math.min(5, (amt / maxAmt) * 5)) : 0;
      return {
        rank: i + 1,
        slug: s.id,
        title: company,
        owner: round,
        description: `${amountLabel} · ${round} · ${s.sourcePlatform}`,
        avatarLetter: avatarLetter(company),
        avatarGradient: gradientFor(s.id),
        score,
        deltaPct: undefined,
        sparkline: undefined,
        badges: i === 0 ? (["HOT"] as Top10Badge[]) : [],
        href: s.sourceUrl,
      };
    }),
    extras,
  );

  return {
    items,
    meta: buildMeta(items, "7d"),
    supportedWindows: ["7d"],
    window: "7d",
  };
}

// ---------------------------------------------------------------------------
// Empty-state bundle (used when a reader returns nothing).
// ---------------------------------------------------------------------------

export function emptyBundle(window: Top10Window = "7d"): Top10Bundle {
  return {
    items: [],
    meta: {
      totalMovement: "—",
      meanScore: "—",
      hottest: "—",
      coldest: null,
    },
    supportedWindows: [window],
    window,
  };
}

// ---------------------------------------------------------------------------
// Slice helpers — server pre-trims a Repo[] to RepoSliceLite[] (top 80 by
// momentum), and the client recomputes REPOS / AGENTS / MOVERS bundles from
// it on window/metric changes. The lite shape carries every field the three
// builders read, so a structural cast is sufficient — no behavior change.
// ---------------------------------------------------------------------------

export function reposToSlice(repos: Repo[], limit = 80): RepoSliceLite[] {
  return repos
    .filter((r) => !r.archived && !r.deleted)
    .slice(0, limit)
    .map((r) => ({
      fullName: r.fullName,
      name: r.name,
      owner: r.owner,
      description: r.description,
      stars: r.stars,
      starsDelta24h: r.starsDelta24h,
      starsDelta7d: r.starsDelta7d,
      starsDelta30d: r.starsDelta30d,
      starsDelta24hMissing: r.starsDelta24hMissing ?? false,
      starsDelta7dMissing: r.starsDelta7dMissing ?? false,
      starsDelta30dMissing: r.starsDelta30dMissing ?? false,
      trendScore24h: r.trendScore24h,
      trendScore7d: r.trendScore7d,
      trendScore30d: r.trendScore30d,
      crossSignalScore: r.crossSignalScore ?? 0,
      channelsFiring: r.channelsFiring ?? 0,
      momentumScore: r.momentumScore,
      movementStatus: r.movementStatus,
      sparklineData: Array.isArray(r.sparklineData)
        ? r.sparklineData.slice(-14)
        : [],
      mentionCount24h: r.mentionCount24h ?? 0,
      archived: r.archived ?? false,
      deleted: r.deleted ?? false,
      isAgent: false, // server fills this in via selectAgentRepos before slicing
    }));
}

/**
 * Cast `RepoSliceLite[]` to `Repo[]` for the existing builders. The lite
 * shape carries every field the builders read; missing fields (e.g.
 * collectionNames) aren't accessed on REPOS/AGENTS/MOVERS paths. Centralised
 * here so the unsafe-cast lives in one place.
 */
function sliceAsRepos(slice: RepoSliceLite[]): Repo[] {
  return slice as unknown as Repo[];
}

export function buildRepoTop10FromSlice(
  slice: RepoSliceLite[],
  window: Top10Window,
  metric: Top10Metric,
): Top10Bundle {
  return buildRepoTop10(sliceAsRepos(slice), window, metric);
}

export function buildAgentTop10FromSlice(
  slice: RepoSliceLite[],
  window: Top10Window,
  metric: Top10Metric,
): Top10Bundle {
  // The slice is already pre-filtered server-side. Use the same builder so
  // the comparator + repoToItem behaviour matches the SSR path exactly.
  const agents = slice.filter((r) => r.isAgent);
  return buildRepoTop10(sliceAsRepos(agents), window, metric);
}

export function buildMoversTop10FromSlice(
  slice: RepoSliceLite[],
  window: Top10Window,
): Top10Bundle {
  return buildMoversTop10(sliceAsRepos(slice), window);
}
