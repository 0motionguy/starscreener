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
import {
  LiveTopTable,
  type LiveSkill,
  type LiveMcp,
} from "@/components/home/LiveTopTable";
import { Tr100IndexChart, type Tr100Point } from "@/components/home/Tr100IndexChart";
import { Card, CardHeader } from "@/components/ui/Card";
import { ChartStat, ChartStats } from "@/components/ui/ChartShell";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { FooterBar } from "@/components/ui/FooterBar";
import { SectionHead } from "@/components/ui/SectionHead";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import { CATEGORIES } from "@/lib/constants";
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
  stars?: number;
  channels?: number;
  /** GitHub owner avatar URL — empty string falls back to the monogram. */
  logoUrl: string;
  /** First letter for the monogram fallback. */
  initial: string;
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
    stars: repo.stars,
    channels: sourceCount(repo),
    // Direct GitHub owner avatar — public, stable, no auth, served via
    // `<img>` on the SSR pass so users see a face on first paint instead
    // of a dead grey square. EntityLogo's monogram fallback fires
    // client-side via onError.
    logoUrl: `https://github.com/${encodeURIComponent(repo.owner)}.png?size=40`,
    initial: (repo.owner.charAt(0) || "?").toUpperCase(),
  };
}

function ecosystemEntity(
  item: EcosystemLeaderboardItem,
  kind: Exclude<HomeEntityKind, "repo">,
): HomeEntity {
  const delta =
    item.mcp?.installs24h ??
    item.installsDelta7d ??
    item.forkVelocity7d ??
    Math.round(item.signalScore * 10);
  const base =
    item.popularity ??
    item.installs7d ??
    item.mcp?.useCount ??
    Math.max(100, delta * 4);
  // Same SSR-friendly avatar logic as repoEntity. ecosystem items expose
  // logoUrl directly when available; otherwise derive from linkedRepo's
  // GitHub owner. Empty string → EntityHeroRow renders monogram instead.
  const linkedOwner = item.linkedRepo?.split("/", 1)[0]?.trim() ?? "";
  const fallbackOwnerLogo = linkedOwner
    ? `https://github.com/${encodeURIComponent(linkedOwner)}.png?size=40`
    : "";
  const cleanLogo =
    typeof item.logoUrl === "string" && item.logoUrl.trim() ? item.logoUrl.trim() : "";
  const logoUrl = cleanLogo || fallbackOwnerLogo;
  const initial = (item.title.charAt(0) || "?").toUpperCase();
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
    pct: percentDelta(delta, base),
    sparkline: buildSyntheticSparkline(item.signalScore, delta),
    stars: typeof item.popularity === "number" ? item.popularity : undefined,
    channels: item.crossSourceCount,
    logoUrl,
    initial,
  };
}

