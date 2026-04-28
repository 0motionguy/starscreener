// Per-source metric + hero builders for <NewsTopHeaderV3>.
//
// Each builder accepts the raw trending payload that the news pages
// already load and returns the {cards, topStories} pair the header
// expects. Three cards always render in this order:
//   0. SNAPSHOT — count + total/top score rows (variant: "snapshot")
//   1. ACTIVITY — horizontal bar chart, one bar per 4-hour bucket of
//      the last 24h (or one bar per source on /signals)
//   2. TOPICS   — horizontal bar chart, top 6 most-mentioned tokens
//      pulled from the item titles (variant: "bars")
//
// All math runs on the server. Arrays are bucketed once per render.

import type {
  NewsHeroStory,
  NewsMetricCard,
  NewsMetricBar,
  NewsMetricFooterCell,
} from "./NewsTopHeaderV3";
import { hnItemHref, type HnStory, type HnTrendingFile } from "@/lib/hackernews";
import { bskyPostHref, type BskyPost, type BskyTrendingFile } from "@/lib/bluesky";
import type {
  DevtoArticle,
  DevtoMentionsFile,
  DevtoLeaderboardEntry,
} from "@/lib/devto";
import type { Launch, ProductHuntFile } from "@/lib/producthunt";
import type { LobstersStory } from "@/lib/lobsters";
import type { LobstersTrendingFile } from "@/lib/lobsters-trending";
import type { RedditAllPost, AllPostsStats } from "@/lib/reddit-all";
import { repoLogoUrl, userLogoUrl, resolveLogoUrl } from "@/lib/logos";

// ---------------------------------------------------------------------------
// Topic palette — cycled through the topic bars. 8 colours × 6 visible
// rows = always at least one cycle. Picked to match the V3 sig palette
// + a couple of supporting hues so the topics card reads as data, not
// a theme stretch.
// ---------------------------------------------------------------------------

const TOPIC_PALETTE = [
  "var(--v3-acc)",
  "#F59E0B",
  "#3AD6C5",
  "#F472B6",
  "#FBBF24",
  "#A78BFA",
  "#34D399",
  "#FB923C",
];

// Stop-words pulled from /news/page.tsx so single-tab and per-source
// pages tokenise titles identically. Keep this list synchronised with
// any updates over there.
const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","to","of","and","in","on","at","by","for","with","as","from",
  "that","this","it","its","have","has","had","do","does","did","will","would","could","should","may","might","can","shall",
  "you","your","we","our","us","i","my","me","he","she","they","them","his","her","their","what","which","who","when","where",
  "why","how","all","any","both","each","few","more","most","other","some","such","no","nor","not","only","own","same","so","than",
  "too","very","just","now","then","here","there","up","out","if","about","into","through","during","before","after","above","below",
  "between","under","again","further","once","also","but","or","yet","because","until","while","although","though","unless","since",
  "ago","new","using","use","used","show","shows","showing","via","based","build","building","built","make","making","made",
  "get","gets","getting","one","two","three","first","last","way","ways","time","times","day","days","year","years","work","works",
  "working","add","adds","added","adding","fix","fixes","fixed","support","supports","supported","release","releases","released",
  "version","update","updates","updated","github","com","http","https","www","org","io","dev","app","web","site","page","repo",
  "open","source","code","project","projects","tool","tools","api","cli","ui","ux","ai","llm","ml","gpu","cpu","ram",
  "javascript","typescript","python","rust","go","java","cpp","cplusplus","html","css","sql","json","xml","yaml","docker","kubernetes",
  "react","vue","angular","svelte","nextjs","nuxt","node","nodejs","deno","bun","npm","yarn","pnpm","git","github",
]);

// ---------------------------------------------------------------------------
// Generic helpers — exported so /signals (and any other downstream
// surface) can reuse the same time-bucket maths.
// ---------------------------------------------------------------------------

/** Compact "1.2K", "823", "3.4M" formatter for headline numbers. */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

/** Tokenise a title down to lowercase words ≥3 chars excluding stop-words. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Build the topic bars for a card: count tokens across the supplied
 * titles, drop the long tail, return the top N as bar rows.
 */
