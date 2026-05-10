// /skills — V4 leaderboard list (W8 leaderboard pattern).
//
// Bespoke V4 primitives: PageHead + VerdictRibbon + KpiBand + SectionHead + RankRow.
// Two main sections — `// 01 Top skills` (signal-score leaderboard) and
// `// 02 New / breakout` (recent + Δhotness pickup). Right rail surfaces
// the Most-cited list and worker keys.
//
// AGN-536 (2026-05-04): the W5-SKILLS24H 24h/7d/30d sort-window tab strip
// + the URL `?window=` param drove sorting on installsDelta/starsDelta
// columns that were never populated (every row showed "—"). Mirko called
// CUT — the tab strip, the window-aware re-ranking, and the unused
// snapshot-rehydrate plumbing came out with the columns.
//
// Mockup reference: home.html top10 panel + breakouts.html leaderboard.

import type { Metadata } from "next";
import Link from "next/link";

import {
  compareBySourceNativeRank,
  getSkillsSignalData,
} from "@/lib/ecosystem-leaderboards";
import {
  LIST_LABELS,
  LIST_SLUGS,
  isListSlug,
  resolveSkillLists,
  type ListSlug,
} from "@/lib/skills/taxonomy";
import { getDerivedRepos } from "@/lib/derived-repos";
import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRedditMentionsFromStore } from "@/lib/reddit-data";
import { refreshHackernewsMentionsFromStore } from "@/lib/hackernews";
import { refreshBlueskyMentionsFromStore } from "@/lib/bluesky";
import { refreshDevtoMentionsFromStore } from "@/lib/devto";
import { refreshLobstersMentionsFromStore } from "@/lib/lobsters";
import { refreshNpmFromStore } from "@/lib/npm";
import { refreshHfModelsFromStore } from "@/lib/huggingface";
import { refreshArxivFromStore } from "@/lib/arxiv";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { formatNumber } from "@/lib/utils";
import type { Repo } from "@/lib/types";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { RankRow } from "@/components/ui/RankRow";
import { FooterBar } from "@/components/ui/FooterBar";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import { MarkVisited } from "@/components/layout/MarkVisited";
import {
  SkillsTopTable,
  type SkillRow,
} from "@/components/skills/SkillsTopTable";

import { encodeSkillSlug } from "./_slug";

export const revalidate = 60;

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_N = 20;
const REFRESH_TIMEOUT_MS = 4000;
// Cap how many "trending" skills we ship to the client. The table renders
// 50/page client-side, so expose a deeper source-native leaderboard without
// returning the entire upstream catalog.
const TRENDING_CAP = 1000;
// Per-repo cap so one collection (openclaw/openclaw, anthropics/skills,
// pytorch/pytorch — each contains 10-15+ child SKILL.md files) can't take
// every top slot. 3 lets the strongest skills from a collection stay visible
// without monopolising the leaderboard.
const PER_AUTHOR_CAP = 3;
const DESCRIPTION =
  "Top Claude / Codex / agent skills merged from skills.sh, GitHub, Smithery, lobehub, and skillsmp.";

function fullNameFromUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const m = url.match(/github\.com\/([^/?#]+)\/([^/?#]+)/i);
  if (!m) return null;
  return `${m[1]}/${m[2].replace(/\.git$/i, "")}`.toLowerCase();
}

/**
 * Author-cap helper. Walks `items` in input order and keeps at most
 * `capPerAuthor` per `linkedRepo` (fallback `author`). Keeping the input
 * order means the caller's sort (signalScore desc, hotness desc, etc.)
 * survives — we just thin the long-tail of duplicates from one collection.
 *
 * Items with no linkedRepo + no author are passed through uncapped (each
 * one is treated as its own bucket via the unique `id` fallback).
 */
function capPerAuthor<T extends { linkedRepo: string | null; author: string | null; id: string }>(
  items: ReadonlyArray<T>,
  capPerAuthor: number,
): T[] {
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const item of items) {
    const author = (item.linkedRepo ?? item.author ?? "").toLowerCase();
    const bucket = author || item.id; // unauthored → own bucket
    const seen = counts.get(bucket) ?? 0;
    if (seen >= capPerAuthor) continue;
    counts.set(bucket, seen + 1);
    out.push(item);
  }
  return out;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const metadata: Metadata = {
  title: `Trending Skills - ${SITE_NAME}`,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/skills") },
  openGraph: {
    title: `Trending Skills - ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl("/skills"),
  },
};

interface SkillsPageProps {
  searchParams: Promise<{ list?: string }>;
}

export default async function SkillsPage({ searchParams }: SkillsPageProps) {
  // BUG-FIX 2026-05-03: rehydrate the in-memory caches `getDerivedRepos()`
  // depends on. Without these refreshes, `linked` repo lookups returned
  // stale (often empty) Repo objects and every star delta column rendered
  // as "—". Mirrors the pattern used by /githubrepo and /home — each
  // refresh is internally rate-limited (30s) + dedupes in-flight callers
  // so calling them here on every render is cheap.
  await Promise.allSettled([
    withTimeout(refreshTrendingFromStore(), REFRESH_TIMEOUT_MS),
    withTimeout(refreshRedditMentionsFromStore(), REFRESH_TIMEOUT_MS),
    withTimeout(refreshHackernewsMentionsFromStore(), REFRESH_TIMEOUT_MS),
    withTimeout(refreshBlueskyMentionsFromStore(), REFRESH_TIMEOUT_MS),
    withTimeout(refreshDevtoMentionsFromStore(), REFRESH_TIMEOUT_MS),
    withTimeout(refreshLobstersMentionsFromStore(), REFRESH_TIMEOUT_MS),
    withTimeout(refreshNpmFromStore(), REFRESH_TIMEOUT_MS),
    withTimeout(refreshHfModelsFromStore(), REFRESH_TIMEOUT_MS),
    withTimeout(refreshArxivFromStore(), REFRESH_TIMEOUT_MS),
  ]);

  const data = await getSkillsSignalData();
  const allItems = data.combined.items;

  // Awesome-list taxonomy filter — `?list=<slug>` filters all sections to
  // skills that appear in the selected curator list. Unrecognised values
  // collapse to the All view (defensive against direct-link drift).
  const { list: rawListParam } = await searchParams;
  const activeListSlug: ListSlug | null = isListSlug(rawListParam)
    ? rawListParam
    : null;

  // Per-tab counts use the unfiltered set so labels stay stable as the user
  // tabs through. Computed once, used twice (tab strip + KpiBand sub).
  const listCounts: Record<ListSlug, number> = {
    antigravity: 0,
    "awesome-claude-code": 0,
    "punkpeye-mcp": 0,
    "wong2-mcp": 0,
  };
  for (const it of allItems) {
    for (const slug of resolveSkillLists(it.awesomeLists)) {
      listCounts[slug] += 1;
    }
  }

  const items = activeListSlug
    ? allItems.filter((it) =>
        resolveSkillLists(it.awesomeLists).includes(activeListSlug),
      )
    : allItems;

  const now = Date.now();

  // Build a lookup of tracked GitHub repos so we can plumb real
  // starsDelta24h/7d/30d onto skill rows when the registry's own
  // installsDelta snapshot is empty (cold start).
  const repos = getDerivedRepos();
  const repoByFullName = new Map<string, Repo>();
  for (const r of repos) {
    repoByFullName.set(r.fullName.toLowerCase(), r);
  }
  const linkedRepoCounts = new Map<string, number>();
  for (const it of items) {
    const key = (it.linkedRepo ?? fullNameFromUrl(it.url))?.toLowerCase();
    if (!key) continue;
    linkedRepoCounts.set(key, (linkedRepoCounts.get(key) ?? 0) + 1);
  }

  // Trending leaderboard — multi-registry consensus first, then signalScore.
  // Mirrors the OSS-Insight + TrendShift fusion on /githubrepo: skills
  // listed in 5/5 registries beat ones listed in 1/5. Within ties,
  // signalScore (which already fuses popularity + freshness + citations)
  // breaks. Then thin out repeat collections (per-author cap) so one repo
  // can't take 13/20 slots, hard-cap at TRENDING_CAP.
  const sortedByScore = [...items].sort(compareBySourceNativeRank);
  const trendingItems = capPerAuthor(sortedByScore, PER_AUTHOR_CAP).slice(
    0,
    TRENDING_CAP,
  );

  // KPI/verdict-ribbon stamp uses the diversified top-N (avoids reporting
  // an "avg signal" inflated by 13 near-identical sibling skills).
  const topByScore = trendingItems.slice(0, TOP_N);

  // Top by stars — leaderboard tile in the KPI band.
  const topByStars = [...items]
    .filter((it) => typeof it.popularity === "number" && it.popularity! > 0)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];

  // New in last 7 days — by createdAt fallback to lastPushedAt.
  const newRecent = items.filter((it) => {
    const iso = it.createdAt ?? it.lastPushedAt;
    if (!iso) return false;
    const t = Date.parse(iso);
    return Number.isFinite(t) && now - t <= ONE_WEEK_MS;
  });

  // Most-cited (derivative repo count >= 1) — used for KPI + right rail.
  // Author-capped so the right-rail tile doesn't render 12 sibling skills
  // from the same collection.
  const mostCited = capPerAuthor(
    [...items]
      .filter((it) => (it.derivativeRepoCount ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.derivativeRepoCount ?? 0) - (a.derivativeRepoCount ?? 0) ||
          b.signalScore - a.signalScore,
      ),
    PER_AUTHOR_CAP,
  );

  // Breakout slice — new-this-week sorted by Δhotness fallback to absolute
  // hotness. Author-capped before the slice so a single repo's burst of new
  // child skills doesn't fill all 10 breakout rows.
  const breakout = capPerAuthor(
    [...newRecent].sort((a, b) => {
      const aDelta = (a.hotness ?? 0) - (a.hotnessPrev7d ?? a.hotness ?? 0);
      const bDelta = (b.hotness ?? 0) - (b.hotnessPrev7d ?? b.hotness ?? 0);
      if (aDelta !== bDelta) return bDelta - aDelta;
      return (b.hotness ?? b.signalScore) - (a.hotness ?? a.signalScore);
    }),
    PER_AUTHOR_CAP,
  ).slice(0, 10);

  // Average accuracy proxy = average signal score across the top 20 (used as
  // the verdict ribbon stamp). Not a true accuracy metric — the leaderboard
  // doesn't have one — but mirrors the V4 verdict-ribbon stamp slot used on
  // /consensus. Cold-start safe: fallback to 0.
  const avgScore =
    topByScore.length > 0
      ? Math.round(
          topByScore.reduce((acc, it) => acc + it.signalScore, 0) /
            topByScore.length,
        )
      : 0;

  const totalLabel = formatNumber(items.length);
  const newCount = newRecent.length;
  const citedCount = mostCited.length;

  return (
    <main className="home-surface">
      <MarkVisited routeKey="skills" count={items.length} />
      <PageHead
        crumb={
          <>
            <b>SKILLS</b> · TERMINAL · /SKILLS
          </>
        }
        h1="Top AI agent skills, ranked across five registries."
        lede="A live leaderboard merging skills.sh, GitHub topic feeds, Smithery, lobehub, and skillsmp into one signal-scored list. Ranked by combined popularity, freshness, and derivative-repo citations."
        clock={
          <>
            <span className="big">{totalLabel}</span>
            <span className="muted">SKILLS · 5 REGISTRIES</span>
            <FreshnessBadge source="skills" lastUpdatedAt={data.combined.fetchedAt} />
          </>
        }
      />

      <VerdictRibbon
        tone="acc"
        stamp={{
          eyebrow: "// SKILLS BOARD",
          headline: `${avgScore}/100 avg signal · top ${topByScore.length}`,
          sub: `${data.skillsSh.items.length} skills.sh · ${data.github.items.length} github · ${citedCount} cited`,
        }}
        text={
          <>
            <b>{totalLabel} skills</b> tracked across five registries.{" "}
            {newCount > 0 ? (
              <>
                <span style={{ color: "var(--v4-money)" }}>
                  {newCount} new this week
                </span>
                {", "}
              </>
            ) : null}
            <span style={{ color: "var(--v4-acc)" }}>
              {citedCount} cited by downstream repos
            </span>
            {topByScore[0] ? (
              <>
                {" · "}top pick{" "}
                <span style={{ color: "var(--v4-ink-100)" }}>
                  {topByScore[0].title}
                </span>
              </>
            ) : null}
            .
          </>
        }
        actionHref="/api/skills?v=2"
        actionLabel="API →"
      />

      <KpiBand
        cells={[
          {
            label: "Total skills",
            value: totalLabel,
            sub: "across 5 registries",
            pip: "var(--v4-ink-300)",
          },
          {
            label: "Top by stars",
            value: topByStars
              ? formatNumber(topByStars.popularity ?? 0)
              : "—",
            sub: topByStars ? topByStars.title : "no popularity data",
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "New · 7d",
            value: formatNumber(newCount),
            sub: newCount > 0 ? "created or pushed" : "no new skills",
            tone: newCount > 0 ? "acc" : "default",
            pip: "var(--v4-acc)",
          },
          {
            label: "Most-cited",
            value: formatNumber(citedCount),
            sub: "derivative repos found",
            tone: citedCount > 0 ? "amber" : "default",
            pip: "var(--v4-amber)",
          },
        ]}
      />

      <ListTaxonomyTabs
        activeSlug={activeListSlug}
        allCount={allItems.length}
        listCounts={listCounts}
      />

      <SectionHead
        num="// 01"
        title="Top skills"
        meta={
          <>
            top <b>{trendingItems.length}</b> of {formatNumber(items.length)} ·
            max {PER_AUTHOR_CAP}/repo
          </>
        }
      />

      {(() => {
        const skillRows: SkillRow[] = trendingItems.map((item) => {
          const key =
            (item.linkedRepo ?? fullNameFromUrl(item.url))?.toLowerCase() ?? null;
          // Plumb linked-repo data through whether the skill is the only
          // child of that repo or one of several siblings. Per-author cap
          // already keeps the visible roster diverse; siblings sharing the
          // same parent's star delta is acceptable noise vs the prior
          // "fill the column with —" UX.
          const linked = key ? (repoByFullName.get(key) ?? null) : null;
          const stars =
            typeof item.popularity === "number" && item.popularity > 0
              ? item.popularity
              : (linked?.stars ?? 0);
          return {
            id: item.id,
            rank: item.rank,
            title: item.title,
            author: item.author ?? null,
            href: `/skills/${encodeSkillSlug(item.id)}`,
            logoUrl: item.logoUrl ?? null,
            sourceLabel: item.primaryRankSource ?? item.sourceLabel,
            sourceMetricLabel: item.sourceMetricLabel ?? item.popularityLabel,
            stars,
            starsDelta24h: linked?.starsDelta24h ?? null,
            starsDelta7d: linked?.starsDelta7d ?? null,
            starsDelta30d: linked?.starsDelta30d ?? null,
            installsDelta24h: item.installsDelta1d ?? null,
            installsDelta7d: item.installsDelta7d ?? null,
            installsDelta30d: item.installsDelta30d ?? null,
            cited: item.derivativeRepoCount ?? 0,
            sparklineData: linked?.sparklineData ?? [],
            trackingId: linked?.id ?? `skill:${item.id}`,
          };
        });
        if (skillRows.length === 0) {
          return <SkillsEmpty>{"// no leaderboard rows yet · waiting for upstream fetchers"}</SkillsEmpty>;
        }
        return <SkillsTopTable rows={skillRows} />;
      })()}

      <SectionHead
        num="// 02"
        title="New / breakout"
        meta={
          <>
            <b>{breakout.length}</b> · last 7d
          </>
        }
      />
      {breakout.length > 0 ? (
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid var(--v4-line-200)",
            borderRadius: 4,
            background: "var(--v4-bg-050)",
          }}
        >
          {breakout.map((item, idx) => {
            const delta =
              (item.hotness ?? 0) - (item.hotnessPrev7d ?? item.hotness ?? 0);
            return (
              <RankRow
                key={item.id}
                rank={idx + 1}
                avatar={
                  <SkillAvatar
                    logoUrl={item.logoUrl}
                    fallback={item.title}
                  />
                }
                title={
                  <>
                    {item.author ? (
                      <>
                        <span style={{ color: "var(--v4-ink-300)" }}>
                          {item.author}
                        </span>
                        <span style={{ color: "var(--v4-ink-400)" }}> / </span>
                      </>
                    ) : null}
                    <span style={{ color: "var(--v4-ink-100)" }}>
                      {item.title}
                    </span>
                  </>
                }
                desc={item.description ?? item.sourceLabel}
                metric={{
                  value: (item.hotness ?? item.signalScore).toFixed(0),
                  label: "hot",
                }}
                delta={
                  delta !== 0
                    ? {
                        value: `${delta > 0 ? "+" : ""}${delta.toFixed(0)}`,
                        direction: delta > 0 ? "up" : "down",
                      }
                    : undefined
                }
                href={`/skills/${encodeSkillSlug(item.id)}`}
              />
            );
          })}
        </section>
      ) : (
        <SkillsEmpty>{"// no skills created or pushed in the last 7 days"}</SkillsEmpty>
      )}

      <SectionHead
        num="// 03"
        title="Most-cited skills"
        as="h3"
        meta={
          citedCount > 0 ? (
            <>
              <b>{formatNumber(Math.min(citedCount, 12))}</b> · derivatives
            </>
          ) : undefined
        }
      />
      {mostCited.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 8,
            marginBottom: 24,
          }}
        >
          {mostCited.slice(0, 12).map((item) => (
            <li key={item.id} className="v4-collection-rail-list__item">
              <Link
                href={`/skills/${encodeSkillSlug(item.id)}`}
                className="v4-collection-rail-list__link"
                style={{
                  border: "1px solid var(--v4-line-200)",
                  borderRadius: 3,
                  background: "var(--v4-bg-050)",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: "var(--v4-ink-100)",
                    }}
                  >
                    {item.title}
                  </span>
                  <span
                    style={{
                      display: "block",
                      color: "var(--v4-ink-400)",
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {item.author ?? item.sourceLabel}
                  </span>
                </span>
                <span
                  className="v4-collection-rail-list__count"
                  style={{ color: "var(--v4-amber)", fontWeight: 600 }}
                >
                  {formatNumber(item.derivativeRepoCount ?? 0)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <SkillsEmpty>{"// no derivative repo citations recorded yet"}</SkillsEmpty>
      )}

      <FooterBar
        meta={`// SKILLS / leaderboard / serial ${formatNumber(items.length)}`}
        actions={
          <>
            DATA / 5 REGISTRIES · top {topByScore.length} · cap {PER_AUTHOR_CAP}/repo
          </>
        }
      />
    </main>
  );
}

interface ListTaxonomyTabsProps {
  activeSlug: ListSlug | null;
  allCount: number;
  listCounts: Record<ListSlug, number>;
}

/**
 * 5-tab filter strip surfacing the awesome-* curator lists. Each tab is a
 * server-side `<Link>` that updates `?list=<slug>`; the page re-renders
 * with the filter applied. Active state via `aria-current="page"` + a
 * solid background instead of the outlined idle style. Counts come from
 * the unfiltered set so they remain stable while the user tabs.
 *
 * AGN-536 history note: a previous tab strip (24h/7d/30d windows) was CUT
 * because the ranked columns it drove were always "—". This strip is safe
 * because the data backing it (`awesomeLists` membership) is populated
 * for thousands of skills today.
 */
function ListTaxonomyTabs({
  activeSlug,
  allCount,
  listCounts,
}: ListTaxonomyTabsProps) {
  const tabs: Array<{
    slug: ListSlug | null;
    label: string;
    count: number;
    href: string;
  }> = [
    {
      slug: null,
      label: "All",
      count: allCount,
      href: "/skills",
    },
    ...LIST_SLUGS.map((slug) => ({
      slug,
      label: LIST_LABELS[slug],
      count: listCounts[slug],
      href: `/skills?list=${slug}`,
    })),
  ];
  return (
    <nav
      aria-label="Filter skills by curator list"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: "12px 0 4px",
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 11,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.slug === activeSlug;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 3,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              textDecoration: "none",
              border: "1px solid var(--v4-line-200)",
              background: isActive
                ? "var(--v4-bg-200)"
                : "var(--v4-bg-050)",
              color: isActive
                ? "var(--v4-ink-000)"
                : "var(--v4-ink-300)",
            }}
          >
            <span>{tab.label}</span>
            <span
              style={{
                fontSize: 10,
                color: isActive
                  ? "var(--v4-acc)"
                  : "var(--v4-ink-400)",
              }}
            >
              {formatNumber(tab.count)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

interface SkillsEmptyProps {
  children: React.ReactNode;
}

/**
 * Mono-caps empty-state row that matches the terminal-dashboard voice used on
 * the home page (e.g. "waiting for live rows", "// no series"). Replaces ad-hoc
 * inline-styled <p> blocks so every dead-state copy reads the same shape.
 */
function SkillsEmpty({ children }: SkillsEmptyProps) {
  return (
    <p
      style={{
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 11,
        color: "var(--v4-ink-300)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        padding: "16px 0",
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

interface SkillAvatarProps {
  logoUrl: string | null;
  fallback: string;
}

function SkillAvatar({ logoUrl, fallback }: SkillAvatarProps) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        width={28}
        height={28}
        loading="lazy"
        style={{
          width: 28,
          height: 28,
          borderRadius: 3,
          objectFit: "contain",
          background: "var(--v4-bg-100)",
        }}
      />
    );
  }
  const text = fallback.slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 3,
        background: "var(--v4-bg-100)",
        border: "1px solid var(--v4-line-200)",
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 11,
        color: "var(--v4-ink-200)",
      }}
    >
      {text}
    </span>
  );
}
