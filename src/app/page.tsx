// TrendingRepo - Home (Phase 3 / P9)
//
// Server component. Reads the derived Repo[] from committed JSON
// (data/trending.json + data/deltas.json) and renders the front-page
// dashboard from derived movers. The in-memory pipeline store is empty
// on cold Vercel Lambdas, so reading from JSON is the only way to serve
// non-empty repo cards consistently.
//
// Title/description metadata is inherited from the root layout template
// - no per-page override here so the canonical "TrendingRepo - {tagline}"
// formula stays source-of-truth in one place (src/lib/seo.ts).

import { getDerivedRepos } from "@/lib/derived-repos";
import { lastFetchedAt } from "@/lib/trending";
import {
  getSkillsSignalData,
  getMcpSignalData,
  type EcosystemLeaderboardItem,
} from "@/lib/ecosystem-leaderboards";
import { BubbleMap } from "@/components/terminal/BubbleMap";
import { HomeEmptyState } from "@/components/home/HomeEmptyState";
import { Card, CardHeader } from "@/components/ui/Card";
import { ChartStat, ChartStats } from "@/components/ui/ChartShell";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { FooterBar } from "@/components/ui/FooterBar";
import { SectionHead } from "@/components/ui/SectionHead";
import { EntityLogo } from "@/components/ui/EntityLogo";
import {
  GithubIcon,
  HackerNewsIcon,
  RedditIcon,
  BlueskyIcon,
  DevtoIcon,
} from "@/components/brand/BrandIcons";
import {
  LiveTopTable,
  type LiveRow,
  type CategoryFacet,
} from "@/components/home/LiveTopTable";
import { CATEGORIES } from "@/lib/constants";
import { repoLogoUrl } from "@/lib/logos";
import type { Repo } from "@/lib/types";
import {
  SITE_NAME,
  SITE_URL,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  absoluteUrl,
  safeJsonLd,
} from "@/lib/seo";

// ISR: data/*.json only changes when the GHA scrape commits new trending
// data, so serving the homepage from a 30-minute edge cache is safe. Drops
// per-request getDerivedRepos() re-runs (15 passes x ~2.4k rows + full
// scoreBatch) from ~300 ms to a lookup. `force-dynamic` is no longer needed.
export const revalidate = 60;

// Single source of truth for the homepage FAQ. Renders both the visible
// <details> list and the FAQPage JSON-LD below - keeping them in one array
// means structured data and rendered copy can't drift apart.
const HOMEPAGE_FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "What data sources does TrendingRepo track?",
    a: "GitHub (stars, forks, releases, contributors), Reddit (r/programming, r/webdev, r/MachineLearning), Hacker News front page, ProductHunt daily launches, Bluesky tech feeds, and dev.to trending articles. Every signal is timestamped and scored for momentum.",
  },
  {
    q: "How is the momentum score calculated?",
    a: "A composite 0-100 score based on 24h / 7d / 30d star velocity, fork growth, contributor churn, commit freshness, release cadence, and anti-spam dampening. Breakouts are flagged when velocity exceeds rolling baselines by 2 sigma.",
  },
  {
    q: "Can I query TrendingRepo from a terminal or agent?",
    a: "Yes - three interfaces: a zero-dependency CLI (Node 18+), an MCP server for Claude / any agent, and a Portal v0.1 endpoint. All three hit the same live pipeline, so results never drift.",
  },
  {
    q: "How often is the data refreshed?",
    a: "Scrapers run every 3 hours via GitHub Actions. The homepage is ISR-cached for 30 minutes, so the edge serves a static hit while the pipeline ingests fresh signals in the background.",
  },
  {
    q: "Is there an API?",
    a: "Yes - public REST endpoints under /api/repos with filtering, sorting, and pagination. The Portal v0.1 manifest exposes the same tools over structured JSON-RPC.",
  },
  {
    q: "How do I submit my own repo?",
    a: "Click the 'Drop repo' button in the header or visit /submit. Any GitHub repo is eligible - the pipeline scores it on the next ingest cycle.",
  },
];

type HomeEntityKind = "repo" | "skill" | "mcp";

interface HomeEntity {
  id: string;
  kind: HomeEntityKind;
  name: string;
  href: string;
  sub: string;
  score: number;
  delta: number;
  pct: number | null;
  sparkline: number[];
  hasRealSparkline: boolean;
  stars?: number;
  channels?: number;
  mentions?: number;
  category?: string;
  logoUrl: string | null;
  delta7d?: number;
  delta30d?: number;
  deltaUnit?: string;
}

const CATEGORY_LABELS = new Map(CATEGORIES.map((c) => [c.id, c.shortName]));

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
}