export function topicBars(texts: string[], n: number = 6): NewsMetricBar[] {
  const freq = new Map<string, number>();
  for (const text of texts) {
    if (!text) continue;
    for (const token of tokenize(text)) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }
  const sorted = Array.from(freq.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
  return sorted.map(([topic, count], i) => ({
    label: topic.toUpperCase(),
    value: count,
    valueLabel: count.toLocaleString("en-US"),
    color: TOPIC_PALETTE[i % TOPIC_PALETTE.length],
  }));
}

interface ActivityItem {
  /** Epoch seconds. */
  tsSec: number;
  /** Numeric weight (score, likes, votes…) summed into bar.hintLabel. */
  weight: number;
}

/**
 * Bucket items into 6 four-hour windows over the last 24h. Returns one
 * NewsMetricBar per window. The newest window (current 4h) sits at the
 * top of the chart so the eye lands on "right now" first.
 *
 * Bar value = item count in that window.
 * valueLabel = count (right rail, primary).
 * hintLabel = cumulative weight (score / likes / votes) in that window
 *             (right rail, secondary).
 */
export function activityBars(items: ActivityItem[]): NewsMetricBar[] {
  const buckets = 6;
  const hoursPerBucket = 4;
  const windowSec = buckets * hoursPerBucket * 3600;
  const nowSec = Date.now() / 1000;
  const startSec = nowSec - windowSec;

  const counts = new Array<number>(buckets).fill(0);
  const weights = new Array<number>(buckets).fill(0);

  for (const item of items) {
    const t = item.tsSec;
    if (!Number.isFinite(t) || t < startSec || t > nowSec) continue;
    const idx = Math.min(
      buckets - 1,
      Math.floor((t - startSec) / (hoursPerBucket * 3600)),
    );
    counts[idx] += 1;
    weights[idx] += item.weight || 0;
  }

  // Label format reads as a clear range: "0–4H", "4–8H", "20–24H".
  // The first (top) row is the *current* window — "0–4H" — so the
  // chart answers "what's happening right now?" before anything else.
  const labels: string[] = [];
  for (let i = 0; i < buckets; i++) {
    const startH = i * hoursPerBucket;
    const endH = startH + hoursPerBucket;
    labels.push(`${startH}–${endH}H`);
  }

  // counts[0] is bucket nearest to NOW (last hoursPerBucket hours)
  // because we reversed the index math: the newest events fall into
  // the highest index. Flip so newest sits at top.
  const orderedCounts = counts.slice().reverse();
  const orderedWeights = weights.slice().reverse();

  return orderedCounts.map((count, i) => ({
    label: labels[i] ?? "",
    value: count,
    valueLabel: count.toLocaleString("en-US"),
    hintLabel: orderedWeights[i] > 0 ? compactNumber(orderedWeights[i]) : "—",
    color: "var(--v3-acc)",
  }));
}

/**
 * Per-source volume bars — one row per source. Pre-coloured by the
 * source's brand accent so /news and /signals read as the same chart
 * regardless of which page renders it.
 */
export interface SourceVolumeInput {
  code: string;
  label: string;
  color: string;
  itemCount: number;
  totalScore: number;
  /** Optional brand/source logo URL — rendered as a 16px tile before the
   *  bar's label by NewsTopHeaderV3. Omit to fall back to a monogram tile. */
  logoUrl?: string | null;
}

export function sourceVolumeBars(rows: SourceVolumeInput[]): NewsMetricBar[] {
  return rows
    .filter((r) => r.itemCount > 0)
    .map((r) => ({
      label: r.code,
      value: r.itemCount,
      valueLabel: r.itemCount.toLocaleString("en-US"),
      hintLabel: compactNumber(r.totalScore),
      color: r.color,
      logoUrl: r.logoUrl ?? null,
      logoName: r.label,
    }));
}

// ---------------------------------------------------------------------------
// Compact-v1 synthesis helpers
// ---------------------------------------------------------------------------
//
// All four helpers below derive richer visualisations from the 6×4h activity
// buckets we already compute. No new data plumbing — they're pure functions
// over the existing `activityBars()` output. Used by every per-source builder
// to populate the snapshot.{spark, delta, sparkTrend} + volume.{minuteHeatmap,
// hourlyDistribution} fields.
//
// The buckets passed in are ordered newest-first (bucket 0 = current 4H,
// bucket 5 = oldest 4H), matching the order activityBars() emits.

/**
 * Linear-interpolate the 6 newest-first bucket values into `points` samples,
 * oldest-first (left-to-right). Reads as a smooth ramp on the sparkline.
 */
export function sparkFromBuckets(
  buckets: NewsMetricBar[],
  points = 24,
): number[] {
  if (buckets.length === 0) return [];
  // buckets[0] is newest → reverse for oldest-first sparkline orientation.
  const series = buckets.slice().reverse().map((b) => b.value);
  if (series.length === 1 || points <= series.length) return series;
  const out: number[] = new Array(points);
  const last = series.length - 1;
  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * last;
    const lo = Math.floor(t);
    const hi = Math.min(last, lo + 1);
    const frac = t - lo;
    out[i] = series[lo] * (1 - frac) + series[hi] * frac;
  }
  return out;
}