function buildSyntheticSparkline(score: number, delta: number): number[] {
  const trend = Math.max(1, delta / 120);
  return Array.from({ length: 16 }, (_, i) => {
    const wobble = Math.sin((i + score) * 0.9) * 3;
    return Math.max(1, Math.round(score / 3 + i * trend + wobble));
  });
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

function Sparkline({
  values,
  color = "var(--sig-green)",
  className = "spark",
}: {
  values: number[];
  color?: string;
  className?: string;
}) {
  const d = sparkPath(values, 72, 24);
  return (
    <svg className={className} viewBox="0 0 72 24" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
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
  return (
    <a
      className={`hero-row ${index === 0 ? "first" : ""}`}
      href={entity.href}
    >
      <div className="rk">{String(index + 1).padStart(2, "0")}</div>
      <div className="nm">
        {entity.logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            className="av"
            src={entity.logoUrl}
            alt=""
            width={20}
            height={20}
            loading="lazy"
            referrerPolicy="no-referrer"
            style={{ objectFit: "cover" }}
            aria-hidden="true"
          />
        ) : (
          <span className="av" aria-hidden="true">
            {entity.initial}
          </span>
        )}
        <span className="txt">{entity.name}</span>
        <span className={`delta-inline ${entity.delta < 0 ? "dn" : ""}`}>
          {formatDelta(entity.delta)}
          {entity.pct !== null ? <span className="pct">+{entity.pct}%</span> : null}
        </span>
      </div>
      <span className="sub">{entity.sub}</span>
      <Sparkline values={entity.sparkline} color={entity.delta < 0 ? "var(--sig-red)" : color} />
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
        {items.map((item, index) => (
          <EntityHeroRow key={`${title}-${item.id}`} entity={item} index={index} color={color} />
        ))}
      </div>
      <div className="cat-foot">
        <span>updated {new Date(lastFetchedAt).toISOString().slice(11, 16)} utc</span>
        <a href={href}>view all -&gt;</a>
      </div>
    </Card>
  );
}

function ConsensusRow({ repo, index }: { repo: Repo; index: number }) {
  const channels = Math.max(1, sourceCount(repo));
  const score = repo.crossSignalScore ?? channels;
  return (
    <a className={`cons-row ${index === 0 ? "first" : ""}`} href={`/repo/${repo.owner}/${repo.name}`}>
      <div className="cons-top">
        <span className="rk">{String(index + 1).padStart(2, "0")}</span>
        <span className="nm">
          <span className="h">{repo.fullName}</span>
          <span className="meta">
            <span className="tag">{categoryLabel(repo)}</span>
            {channels} sources / score {score.toFixed(1)}
          </span>
        </span>
        <span className="delta">
          {formatDelta(repo.starsDelta24h)}
          <span className="lbl">24h</span>
        </span>
      </div>
      <div className="cons-bot">
        <span className="srcs" aria-label={`${channels} sources firing`}>
          {["GH", "HN", "R", "B", "D"].slice(0, channels).map((label) => (
            <span key={label} className={`sd sd-${label.toLowerCase()}`}>
              {label}
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
  return (
    <a className={`feat-card ${index === 0 ? "hero" : "sec"}`} href={entity.href}>
      <span className="badge">{index === 0 ? "Featured / deep dive" : index === 1 ? "Breakout" : "New signal"}</span>
      <h3 className="title">{entity.name}</h3>
      <p className="repo">{entity.kind.toUpperCase()} / {entity.sub}</p>
      <p className="desc">
        {index === 0
          ? "Highest-confidence mover across star velocity, source agreement, and category momentum."
          : "A compact signal worth watching before it becomes obvious in the weekly rankings."}
      </p>
      <Sparkline values={entity.sparkline} className="spark-feat" color={index === 0 ? "var(--acc)" : "var(--sig-cyan)"} />
      <div className="stats">
        <span><b>{entity.stars ? formatCompact(entity.stars) : formatCompact(entity.score)}</b> scale</span>
        <span><b className="up">{formatDelta(entity.delta)}</b> 24h</span>
        <span><b>{entity.channels ?? 1}</b> sources</span>
      </div>
      {index === 0 ? (
        <span className="why"><b>Why now</b> / top ranked by cross-signal confidence and fresh momentum.</span>
      ) : null}
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

  // TR-100 Index (// 06): aggregate the top-100 repos' daily sparklines
  // into one 30-day cumulative-stars index. The previous inline SVG
  // jammed `flatMap(spark.slice(-2))` from 30 unrelated repos into a
  // single line, producing the cliff-edge zigzag the user complained
  // about. Sum-by-day gives a smooth, monotonic line.
  const tr100Top = [...repos]
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, 100);
  const SERIES_DAYS = 30;
  const dayMs = 86_400_000;
  const fetchedTs = Date.parse(lastFetchedAt);
  const todayStart = Number.isFinite(fetchedTs)
    ? Math.floor(fetchedTs / dayMs) * dayMs
    : Math.floor(Date.now() / dayMs) * dayMs;
  const dailySum = new Array<number>(SERIES_DAYS).fill(0);
  for (const repo of tr100Top) {
    const spark = Array.isArray(repo.sparklineData) ? repo.sparklineData : [];
    if (spark.length === 0) continue;
    // Right-align the per-repo sparkline in our 30-day window so the
    // most recent datapoint lines up with `today`. Repos with shorter
    // history pad-left with their first known star count (preserves
    // monotonicity instead of dropping to zero).
    const offset = SERIES_DAYS - spark.length;
    const seed = spark[0] ?? 0;
    for (let i = 0; i < SERIES_DAYS; i++) {
      const idx = i - offset;
      const value = idx < 0 ? seed : (spark[idx] ?? spark[spark.length - 1] ?? 0);
      if (Number.isFinite(value)) dailySum[i] += value;
    }
  }
  const tr100Series: Tr100Point[] = dailySum.map((value, i) => ({
    ts: todayStart - (SERIES_DAYS - 1 - i) * dayMs,
    value,
  }));

  const skillsBoard = skillsItems
    ? skillsItems.slice(0, 7).map((item) => ecosystemEntity(item, "skill"))
    : topCategoryFallback(repos, ["ai-agents", "ai-ml", "devtools"], 7);
  const mcpBoard = mcpItems
    ? mcpItems.slice(0, 7).map((item) => ecosystemEntity(item, "mcp"))
    : topCategoryFallback(repos, ["mcp"], 7);
  const repoBoard = topByDelta(repos, 7);
  const consensusRepos = [...repos]
    .sort(
      (a, b) =>
        (b.crossSignalScore ?? sourceCount(b)) -
        (a.crossSignalScore ?? sourceCount(a)),
    )
    .slice(0, 7);
  const breakoutRepos = [...repos]
    .sort((a, b) => {
      const aBase = Math.max(1, a.starsDelta7d / 7);
      const bBase = Math.max(1, b.starsDelta7d / 7);
      return b.starsDelta24h / bBase - a.starsDelta24h / aBase;
    })
    .slice(0, 7);
  const featured = [...repoBoard, ...skillsBoard, ...mcpBoard]
    .sort((a, b) => b.score + b.delta / 100 - (a.score + a.delta / 100))
    .slice(0, 3);
  // 24h/7d/30d window switching is owned by <LiveTopTable> (client). We
  // pass the full repo[] + ecosystem items so the user can re-sort without
  // a round trip. Old fixed-momentum sort retained for the cold render
  // (used until React hydrates). Top 50 by 24h delta gives a reasonable
  // default view; LiveTopTable shows top `limit` per its own current sort.
  // Reuse the synthetic-sparkline + logo-resolution logic so the LiveTopTable
  // rows look as alive as the hero panels above. Skills/mcp ecosystem items
  // don't carry their own per-day star series — buildSyntheticSparkline gives
  // us a smooth wobble keyed off (signalScore, delta) so each row still has
  // a per-row trend chart instead of a dead `—`.
  const liveSkillItems: LiveSkill[] = (skillsItems ?? [])
    .slice(0, 50)
    .map((item): LiveSkill => {
      const delta = item.installsDelta1d ?? 0;
      const linkedOwner = item.linkedRepo?.split("/", 1)[0]?.trim() ?? "";
      const fallbackOwnerLogo = linkedOwner
        ? `https://github.com/${encodeURIComponent(linkedOwner)}.png?size=40`
        : "";
      const cleanLogo =
        typeof item.logoUrl === "string" && item.logoUrl.trim()
          ? item.logoUrl.trim()
          : "";
      return {
        id: `skill-${item.id}`,
        name: item.title,
        href: item.url,
        sub: item.sourceLabel ?? item.topic,
        score: item.signalScore,
        delta24h: delta,
        delta7d: item.installsDelta7d ?? 0,
        delta30d: item.installsDelta30d ?? 0,
        logoUrl: cleanLogo || fallbackOwnerLogo || undefined,
        sparkline: buildSyntheticSparkline(item.signalScore, delta),
      };
    });
  const liveMcpItems: LiveMcp[] = (mcpItems ?? [])
    .slice(0, 50)
    .map((item): LiveMcp => {
      const delta = item.mcp?.installs24h ?? 0;
      const linkedOwner = item.linkedRepo?.split("/", 1)[0]?.trim() ?? "";
      const fallbackOwnerLogo = linkedOwner
        ? `https://github.com/${encodeURIComponent(linkedOwner)}.png?size=40`
        : "";
      const cleanLogo =
        typeof item.logoUrl === "string" && item.logoUrl.trim()
          ? item.logoUrl.trim()
          : "";
      return {
        id: `mcp-${item.id}`,
        name: item.title,
        href: item.url,
        sub: item.vendor ?? item.sourceLabel ?? item.topic,
        score: item.signalScore,
        delta24h: delta,
        delta7d: item.installsDelta7d ?? 0,
        delta30d: item.installsDelta30d ?? 0,
        logoUrl: cleanLogo || fallbackOwnerLogo || undefined,
        sparkline: buildSyntheticSparkline(item.signalScore, delta),
      };
    });
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
            <span className="live">live ingest</span>
            <FreshnessBadge source="mcp" lastUpdatedAt={lastFetchedAt} />
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
          title="Trending now / top 7 by category"
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
          meta={<><b>3</b> picks</>}
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
          <LiveTopTable
            repos={repos.slice(0, 50)}
            skills={liveSkillItems}
            mcps={liveMcpItems}
            limit={15}
          />
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
          <div className="chart-wrap">
            <Tr100IndexChart points={tr100Series} />
          </div>
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