function formatDelta(value: number): string {
  const abs = formatCompact(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${abs}`;
}

function percentDelta(delta: number, base: number): number | null {
  if (base <= 0 || delta === 0) return null;
  return Math.round((delta / Math.max(1, base - delta)) * 100);
}

function categoryLabel(repo: Repo): string {
  return CATEGORY_LABELS.get(repo.categoryId) ?? repo.language ?? "Repo";
}

function sourceCount(repo: Repo): number {
  if (typeof repo.channelsFiring === "number") return repo.channelsFiring;
  if (!repo.channelStatus) return repo.mentionCount24h > 0 ? 2 : 1;
  return Object.values(repo.channelStatus).filter(Boolean).length;
}

function repoEntity(repo: Repo): HomeEntity {
  return {
    id: repo.id,
    kind: "repo",
    name: repo.fullName,
    href: `/repo/${repo.owner}/${repo.name}`,
    sub: `${categoryLabel(repo)} / ${repo.language ?? "mixed"} / ${formatCompact(repo.stars)} stars`,
    score: repo.momentumScore,
    delta: repo.starsDelta24h,
    pct: percentDelta(repo.starsDelta24h, repo.stars),
    sparkline: repo.sparklineData,
    hasRealSparkline: repo.sparklineData.length > 1,
    stars: repo.stars,
    channels: sourceCount(repo),
    mentions: repo.mentionCount24h,
    category: categoryLabel(repo),
    logoUrl: repoLogoUrl(repo.fullName, 80),
  };
}

function ecosystemEntity(
  item: EcosystemLeaderboardItem,
  kind: Exclude<HomeEntityKind, "repo">,
  repoByFullName?: Map<string, Repo>,
): HomeEntity {
  const useRepoFallback = kind === "mcp";
  // Real trending: prefer the linked GitHub repo's 24h/7d/30d star deltas
  // (computed by the trending pipeline, always populated for tracked repos)
  // over the side-channel installsDelta fields, which are only filled once
  // skills.sh / registry fetchers have a 7d-old comparison snapshot.
  // Skill / MCP items often leave `linkedRepo` null but expose a github.com
  // url — parse owner/name from there as a fallback so the home rows surface
  // real velocity for as many entries as possible.
  const fullNameFromUrl = (() => {
    if (typeof item.url !== "string") return null;
    const m = item.url.match(/github\.com\/([^/?#]+)\/([^/?#]+)/i);
    if (!m) return null;
    return `${m[1]}/${m[2].replace(/\.git$/i, "")}`.toLowerCase();
  })();
  const lookupKey = (item.linkedRepo ?? fullNameFromUrl)?.toLowerCase() ?? null;
  const linked = lookupKey
    ? (repoByFullName?.get(lookupKey) ?? null)
    : null;
  const raw24 =
    (useRepoFallback ? linked?.starsDelta24h : undefined) ??
    item.mcp?.installs24h ??
    item.installsDelta1d;
  const raw7 =
    (useRepoFallback ? linked?.starsDelta7d : undefined) ??
    item.installsDelta7d;
  const raw30 =
    (useRepoFallback ? linked?.starsDelta30d : undefined) ??
    item.installsDelta30d;
  const realSparkline =
    useRepoFallback && linked?.sparklineData
      ? linked.sparklineData
      : emptySparkline();
  let delta = 0;
  let primaryWindow: "24h" | "7d" | "30d" = "24h";
  if (typeof raw24 === "number" && raw24 !== 0) {
    delta = raw24;
    primaryWindow = "24h";
  } else if (typeof raw7 === "number" && raw7 !== 0) {
    delta = raw7;
    primaryWindow = "7d";
  } else if (typeof raw30 === "number" && raw30 !== 0) {
    delta = raw30;
    primaryWindow = "30d";
  } else {
    delta = raw24 ?? raw7 ?? raw30 ?? 0;
    primaryWindow = "24h";
  }
  return {
    id: item.id,
    kind,
    name: item.title,
    href: item.url,
    sub:
      item.author ??
      item.sourceLabel ??
      item.topic ??
      (kind === "skill" ? "skill signal" : "mcp signal"),
    score: item.signalScore,
    delta,
    // No synthetic pct — was previously delta/base off-of-score, which
    // produced fake "+30%" badges on rows with zero real velocity.
    pct: null,
    sparkline: realSparkline,
    hasRealSparkline: realSparkline.length > 1,
    stars: typeof item.popularity === "number" ? item.popularity : undefined,
    channels: item.crossSourceCount,
    category: kind === "skill" ? "Skill" : "MCP",
    logoUrl: item.logoUrl ?? repoLogoUrl(item.linkedRepo, 80),
    delta7d:
      primaryWindow !== "7d" && typeof raw7 === "number" ? raw7 : undefined,
    delta30d:
      primaryWindow !== "30d" && typeof raw30 === "number" ? raw30 : undefined,
    deltaUnit: primaryWindow,
  };
}

function emptySparkline(): number[] {
  return [];
}

function dedupeSkillItemsForHome(
  items: EcosystemLeaderboardItem[],
): EcosystemLeaderboardItem[] {
  const byRepo = new Map<string, EcosystemLeaderboardItem>();
  const noRepo: EcosystemLeaderboardItem[] = [];
  for (const item of items) {
    const key = item.linkedRepo?.toLowerCase();
    if (!key) {
      noRepo.push(item);
      continue;
    }
    const current = byRepo.get(key);
    if (!current || item.signalScore > current.signalScore) {
      byRepo.set(key, item);
    }
  }
  return [...byRepo.values(), ...noRepo];
}

function topByDelta(repos: Repo[], limit: number): HomeEntity[] {
  return [...repos]
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h)
    .slice(0, limit)
    .map(repoEntity);
}

function topCategoryFallback(
  repos: Repo[],
  categoryIds: string[],
  limit: number,
): HomeEntity[] {
  const wanted = new Set(categoryIds);
  const filtered = repos.filter((repo) => wanted.has(repo.categoryId));
  return topByDelta(filtered.length > 0 ? filtered : repos, limit);
}

function sparkPath(values: number[], width: number, height: number): string {
  const points = values.length > 1 ? values : [1, 1];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  return points
    .map((value, index) => {
      const x = (index / Math.max(1, points.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// Same as sparkPath but with externally-supplied min/max so multiple lines
// drawn into one SVG share a Y axis instead of self-normalising.
function scaledSparkPath(
  values: number[],
  width: number,
  height: number,
  vMin: number,
  vMax: number,
  padX = 4,
  padY = 10,
): string {
  if (values.length < 2) return "";
  const span = vMax - vMin || 1;
  return values
    .map((value, index) => {
      const x = padX + (index / (values.length - 1)) * (width - 2 * padX);
      const y = height - padY - ((value - vMin) / span) * (height - 2 * padY);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatPct(delta: number, base: number): string | null {
  const pct = percentDelta(delta, base);
  if (pct === null) return null;
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

// Vercel/Linear/Stripe-style mini sparkline:
//   1. area path, vertical alpha-gradient fill
//   2. crisp 1.5px stroke on top
//   3. end-point dot with halo glow
// Implemented as pure inline SVG — no extra deps, scales with viewBox.
let __sparkGradId = 0;

function Sparkline({
  values,
  color = "var(--sig-green)",
  className = "spark",
  area = true,
  width = 72,
  height = 24,
}: {
  values: number[];
  color?: string;
  className?: string;
  area?: boolean;
  width?: number;
  height?: number;
}) {
  const d = sparkPath(values, width, height);
  // Stable per-instance id avoids gradient cross-talk when many spark SVGs
  // are mounted in the same DOM (Hero panels, live table, etc.).
  const gradId = `sg-${(__sparkGradId = (__sparkGradId + 1) % 1_000_000)}`;

  // Compute end-point coords for the trailing dot.
  const points = values.length > 1 ? values : [1, 1];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const lastIdx = points.length - 1;
  const lastVal = points[lastIdx];
  const endX =
    (lastIdx / Math.max(1, points.length - 1)) * (width - 2) + 1;
  const endY = height - 2 - ((lastVal - min) / span) * (height - 4);

  const lastX = (width - 1).toFixed(1);
  const firstX = "1";
  const baseY = (height - 1).toFixed(1);
  const areaPath = `${d} L${lastX},${baseY} L${firstX},${baseY} Z`;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.42" />
          <stop offset="60%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area ? <path d={areaPath} fill={`url(#${gradId})`} /> : null}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Halo + dot at the trailing point — the visual cue from
          Vercel/TradingView mini-charts. */}
      <circle
        cx={endX}
        cy={endY}
        r="3"
        fill={color}
        opacity="0.22"
      />
      <circle
        cx={endX}
        cy={endY}
        r="1.6"
        fill={color}
      />
    </svg>
  );
}