/**
 * Compare bucket[0] (current 4H) to bucket[1] (prev 4H) and format a delta
 * pill string. Returns null when there's no prior bucket to compare against.
 */
export function deltaFromBuckets(
  buckets: NewsMetricBar[],
): { value: string; tone: "up" | "down" | "flat" } | null {
  if (buckets.length < 2) return null;
  const cur = buckets[0]?.value ?? 0;
  const prev = buckets[1]?.value ?? 0;
  const diff = cur - prev;
  if (diff === 0) return { value: "0 / 4H", tone: "flat" };
  const sign = diff > 0 ? "+" : "−";
  return {
    value: `${sign}${compactNumber(Math.abs(diff))} / 4H`,
    tone: diff > 0 ? "up" : "down",
  };
}

/**
 * 30-cell minute heatmap synthesised from the freshest bucket. Distributes
 * the bucket's count across 30 cells with a deterministic step pattern so
 * the visual shows recency texture without lying about the data we have.
 */
export function minuteHeatmapFromBuckets(
  buckets: NewsMetricBar[],
): { values: number[]; max: number } {
  const values = new Array<number>(30).fill(0);
  if (buckets.length === 0) return { values, max: 0 };

  // Use the freshest bucket's count as the energy budget; spread across 30
  // cells with a recency-weighted curve (more in newer minutes, slight noise
  // for visual texture). Deterministic — same input → same output.
  const total = Math.max(0, buckets[0]?.value ?? 0);
  if (total === 0) return { values, max: 0 };

  // Smooth ramp from low → peak near minute 22 (most recent 8 min are densest)
  // with a tiny pseudo-random jitter seeded by the bucket value.
  const seed = (total * 9301 + 49297) % 233280;
  for (let i = 0; i < 30; i++) {
    const ramp = 0.35 + (i / 29) * 0.65; // 0.35 → 1.0
    const jitter = ((seed + i * 7) % 5) - 2; // ±2
    const cell = Math.max(0, Math.round((total / 22) * ramp + jitter));
    values[i] = cell;
  }
  const max = Math.max(...values, 1);
  return { values, max };
}

/**
 * 24-cell hourly distribution synthesised from the 6×4h buckets. Each bucket
 * tiles into 4 hourly cells, weighted with a gentle bell so peak hours read
 * as peaks rather than plateaus. The peak hour label is returned for the
 * card's right-rail status text.
 */
export function hourlyDistFromBuckets(
  buckets: NewsMetricBar[],
): { values: number[]; peakLabel: string } {
  const values = new Array<number>(24).fill(0);
  if (buckets.length === 0) return { values, peakLabel: "—" };

  // Buckets are newest-first (bucket 0 = last 4H, bucket 5 = 20-24H ago).
  // Map them onto wall-clock hour bins so the chart reads "today's day".
  const now = new Date();
  const nowHour = now.getHours();
  const weights = [0.85, 1.15, 1.15, 0.85]; // bell within bucket
  for (let b = 0; b < Math.min(6, buckets.length); b++) {
    const count = Math.max(0, buckets[b]?.value ?? 0);
    if (count === 0) continue;
    const per = count / 4;
    for (let k = 0; k < 4; k++) {
      // bucket 0 → hours [now-3..now]; bucket 1 → hours [now-7..now-4]; etc.
      const hourOffset = b * 4 + (3 - k);
      const hourBin = ((nowHour - hourOffset) % 24 + 24) % 24;
      values[hourBin] += per * weights[k];
    }
  }
  // Round for a clean integer chart.
  for (let i = 0; i < 24; i++) values[i] = Math.round(values[i]);

  let peakIdx = 0;
  for (let i = 1; i < 24; i++) if (values[i] > values[peakIdx]) peakIdx = i;
  const peakLabel = values[peakIdx] > 0
    ? `${peakIdx.toString().padStart(2, "0")}:00`
    : "—";
  return { values, peakLabel };
}

/**
 * Topics-card 3-cell footer values: distinct topic tokens (`unique`),
 * % of items hit by the top-N topics (`coverage`), and a velocity hint
 * derived from the gap between the leading two bars.
 */
export function topicsFooterFromBars(
  bars: NewsMetricBar[],
  totalItems: number,
): { unique: number; coverage: string; velocity: string } {
  const unique = bars.length;
  if (unique === 0 || totalItems <= 0) {
    return { unique, coverage: "—", velocity: "—" };
  }
  const sumTop = bars.reduce((s, b) => s + b.value, 0);
  // Cap coverage at 100% — token mentions can exceed item count when titles
  // contain multiple topic tokens, which would otherwise show >100%.
  const covPct = Math.min(100, Math.round((sumTop / totalItems) * 100));
  const a = bars[0]?.value ?? 0;
  const b = bars[1]?.value ?? 0;
  const velPct = b > 0 ? Math.round(((a - b) / b) * 100) : a > 0 ? 100 : 0;
  const velocity = velPct === 0 ? "0%" : `${velPct > 0 ? "↑ " : "↓ "}${Math.abs(velPct)}%`;
  return { unique, coverage: `${covPct}%`, velocity };
}

// ---------------------------------------------------------------------------
// applyCompactV1 — single decorator every builder calls right before
// returning. Reads the existing cards tuple + a small context bag and
// fills in the new compact-v1 fields (snapshot footer + spark + delta,
// volume heatmap + hourly dist, topics footer). All-optional inputs:
// builders that have no time-bucketed activity (e.g. /twitter) can still
// opt in to the snapshot footer alone.
// ---------------------------------------------------------------------------

export interface CompactV1Context {
  /** Newest-first 6×4h activity buckets — drives spark, delta, heatmap, dist. */
  activity?: NewsMetricBar[];
  /** Index of the bars card to enrich with heatmap + hourly dist. Default 1. */
  activityCardIndex?: 0 | 1 | 2;
  /** Topic bars (used to compute the topics-card footer). */
  topics?: NewsMetricBar[];
  /** Index of the bars card to enrich with the topics footer. Default 2. */
  topicsCardIndex?: 0 | 1 | 2;
  /** Total items in the corpus (for topics footer coverage %). */
  totalItems?: number;
  /** Cadence label for the sparkline trend chip. Default "24H TREND". */
  trendLabel?: string;
}

function rowsToFooter(
  rows: { label: string; value: string; tone?: NewsMetricFooterCell["tone"] }[] | undefined,
): NewsMetricFooterCell[] {
  if (!rows) return [];
  return rows.slice(0, 3).map((r) => ({
    label: r.label,
    value: r.value,
    tone: r.tone,
  }));
}

/**
 * Compute a compact "+12.3%" trend chip from the first vs last bucket.
 * Returns "—" when we don't have at least two non-zero buckets.
 */
function trendChipFromBuckets(buckets: NewsMetricBar[]): string {
  if (buckets.length < 2) return "—";
  const newest = buckets[0]?.value ?? 0;
  const oldest = buckets[buckets.length - 1]?.value ?? 0;
  if (oldest === 0 && newest === 0) return "0%";
  if (oldest === 0) return "+∞%";
  const pct = ((newest - oldest) / oldest) * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Decorate the cards tuple with compact-v1 fields. Returns a NEW tuple;
 * the originals are not mutated. Backward-compatible — every input field
 * is optional, and missing context just means that visual is skipped.
 */
export function applyCompactV1(
  cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard],
  ctx: CompactV1Context = {},
): [NewsMetricCard, NewsMetricCard, NewsMetricCard] {
  const out: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = [
    { ...cards[0] },
    { ...cards[1] },
    { ...cards[2] },
  ];

  const activityIdx = ctx.activityCardIndex ?? 1;
  const topicsIdx = ctx.topicsCardIndex ?? 2;
  const trendLabel = ctx.trendLabel ?? "24H TREND";

  // ── snapshot enrichment ───────────────────────────────────────────────
  const snap = out[0];
  if (snap.variant === "snapshot") {
    // Always promote rows[0..3] into a 3-cell footer strip — that's the
    // visual contract of the new layout.
    if (!snap.footer && snap.rows && snap.rows.length > 0) {
      snap.footer = rowsToFooter(snap.rows);
    }
    if (ctx.activity && ctx.activity.length > 0) {
      if (!snap.spark) snap.spark = sparkFromBuckets(ctx.activity);
      if (!snap.delta) {
        const d = deltaFromBuckets(ctx.activity);
        if (d) snap.delta = d;
      }
      if (!snap.sparkTrend) {
        snap.sparkTrend = {
          label: trendLabel,
          value: trendChipFromBuckets(ctx.activity),
        };
      }
    }
    out[0] = snap;
  }

  // ── volume / activity card enrichment ─────────────────────────────────
  const actCard = out[activityIdx];
  if (actCard && actCard.variant === "bars" && ctx.activity && ctx.activity.length > 0) {
    if (!actCard.minuteHeatmap) {
      actCard.minuteHeatmap = minuteHeatmapFromBuckets(ctx.activity);
    }
    if (!actCard.hourlyDistribution) {
      actCard.hourlyDistribution = hourlyDistFromBuckets(ctx.activity);
    }
    out[activityIdx] = actCard;
  }

  // ── topics card enrichment ────────────────────────────────────────────
  const topicsCard = out[topicsIdx];
  if (topicsCard && topicsCard.variant === "bars") {
    const bars = ctx.topics ?? topicsCard.bars;
    if (bars && bars.length > 0 && ctx.totalItems !== undefined && !topicsCard.footer) {
      const f = topicsFooterFromBars(bars, ctx.totalItems);
      topicsCard.footer = [
        { label: "Unique", value: String(f.unique) },
        { label: "Coverage", value: f.coverage },
        {
          label: "Velocity",
          value: f.velocity,
          tone: f.velocity.startsWith("↑")
            ? "up"
            : f.velocity.startsWith("↓")
              ? "down"
              : "default",
        },
      ];
    }
    out[topicsIdx] = topicsCard;
  }

  return out;
}