function EntityHeroRow({
  entity,
  index,
  color,
}: {
  entity: HomeEntity;
  index: number;
  color: string;
}) {
  const lineColor = entity.delta < 0 ? "var(--sig-red)" : color;
  const pctText =
    entity.pct !== null
      ? `${entity.pct >= 0 ? "+" : ""}${entity.pct}%`
      : null;
  return (
    <a
      className={`hero-row ${index === 0 ? "first" : ""}`}
      href={entity.href}
      style={index === 0 ? ({ ["--row-acc"]: color } as React.CSSProperties) : undefined}
    >
      <span className="rk">{String(index + 1).padStart(2, "0")}</span>
      <EntityLogo
        src={entity.logoUrl}
        name={entity.name}
        size={28}
        className="av"
      />
      <span className="nm">
        <span className="txt">{entity.name}</span>
        <span className="sub">{entity.sub}</span>
      </span>
      <span className={`delta-stack ${entity.delta < 0 ? "dn" : ""}`}>
        <span className="d">
          {formatDelta(entity.delta)}
          <span className="d-lbl">{entity.deltaUnit ?? "24h"}</span>
        </span>
        {entity.delta7d !== undefined ? (
          <span className={`d-sec ${entity.delta7d < 0 ? "dn" : ""}`}>
            {formatDelta(entity.delta7d)}
            <span className="d-lbl">7d</span>
          </span>
        ) : null}
        {entity.delta30d !== undefined ? (
          <span className={`d-sec ${entity.delta30d < 0 ? "dn" : ""}`}>
            {formatDelta(entity.delta30d)}
            <span className="d-lbl">30d</span>
          </span>
        ) : null}
        {pctText ? <span className="pct">{pctText}</span> : null}
      </span>
      {entity.hasRealSparkline ? (
        <Sparkline
          values={entity.sparkline}
          color={lineColor}
          className="spark"
          area
          width={92}
          height={30}
        />
      ) : (
        <span className="spark spark-missing" aria-label="No live series">
          NO SERIES
        </span>
      )}
    </a>
  );
}

function HeroPanel({
  title,
  count,
  color,
  href,
  items,
}: {
  title: string;
  count: number;
  color: string;
  href: string;
  items: HomeEntity[];
}) {
  return (
    <Card className="hero-panel col-4">
      <CardHeader
        right={<span className="live">LIVE</span>}
        className="panel-head"
      >
        <span className="cat-pip" style={{ background: color }} aria-hidden="true" />
        {title}
        <span className="muted-dot">/ {formatCompact(count)} tracked</span>
      </CardHeader>
      <div className="panel-body">
        {items.length > 0 ? (
          items.map((item, index) => (
            <EntityHeroRow key={`${title}-${item.id}`} entity={item} index={index} color={color} />
          ))
        ) : (
          <div className="hero-panel-empty">waiting for live rows</div>
        )}
      </div>
      <div className="cat-foot">
        <span>updated {new Date(lastFetchedAt).toISOString().slice(11, 16)} utc</span>
        <a href={href}>view all -&gt;</a>
      </div>
    </Card>
  );
}