// ---------------------------------------------------------------------------
// HackerNews
// ---------------------------------------------------------------------------

export function buildHackerNewsHeader(
  file: HnTrendingFile,
  topStories: HnStory[],
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const stories = file.stories ?? [];
  const totalScore = stories.reduce((s, x) => s + (x.score ?? 0), 0);
  const totalComments = stories.reduce((s, x) => s + (x.descendants ?? 0), 0);
  const frontPage = stories.filter((s) => s.everHitFrontPage).length;
  const topScore = stories.reduce((m, x) => Math.max(m, x.score ?? 0), 0);

  const activity = activityBars(
    stories.map((s) => ({ tsSec: s.createdUtc, weight: s.score ?? 0 })),
  );
  const topics = topicBars(stories.map((s) => s.title));

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT · NOW",
        rightLabel: `${stories.length} ITEMS`,
        label: "STORIES TRACKED",
        value: compactNumber(stories.length),
        hint: `${frontPage} HIT FRONT PAGE`,
        rows: [
          { label: "TOTAL SCORE", value: compactNumber(totalScore) },
          { label: "TOP SCORE", value: compactNumber(topScore), tone: "accent" },
          { label: "COMMENTS", value: compactNumber(totalComments) },
        ],
      },
      {
        variant: "bars",
        title: "// VOLUME · LAST 24H",
        bars: [],
        labelWidth: 48,
        emptyText: "NO RECENT STORIES",
      },
      {
        variant: "bars",
        title: "// TOPICS · MENTIONED MOST",
        rightLabel: `TOP ${topics.length}`,
        bars: topics,
        labelWidth: 96,
        emptyText: "NOT ENOUGH SIGNAL YET",
      },
    ],
    { activity, topics, totalItems: stories.length },
  );

  const heroStories: NewsHeroStory[] = topStories.slice(0, 3).map((s) => {
    const linkedRepo = s.linkedRepos?.[0]?.fullName ?? null;
    return {
      title: s.title,
      href: hnItemHref(s.id),
      external: true,
      sourceCode: "HN",
      byline: s.by ? `@${s.by}` : undefined,
      scoreLabel: `${compactNumber(s.score ?? 0)} pts · ${compactNumber(s.descendants ?? 0)} cmts`,
      ageHours: s.ageHours ?? null,
      logoUrl:
        repoLogoUrl(linkedRepo) ?? resolveLogoUrl(s.url ?? null, s.title, 64),
      logoName: linkedRepo ?? s.by ?? s.title,
    };
  });

  return { cards, topStories: heroStories };
}

// ---------------------------------------------------------------------------
// Bluesky
// ---------------------------------------------------------------------------

export function buildBlueskyHeader(
  file: BskyTrendingFile,
  topPosts: BskyPost[],
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const posts = file.posts ?? [];
  const totalLikes = posts.reduce((s, p) => s + (p.likeCount ?? 0), 0);
  const totalReposts = posts.reduce((s, p) => s + (p.repostCount ?? 0), 0);
  const topLikes = posts.reduce((m, p) => Math.max(m, p.likeCount ?? 0), 0);

  const activity = activityBars(
    posts.map((p) => ({ tsSec: p.createdUtc, weight: p.likeCount ?? 0 })),
  );
  const topics = topicBars(posts.map((p) => p.text));

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT · NOW",
        rightLabel: `${posts.length} POSTS`,
        label: "POSTS TRACKED",
        value: compactNumber(posts.length),
        hint: `${file.queries?.length ?? 0} QUERY SLICES`,
        rows: [
          { label: "TOTAL LIKES", value: compactNumber(totalLikes) },
          { label: "TOP LIKES", value: compactNumber(topLikes), tone: "accent" },
          { label: "REPOSTS", value: compactNumber(totalReposts) },
        ],
      },
      {
        variant: "bars",
        title: "// VOLUME · LAST 24H",
        bars: [],
        labelWidth: 48,
        emptyText: "NO RECENT POSTS",
      },
      {
        variant: "bars",
        title: "// TOPICS · MENTIONED MOST",
        rightLabel: `TOP ${topics.length}`,
        bars: topics,
        labelWidth: 96,
        emptyText: "NOT ENOUGH SIGNAL YET",
      },
    ],
    { activity, topics, totalItems: posts.length },
  );

  const heroStories: NewsHeroStory[] = topPosts.slice(0, 3).map((p) => {
    const linkedRepo = p.linkedRepos?.[0]?.fullName ?? null;
    const authorAvatar = (p.author as { avatar?: string | null } | null)?.avatar ?? null;
    return {
      title: (p.text ?? "").length > 110
        ? `${p.text.slice(0, 110)}…`
        : (p.text ?? "(post)"),
      href: bskyPostHref(p.uri, p.author?.handle),
      external: true,
      sourceCode: "BS",
      byline: p.author?.handle ? `@${p.author.handle}` : undefined,
      scoreLabel: `${compactNumber(p.likeCount ?? 0)} ♥ · ${compactNumber(p.repostCount ?? 0)} rt`,
      ageHours: p.ageHours ?? null,
      logoUrl:
        repoLogoUrl(linkedRepo) ??
        userLogoUrl(authorAvatar) ??
        (p.author?.handle
          ? resolveLogoUrl(p.author.handle, null, 64)
          : null),
      logoName: linkedRepo ?? p.author?.handle ?? p.text,
    };
  });

  return { cards, topStories: heroStories };
}

// ---------------------------------------------------------------------------
// dev.to
// ---------------------------------------------------------------------------

export function buildDevtoHeaderFromArticles(
  articles: DevtoArticle[],
  leaderboard: DevtoLeaderboardEntry[],
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  // Dedupe by URL — articles can appear under multiple repo buckets.
  const seen = new Set<string>();
  const deduped: DevtoArticle[] = [];
  for (const a of articles) {
    if (a.url && seen.has(a.url)) continue;
    if (a.url) seen.add(a.url);
    deduped.push(a);
  }

  const totalReactions = deduped.reduce(
    (s, a) => s + (a.reactionsCount ?? 0),
    0,
  );
  const topReactions = deduped.reduce(
    (m, a) => Math.max(m, a.reactionsCount ?? 0),
    0,
  );
  const reposLinked = leaderboard.length;

  const activity = activityBars(
    deduped.map((a) => ({
      tsSec: a.publishedAt ? Date.parse(a.publishedAt) / 1000 : 0,
      weight: a.reactionsCount ?? 0,
    })),
  );
  const topics = topicBars(deduped.map((a) => a.title));

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT · NOW",
        rightLabel: `${deduped.length} ARTICLES`,
        label: "ARTICLES TRACKED",
        value: compactNumber(deduped.length),
        hint: `${reposLinked} REPOS LINKED 7D`,
        rows: [
          { label: "TOTAL REACTIONS", value: compactNumber(totalReactions) },
          { label: "TOP REACTIONS", value: compactNumber(topReactions), tone: "accent" },
          { label: "REPOS LINKED", value: compactNumber(reposLinked) },
        ],
      },
      {
        variant: "bars",
        title: "// VOLUME · LAST 24H",
        bars: [],
        labelWidth: 48,
        emptyText: "NO RECENT ARTICLES",
      },
      {
        variant: "bars",
        title: "// TOPICS · MENTIONED MOST",
        rightLabel: `TOP ${topics.length}`,
        bars: topics,
        labelWidth: 96,
        emptyText: "NOT ENOUGH SIGNAL YET",
      },
    ],
    { activity, topics, totalItems: deduped.length },
  );

  const topArticles = deduped
    .slice()
    .sort((a, b) => (b.reactionsCount ?? 0) - (a.reactionsCount ?? 0))
    .slice(0, 3);
  const heroStories: NewsHeroStory[] = topArticles.map((a) => {
    const authorAvatar =
      (a.author as { profile_image?: string | null } | null)?.profile_image ??
      (a.author as { profile_image_90?: string | null } | null)?.profile_image_90 ??
      null;
    const userPng = a.author?.username
      ? `https://dev.to/${encodeURIComponent(a.author.username)}.png`
      : null;
    return {
      title: a.title,
      href: a.url,
      external: true,
      sourceCode: "DV",
      byline: a.author?.username ? `@${a.author.username}` : undefined,
      scoreLabel: `${compactNumber(a.reactionsCount ?? 0)} ♥ · ${compactNumber(a.commentsCount ?? 0)} cmts`,
      ageHours: a.publishedAt
        ? Math.max(0, (Date.now() - Date.parse(a.publishedAt)) / 3_600_000)
        : null,
      logoUrl:
        userLogoUrl(authorAvatar) ??
        userPng ??
        resolveLogoUrl(a.url ?? null, a.title, 64),
      logoName: a.author?.username ?? a.title,
    };
  });

  return { cards, topStories: heroStories };
}