const SOURCE_ICONS: ReadonlyArray<{
  key: string;
  label: string;
  Icon: (props: { size?: number; className?: string }) => React.ReactElement;
}> = [
  { key: "gh", label: "GitHub", Icon: GithubIcon },
  { key: "hn", label: "Hacker News", Icon: HackerNewsIcon },
  { key: "r", label: "Reddit", Icon: RedditIcon },
  { key: "b", label: "Bluesky", Icon: BlueskyIcon },
  { key: "d", label: "dev.to", Icon: DevtoIcon },
];

function ConsensusRow({ repo, index }: { repo: Repo; index: number }) {
  const channels = Math.max(1, sourceCount(repo));
  return (
    <a className={`cons-row ${index === 0 ? "first" : ""}`} href={`/repo/${repo.owner}/${repo.name}`}>
      <div className="cons-top">
        <span className="rk">{String(index + 1).padStart(2, "0")}</span>
        <EntityLogo
          src={repoLogoUrl(repo.fullName, 64)}
          name={repo.fullName}
          size={28}
          className="cons-av"
        />
        <span className="nm">
          <span className="h">{repo.fullName}</span>
          <span className="meta">
            <span className="tag">{categoryLabel(repo)}</span>
            {channels} sources
          </span>
        </span>
        <span className="delta">
          {formatDelta(repo.starsDelta24h)}
          <span className="lbl">24h</span>
        </span>
      </div>
      <div className="cons-bot">
        <span className="srcs" aria-label={`${channels} sources firing`}>
          {SOURCE_ICONS.slice(0, channels).map(({ key, label, Icon }) => (
            <span
              key={key}
              className={`sd sd-${key}`}
              title={label}
              aria-label={label}
            >
              <Icon size={16} />
            </span>
          ))}
        </span>
        <Sparkline values={repo.sparklineData} className="spark-mini" />
      </div>
    </a>
  );
}

function BreakoutRow({ repo, index }: { repo: Repo; index: number }) {
  const baseline = Math.max(1, repo.starsDelta7d / 7);
  const velocity = Math.min(100, Math.round((repo.starsDelta24h / baseline) * 18));
  const pct = percentDelta(repo.starsDelta24h, repo.stars);
  return (
    <a className={`brk-row ${index === 0 ? "first" : ""}`} href={`/repo/${repo.owner}/${repo.name}`}>
      <span className="rk">{String(index + 1).padStart(2, "0")}</span>
      <EntityLogo
        src={repoLogoUrl(repo.fullName, 64)}
        name={repo.fullName}
        size={28}
        className="brk-av"
      />
      <span className="nm">
        <span className="h">{repo.fullName}</span>
        <span className="meta">{categoryLabel(repo)} / {repo.movementStatus.replace("_", " ")}</span>
      </span>
      <span className="vel">
        <span className="bar"><i style={{ width: `${velocity}%` }} /></span>
        <span className="lbl">{velocity}% vel</span>
      </span>
      <span className="delta">
        {formatDelta(repo.starsDelta24h)}
        {pct !== null ? <span className="pct">+{pct}%</span> : null}
      </span>
    </a>
  );
}

function FeaturedCard({
  entity,
  index,
}: {
  entity: HomeEntity;
  index: number;
}) {
  const badge =
    index === 0
      ? "Featured / deep dive"
      : index === 1
        ? "Breakout"
        : "New signal";
  const sparkColor =
    entity.delta < 0
      ? "var(--sig-red)"
      : index === 0
        ? "var(--acc)"
        : "var(--sig-cyan)";
  const mentionsLabel = entity.kind === "repo" ? "mentions" : "installs 7d";
  const pctText = entity.pct !== null ? `${entity.pct >= 0 ? "+" : ""}${entity.pct}%` : null;
  return (
    <a className={`feat-card ${index === 0 ? "hero" : "sec"}`} href={entity.href}>
      <div className="head">
        <span className="badge">{badge}</span>
        <span className="kind">
          {entity.kind.toUpperCase()}
          {entity.category && entity.category.toUpperCase() !== entity.kind.toUpperCase()
            ? ` · ${entity.category}`
            : ""}
        </span>
      </div>
      <div className="title-row">
        <EntityLogo src={entity.logoUrl} name={entity.name} size={28} />
        <h3 className="title">{entity.name}</h3>
      </div>
      <Sparkline values={entity.sparkline} className="spark-feat" color={sparkColor} />
      <div className="stats">
        <span>
          <b>{entity.stars ? formatCompact(entity.stars) : formatCompact(entity.score)}</b>
          <i>{entity.stars ? "stars" : "score"}</i>
        </span>
        <span>
          <b className={entity.delta < 0 ? "dn" : "up"}>{formatDelta(entity.delta)}</b>
          <i>24h{pctText ? ` · ${pctText}` : ""}</i>
        </span>
        <span>
          <b>{formatCompact(entity.mentions ?? 0)}</b>
          <i>{mentionsLabel}</i>
        </span>
        <span>
          <b>{entity.channels ?? 1}</b>
          <i>sources</i>
        </span>
      </div>
    </a>
  );
}