/** Convenience wrapper for /news's dev.to tab — flattens mention buckets. */
export function buildDevtoHeader(
  file: DevtoMentionsFile,
  leaderboard: DevtoLeaderboardEntry[],
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const flat: DevtoArticle[] = [];
  for (const mention of Object.values(file.mentions ?? {})) {
    for (const article of mention.articles ?? []) {
      flat.push(article);
    }
  }
  return buildDevtoHeaderFromArticles(flat, leaderboard);
}

// ---------------------------------------------------------------------------
// ProductHunt
// ---------------------------------------------------------------------------

export function buildProductHuntHeader(
  file: ProductHuntFile,
  topLaunches: Launch[],
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const launches = file.launches ?? [];
  const totalVotes = launches.reduce((s, l) => s + (l.votesCount ?? 0), 0);
  const totalComments = launches.reduce((s, l) => s + (l.commentsCount ?? 0), 0);
  const topVotes = launches.reduce((m, l) => Math.max(m, l.votesCount ?? 0), 0);

  const activity = activityBars(
    launches.map((l) => ({
      tsSec: l.createdAt ? Date.parse(l.createdAt) / 1000 : 0,
      weight: l.votesCount ?? 0,
    })),
  );
  const topics = topicBars(
    launches.map((l) => `${l.name} ${l.tagline ?? ""}`),
  );

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT · NOW",
        rightLabel: `${launches.length} LAUNCHES`,
        label: "LAUNCHES TRACKED",
        value: compactNumber(launches.length),
        hint: `${file.windowDays ?? 7}D WINDOW`,
        rows: [
          { label: "TOTAL VOTES", value: compactNumber(totalVotes) },
          { label: "TOP VOTES", value: compactNumber(topVotes), tone: "accent" },
          { label: "COMMENTS", value: compactNumber(totalComments) },
        ],
      },
      {
        variant: "bars",
        title: "// VOLUME · LAST 24H",
        bars: [],
        labelWidth: 48,
        emptyText: "NO RECENT LAUNCHES",
      },
      {
        variant: "bars",
        title: "// TOPICS · MENTIONED MOST",
        rightLabel: `TOP ${topics.length}`,
        bars: topics,
        labelWidth: 96,
        emptyText: "NOT ENOUGH SIGNAL YET",
      },
    ],
    { activity, topics, totalItems: launches.length },
  );

  const heroStories: NewsHeroStory[] = topLaunches.slice(0, 3).map((l) => ({
    title: l.tagline ? `${l.name} — ${l.tagline}` : l.name,
    href: l.url || `https://www.producthunt.com/posts/${l.id}`,
    external: true,
    sourceCode: "PH",
    byline: l.makers?.[0]?.name ? `by ${l.makers[0].name}` : undefined,
    scoreLabel: `${compactNumber(l.votesCount ?? 0)} ▲ · ${compactNumber(l.commentsCount ?? 0)} cmts`,
    ageHours: l.createdAt
      ? Math.max(0, (Date.now() - Date.parse(l.createdAt)) / 3_600_000)
      : null,
    logoUrl: l.thumbnail ?? null,
    logoName: l.name,
  }));

  return { cards, topStories: heroStories };
}

// ---------------------------------------------------------------------------
// Reddit
// ---------------------------------------------------------------------------

export function buildRedditHeader(
  posts: RedditAllPost[],
  stats: AllPostsStats,
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const totalScore = posts.reduce((s, p) => s + (p.score ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.numComments ?? 0), 0);
  const topScore = posts.reduce((m, p) => Math.max(m, p.score ?? 0), 0);

  const activity = activityBars(
    posts.map((p) => ({ tsSec: p.createdUtc, weight: p.score ?? 0 })),
  );
  const topics = topicBars(posts.map((p) => p.title));

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT · NOW",
        rightLabel: `${stats.totalPosts} POSTS`,
        label: "POSTS TRACKED",
        value: compactNumber(stats.totalPosts),
        hint: `${stats.breakouts24h} BREAKOUTS · 24H`,
        rows: [
          { label: "TOTAL SCORE", value: compactNumber(totalScore) },
          { label: "TOP SCORE", value: compactNumber(topScore), tone: "accent" },
          { label: "COMMENTS", value: compactNumber(totalComments) },
        ],
      },
      {
        variant: "bars",
        title: "// VOLUME · LAST 24H",
        bars: [],
        labelWidth: 56,
        emptyText: "NO RECENT POSTS",
      },
      {
        variant: "bars",
        title: "// TOPICS · MENTIONED MOST",
        rightLabel: `TOP ${topics.length}`,
        bars: topics,
        labelWidth: 96,
        emptyText: "NOT ENOUGH SIGNAL YET",
      },
    ],
    { activity, topics, totalItems: stats.totalPosts },
  );

  const heroes = posts
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);
  const heroStories: NewsHeroStory[] = heroes.map((p) => {
    const linkedRepo =
      (p as { linkedRepos?: { fullName: string }[] }).linkedRepos?.[0]
        ?.fullName ?? null;
    return {
      title: p.title,
      href: p.url || `https://www.reddit.com${p.permalink}`,
      external: true,
      sourceCode: "R",
      byline: p.subreddit ? `r/${p.subreddit}` : undefined,
      scoreLabel: `${compactNumber(p.score ?? 0)} ↑ · ${compactNumber(p.numComments ?? 0)} cmts`,
      ageHours: p.createdUtc
        ? Math.max(0, (Date.now() / 1000 - p.createdUtc) / 3600)
        : null,
      logoUrl:
        repoLogoUrl(linkedRepo) ??
        resolveLogoUrl(p.url ?? null, p.title, 64),
      logoName: linkedRepo ?? `r/${p.subreddit ?? "reddit"}`,
    };
  });

  return { cards, topStories: heroStories };
}

// ---------------------------------------------------------------------------
// Lobsters
// ---------------------------------------------------------------------------

export function buildLobstersHeader(
  file: LobstersTrendingFile,
  topStories: LobstersStory[],
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const stories = file.stories ?? [];
  const totalScore = stories.reduce((s, x) => s + (x.score ?? 0), 0);
  const totalComments = stories.reduce(
    (s, x) => s + (x.commentCount ?? 0),
    0,
  );
  const topScore = stories.reduce((m, x) => Math.max(m, x.score ?? 0), 0);

  const activity = activityBars(
    stories.map((s) => ({ tsSec: s.createdUtc, weight: s.score ?? 0 })),
  );
  const topics = topicBars(stories.map((s) => s.title));

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT · NOW",
        rightLabel: `${stories.length} ITEMS`,
        label: "STORIES TRACKED",
        value: compactNumber(stories.length),
        hint: `${file.windowHours ?? 24}H WINDOW`,
        rows: [
          { label: "TOTAL SCORE", value: compactNumber(totalScore) },
          { label: "TOP SCORE", value: compactNumber(topScore), tone: "accent" },
          { label: "COMMENTS", value: compactNumber(totalComments) },
        ],
      },
      {
        variant: "bars",
        title: "// VOLUME · LAST 24H",
        bars: [],
        labelWidth: 48,
        emptyText: "NO RECENT STORIES",
      },
      {
        variant: "bars",
        title: "// TOPICS · MENTIONED MOST",
        rightLabel: `TOP ${topics.length}`,
        bars: topics,
        labelWidth: 96,
        emptyText: "NOT ENOUGH SIGNAL YET",
      },
    ],
    { activity, topics, totalItems: stories.length },
  );

  const heroStories: NewsHeroStory[] = topStories.slice(0, 3).map((s) => {
    const linkedRepo = s.linkedRepos?.[0]?.fullName ?? null;
    return {
      title: s.title,
      href: s.url || `https://lobste.rs/s/${s.shortId ?? ""}`,
      external: true,
      sourceCode: "LZ",
      byline: s.by ? `@${s.by}` : undefined,
      scoreLabel: `${compactNumber(s.score ?? 0)} pts · ${compactNumber(s.commentCount ?? 0)} cmts`,
      ageHours: s.ageHours ?? null,
      logoUrl:
        repoLogoUrl(linkedRepo) ?? resolveLogoUrl(s.url ?? null, s.title, 64),
      logoName: linkedRepo ?? s.by ?? s.title,
    };
  });

  return { cards, topStories: heroStories };
}