export default async function HomePage() {
  const repos = getDerivedRepos();
  // Pull skills + mcp ecosystem signals so the front page can surface
  // their respective top movers alongside repo gainers. Both
  // helpers are Redis-backed; in local dev without Redis they return
  // empty boards (no `data/trending-skill*.json` ships in the repo).
  // Promise.allSettled keeps a partial outage from blocking the page.
  // The category panels fall back to derived repo views when null.
  const [skillsRes, mcpRes] = await Promise.allSettled([
    getSkillsSignalData(),
    getMcpSignalData(),
  ]);
  const skillsItems =
    skillsRes.status === "fulfilled" &&
    skillsRes.value.combined.items.length > 0
      ? skillsRes.value.combined.items
      : null;
  const mcpItems =
    mcpRes.status === "fulfilled" && mcpRes.value.board.items.length > 0
      ? mcpRes.value.board.items
      : null;

  // Cold lambda / broken data file -> show a branded empty state instead
  // of the generic "no repos match filters" inner message. Preserves the
  // h1 + FAQ for SEO so Google doesn't see a dead page on a degraded
  // deploy, but skips the bubble map + featured row which would look
  // empty/broken.
  if (repos.length === 0) {
    return (
      <>
        {/* sr-only H1 keeps SEO + structured-data flow intact while the
            visible hero is dropped on degraded-data branches too. */}
        <h1 className="sr-only">
          TrendingRepo is a trend radar that surfaces breakout open-source
          repos from live social signals.
        </h1>
        <HomeEmptyState />
      </>
    );
  }

  // Top-20 repos (by 24h star delta) feed the ItemList JSON-LD below.
  // Canonical list of what's "on this page" for search crawlers.
  const itemListTop = [...repos]
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h)
    .slice(0, 20);

  // Lookup map for plumbing real GitHub star deltas onto skill / mcp rows
  // when the registry's own velocity snapshot isn't populated yet.
  const repoByFullName = new Map<string, Repo>();
  for (const r of repos) {
    repoByFullName.set(r.fullName.toLowerCase(), r);
  }
  const skillsBoard = skillsItems
    ? dedupeSkillItemsForHome(skillsItems)
        .map((item) => ecosystemEntity(item, "skill", repoByFullName))
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5)
    : [];
  const mcpBoard = mcpItems
    ? mcpItems
        .map((item) => ecosystemEntity(item, "mcp", repoByFullName))
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5)
    : topCategoryFallback(repos, ["mcp"], 5);
  const repoBoard = topByDelta(repos, 5);
  const consensusRepos = [...repos]
    .sort(
      (a, b) =>
        (b.crossSignalScore ?? sourceCount(b)) -
        (a.crossSignalScore ?? sourceCount(a)),
    )
    .slice(0, 8);
  const breakoutRepos = [...repos]
    .sort((a, b) => {
      const aBase = Math.max(1, a.starsDelta7d / 7);
      const bBase = Math.max(1, b.starsDelta7d / 7);
      return b.starsDelta24h / bBase - a.starsDelta24h / aBase;
    })
    .slice(0, 5);
  const featured = [...repos]
    .map(repoEntity)
    .sort(
      (a, b) =>
        b.score + b.delta / 100 + (b.channels ?? 0) * 4
        - (a.score + a.delta / 100 + (a.channels ?? 0) * 4),
    )
    .slice(0, 5);
  const liveRows = [...repos]
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, 50);
  const liveTableRows: LiveRow[] = liveRows.map((repo) => {
    const ps = repo.mentions?.perSource;
    return {
      id: repo.id,
      fullName: repo.fullName,
      owner: repo.owner,
      name: repo.name,
      href: `/repo/${repo.owner}/${repo.name}`,
      categoryId: repo.categoryId,
      categoryLabel: categoryLabel(repo),
      language: repo.language ?? null,
      stars: repo.stars,
      starsDelta24h: repo.starsDelta24h,
      starsDelta7d: repo.starsDelta7d,
      starsDelta30d: repo.starsDelta30d,
      forks: repo.forks,
      sparklineData: repo.sparklineData,
      momentumScore: repo.momentumScore,
      mentionCount24h: repo.mentionCount24h ?? 0,
      // Chip on/off uses the wider 7d window so slow-cadence sources
      // (lobsters / npm / hf / arxiv / devto) actually fire on the row.
      // 24h is too narrow for most non-twitter signals — the result was
      // "8 chip slots, only github + twitter colored." Falls back to the
      // 24h count when 7d is missing.
      sources: {
        gh: 1,
        hn: ps?.hackernews.count7d ?? ps?.hackernews.count24h ?? 0,
        r: ps?.reddit.count7d ?? ps?.reddit.count24h ?? 0,
        b: ps?.bluesky.count7d ?? ps?.bluesky.count24h ?? 0,
        d: ps?.devto.count7d ?? ps?.devto.count24h ?? 0,
        lobsters: ps?.lobsters.count7d ?? ps?.lobsters.count24h ?? 0,
        x: ps?.twitter.count7d ?? ps?.twitter.count24h ?? 0,
        npm: ps?.npm.count7d ?? ps?.npm.count24h ?? 0,
        hf: ps?.huggingface.count7d ?? ps?.huggingface.count24h ?? 0,
        arxiv: ps?.arxiv.count7d ?? ps?.arxiv.count24h ?? 0,
      },
    };
  });
  const liveCategories: CategoryFacet[] = (() => {
    const counts = new Map<string, number>();
    for (const r of liveTableRows) {
      counts.set(r.categoryId, (counts.get(r.categoryId) ?? 0) + 1);
    }
    return CATEGORIES.map((c) => ({
      id: c.id,
      label: c.shortName,
      count: counts.get(c.id) ?? 0,
    }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  })();
  const refreshed = new Date(lastFetchedAt);
  const refreshedTime = refreshed.toISOString().slice(11, 19);
  const total24h = repos.reduce(
    (sum, repo) => sum + Math.max(0, repo.starsDelta24h),
    0,
  );
  const total7d = repos.reduce(
    (sum, repo) => sum + Math.max(0, repo.starsDelta7d),
    0,
  );
  const total30d = repos.reduce(
    (sum, repo) => sum + Math.max(0, repo.starsDelta30d),
    0,
  );
  const topCategory = CATEGORIES.map((category) => ({
    label: category.shortName,
    delta: repos
      .filter((repo) => repo.categoryId === category.id)
      .reduce((sum, repo) => sum + Math.max(0, repo.starsDelta24h), 0),
  })).sort((a, b) => b.delta - a.delta)[0];

  return (
    <>
      <div className="home-surface">
        <section className="page-head">
          <div>
            <div className="crumb">
              <b>TREND</b> / TERMINAL / FRONT PAGE
            </div>
            <h1>What&apos;s moving in open source - right now.</h1>
            <p className="lede">
              Live repo, skill, and MCP momentum ranked by source agreement,
              star velocity, and fresh community attention.
            </p>
          </div>
          <div className="clock" aria-label={`Data refreshed at ${refreshedTime} UTC`}>
            <span className="big">{refreshedTime} UTC</span>
          </div>
        </section>

        <h1 className="sr-only">
          TrendingRepo is a trend radar that surfaces breakout open-source
          repos from live social signals.
        </h1>

        <MetricGrid columns={6}>
          <Metric label="tracked repos" value={formatCompact(repos.length)} sub="derived feed" />
          <Metric label="24h stars" value={formatCompact(total24h)} delta="+ live" tone="positive" />
          <Metric label="7d stars" value={formatCompact(total7d)} sub="rolling window" />
          <Metric label="consensus" value={consensusRepos.length} sub="multi-source" tone="consensus" />
          <Metric label="breakouts" value={breakoutRepos.length} sub="velocity spike" tone="accent" />
          <Metric label="top category" value={topCategory?.label ?? "n/a"} sub="momentum leader" />
        </MetricGrid>

        <SectionHead
          num="// 01"
          title="Trending now / top 5 by category"
          meta={<><b>Repos</b> / Skills / MCP</>}
        />
        <div className="grid">
          <HeroPanel title="Repos" count={repos.length} color="var(--cat-repo)" href="/repos" items={repoBoard} />
          <HeroPanel title="Claude skills" count={skillsItems?.length ?? skillsBoard.length} color="var(--cat-skill)" href="/skills" items={skillsBoard} />
          <HeroPanel title="MCP servers" count={mcpItems?.length ?? mcpBoard.length} color="var(--cat-mcp)" href="/mcp" items={mcpBoard} />
        </div>

        <SectionHead
          num="// 02"
          title="What multiple feeds agree on"
          meta={<><b>Cross-source</b> / 24h</>}
        />
        <div className="grid">
          <Card className="col-6">
            <CardHeader right={<span>{consensusRepos.length} active</span>} showCorner>
              {"// Consensus"}
            </CardHeader>
            <div className="panel-body">
              {consensusRepos.map((repo, index) => (
                <ConsensusRow key={repo.id} repo={repo} index={index} />
              ))}
            </div>
          </Card>
          <Card className="col-6">
            <CardHeader right={<span className="positive">accelerating</span>} showCorner>
              {"// Breakout"}
            </CardHeader>
            <div className="panel-body">
              {breakoutRepos.map((repo, index) => (
                <BreakoutRow key={repo.id} repo={repo} index={index} />
              ))}
            </div>
          </Card>
        </div>

        <SectionHead
          num="// 03"
          title="Signal map / momentum vs scale"
          meta={<><b>Top 120</b> / 24h window</>}
        />
        <BubbleMap repos={repos} limit={120} />

        <SectionHead
          num="// 04"
          title="Featured / curated this week"
          meta={<><b>5</b> picks</>}
        />
        <div className="feat-grid">
          {featured.map((entity, index) => (
            <FeaturedCard key={`${entity.kind}-${entity.id}`} entity={entity} index={index} />
          ))}
        </div>

        <SectionHead
          num="// 05"
          title="Live / top 50"
          meta={<><b>{refreshedTime}</b> / refreshed</>}
        />
        <Card>
          <LiveTopTable rows={liveTableRows} categories={liveCategories} />
        </Card>

        <SectionHead
          num="// 06"
          title="TrendingRepo Index / last 30 days"
          meta={<><b>Top 100</b> stars / day</>}
        />
        <Card>
          <CardHeader right={<span className="live">LIVE</span>} showCorner>
            {"// TR-100 Index"}
          </CardHeader>
          <div className="chart-toggle">
            <span className="tg on">Index</span>
            <span className="tg">Share</span>
            <span className="tg">Categories</span>
            <span className="right">30d / <b>{formatCompact(total30d)}</b></span>
          </div>
          {(() => {
            const indexLeaders = [...repos]
              .sort((a, b) => b.starsDelta30d - a.starsDelta30d)
              .slice(0, 5);
            const indexColors = [
              "var(--acc)",
              "var(--sig-cyan)",
              "var(--sig-green)",
              "var(--sig-amber)",
              "var(--sig-red)",
            ];
            const indexAllValues = indexLeaders
              .flatMap((r) => (r.sparklineData.length > 0 ? r.sparklineData : [0]));
            const vMin = indexAllValues.length ? Math.min(...indexAllValues) : 0;
            const vMax = indexAllValues.length ? Math.max(...indexAllValues) : 1;
            return (
              <>
                <div className="chart-wrap">
                  <svg
                    viewBox="0 0 1100 280"
                    preserveAspectRatio="none"
                    aria-label="TrendingRepo top-5 leader trajectories, last 30 days"
                  >
                    <defs>
                      <pattern id="tr100-grid" width="110" height="56" patternUnits="userSpaceOnUse">
                        <path d="M110 0 H0 V56" fill="none" stroke="var(--line-100)" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="1100" height="280" fill="url(#tr100-grid)" opacity="0.5" />
                    {indexLeaders.map((repo, i) => (
                      <path
                        key={repo.id}
                        d={scaledSparkPath(repo.sparklineData, 1100, 280, vMin, vMax)}
                        fill="none"
                        stroke={indexColors[i % indexColors.length]}
                        strokeWidth={i === 0 ? 2.4 : 1.8}
                        strokeOpacity={i === 0 ? 1 : 0.78}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </svg>
                </div>
                <div className="chart-legend-row">
                  {indexLeaders.map((repo, i) => (
                    <a
                      key={repo.id}
                      className="lg"
                      href={`/repo/${repo.owner}/${repo.name}`}
                    >
                      <span
                        className="pip"
                        style={{ background: indexColors[i % indexColors.length] }}
                        aria-hidden
                      />
                      <span className="rk-n">#{String(i + 1).padStart(2, "0")}</span>
                      <EntityLogo
                        src={repoLogoUrl(repo.fullName, 48)}
                        name={repo.fullName}
                        size={20}
                      />
                      <span className="nm">{repo.fullName}</span>
                      <span className={`dl ${repo.starsDelta30d < 0 ? "dn" : "up"}`}>
                        {formatDelta(repo.starsDelta30d)}
                      </span>
                    </a>
                  ))}
                </div>
              </>
            );
          })()}
          <ChartStats>
            <ChartStat label="today / stars" value={formatCompact(total24h)} sub="+24h aggregate" />
            <ChartStat label="30d stars" value={formatCompact(total30d)} sub="rolling total" />
            <ChartStat label="top category" value={topCategory?.label ?? "n/a"} sub="momentum share" />
            <ChartStat label="leaders" value={itemListTop.length} sub="indexed on page" />
          </ChartStats>
        </Card>
      </div>

      <section id="faq" className="home-surface faq-surface">
        <div className="max-w-3xl space-y-3">
          <SectionHead num="// 07" title="FAQ" meta={<><b>Operator</b> notes</>} />

          <div
            className="v4-faq-list border-y"
            style={{ borderColor: "var(--v4-line-100)" }}
          >
            <style>{`
              .v4-faq-list .toggle-open { display: none; }
              .v4-faq-list details[open] .toggle-closed { display: none; }
              .v4-faq-list details[open] .toggle-open { display: inline; }
              .v4-faq-list details[open] > summary {
                color: var(--v4-ink-100);
                background: var(--v4-bg-050);
              }
            `}</style>
            {HOMEPAGE_FAQ.map(({ q, a }, i) => (
              <details
                key={q}
                className="group block border-t first:border-t-0 transition-colors"
                style={{ borderColor: "var(--v4-line-100)" }}
              >
                <summary
                  className="flex cursor-pointer select-none items-center justify-between gap-4 px-4 py-3.5 text-[11px] tracking-[0.12em] transition-colors hover:bg-[var(--v4-bg-050)]"
                  style={{
                    color: "var(--v4-ink-200)",
                    fontFamily: "var(--font-geist-mono), monospace",
                  }}
                >
                  <span className="flex items-baseline gap-3 min-w-0">
                    <span
                      className="tabular-nums shrink-0"
                      style={{ color: "var(--v4-ink-400)" }}
                      aria-hidden
                    >
                      Q.{String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate uppercase">{q}</span>
                  </span>
                  <span
                    className="shrink-0 tabular-nums"
                    style={{ color: "var(--v4-acc)" }}
                    aria-hidden
                  >
                    <span className="toggle-closed">[+]</span>
                    <span className="toggle-open">[-]</span>
                  </span>
                </summary>
                <div
                  className="px-4 pb-4 pt-1 text-[13px] leading-relaxed"
                  style={{ color: "var(--v4-ink-300)" }}
                >
                  {a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* WebSite JSON-LD - gives Google a SearchAction so the sitelinks
          search box can render against /search?q={query}. Pairs with
          the Organization + BreadcrumbList blocks below. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": `${SITE_URL.replace(/\/+$/, "")}/#website`,
            name: SITE_NAME,
            alternateName: `${SITE_NAME} - ${SITE_TAGLINE}`,
            description: SITE_DESCRIPTION,
            url: SITE_URL,
            inLanguage: "en-US",
            publisher: {
              "@type": "Organization",
              "@id": `${SITE_URL.replace(/\/+$/, "")}/#organization`,
            },
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${SITE_URL.replace(
                  /\/+$/,
                  "",
                )}/search?q={search_term_string}`,
              },
              "query-input": "required name=search_term_string",
            },
          }),
        }}
      />

      {/* Organization JSON-LD - establishes brand identity (name, logo, url)
          so search engines can attach knowledge-panel metadata. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": `${SITE_URL.replace(/\/+$/, "")}/#organization`,
            name: SITE_NAME,
            url: SITE_URL,
            logo: {
              "@type": "ImageObject",
              url: absoluteUrl("/icon-512.png"),
            },
            description: SITE_DESCRIPTION,
          }),
        }}
      />

      {/* BreadcrumbList JSON-LD - single-item breadcrumb for the homepage
          so crawlers can connect this URL to the canonical home anchor. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: absoluteUrl("/"),
              },
            ],
          }),
        }}
      />

      {/* FAQPage JSON-LD - derived from the same array as the visible FAQ
          above so structured data and the rendered Q/A can never drift. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: HOMEPAGE_FAQ.map(({ q, a }) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: { "@type": "Answer", text: a },
            })),
          }),
        }}
      />

      {/* CollectionPage + ItemList JSON-LD - tells crawlers this page is
          a curated list of trending repos and enumerates the top 20 so
          structured-data rich results can pick them up. Complements the
          Organization + FAQPage schemas already emitted elsewhere. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": `${SITE_URL.replace(/\/+$/, "")}/#homepage`,
            name: `${SITE_NAME} - trending open-source repos`,
            url: absoluteUrl("/"),
            isPartOf: {
              "@type": "WebSite",
              name: SITE_NAME,
              url: SITE_URL,
            },
            dateModified: lastFetchedAt,
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: itemListTop.length,
              itemListOrder: "https://schema.org/ItemListOrderDescending",
              itemListElement: itemListTop.map((r, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: absoluteUrl(`/repo/${r.owner}/${r.name}`),
                name: r.fullName,
              })),
            },
          }),
        }}
      />

      {/* Dataset JSON-LD - declares the catalog itself as a Schema.org
          Dataset so AI/GEO surfaces (Google Dataset Search, Perplexity,
          ChatGPT, Claude) can recognise this site as a structured data
          source rather than a generic blog. Lists the variables we
          measure and the JSON / Markdown / XML distribution endpoints. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "Dataset",
            "@id": `${SITE_URL.replace(/\/+$/, "")}/#dataset`,
            name: `${SITE_NAME} - open-source repo trend dataset`,
            alternateName: "TrendingRepo Catalog",
            description:
              "Aggregated repo metadata + cross-source signals (GitHub, Reddit, Hacker News, Bluesky, dev.to, ProductHunt, Lobsters) for the open-source ecosystem. Updated every 3 hours.",
            url: SITE_URL,
            sameAs: [SITE_URL],
            inLanguage: "en-US",
            isAccessibleForFree: true,
            keywords: [
              "open source",
              "github",
              "trending repos",
              "developer tools",
              "AI agents",
              "MCP",
              "LLM",
              "DevTools",
            ],
            creator: {
              "@type": "Organization",
              "@id": `${SITE_URL.replace(/\/+$/, "")}/#organization`,
            },
            publisher: {
              "@type": "Organization",
              "@id": `${SITE_URL.replace(/\/+$/, "")}/#organization`,
            },
            // Metadata only - repos retain their own license.
            license: "https://creativecommons.org/publicdomain/zero/1.0/",
            variableMeasured: [
              {
                "@type": "PropertyValue",
                name: "stars",
                description: "GitHub star count",
              },
              {
                "@type": "PropertyValue",
                name: "starsDelta24h",
                description: "24-hour star delta",
              },
              {
                "@type": "PropertyValue",
                name: "starsDelta7d",
                description: "7-day star delta",
              },
              {
                "@type": "PropertyValue",
                name: "momentumScore",
                description: "0-100 composite momentum score",
              },
              {
                "@type": "PropertyValue",
                name: "crossSignalScore",
                description: "0-5 cross-channel signal aggregate",
              },
            ],
            distribution: [
              {
                "@type": "DataDownload",
                encodingFormat: "application/json",
                contentUrl: absoluteUrl("/api/repos"),
              },
              {
                "@type": "DataDownload",
                encodingFormat: "text/markdown",
                contentUrl: absoluteUrl("/llms-full.txt"),
              },
              {
                "@type": "DataDownload",
                encodingFormat: "application/xml",
                contentUrl: absoluteUrl("/sitemap.xml"),
              },
            ],
            temporalCoverage: `${new Date(
              Date.now() - 365 * 24 * 3600 * 1000,
            )
              .toISOString()
              .slice(0, 10)}/..`,
            dateModified: lastFetchedAt,
          }),
        }}
      />

      <FooterBar
        meta={`// TRENDINGREPO / front-page / serial ${repos.length}`}
        actions={`DATA / ${refreshedTime} UTC`}
      />
    </>
  );
}
