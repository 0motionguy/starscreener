// /skills — V4 leaderboard list (W8 leaderboard pattern).
//
// Migrated off the legacy SignalSourcePage + SkillsTerminalTable chrome to
// V4 primitives: PageHead + VerdictRibbon + KpiBand + SectionHead + RankRow.
// Two main sections — `// 01 Top skills` (signal-score leaderboard) and
// `// 02 New / breakout` (recent + Δhotness pickup). Right rail surfaces
// the Most-cited list and worker keys.
//
// W5-SKILLS24H — adds a 24h / 7d / 30d tab strip above "// 01 Top skills".
// The active window re-ranks the leaderboard by `installsDeltaNd` (when
// the corresponding snapshot is available) so users can spot instant
// velocity vs. sustained adoption. Default is 7d (matches the old behavior).
//
// Mockup reference: home.html top10 panel + breakouts.html leaderboard.
// W5-CATWINDOW (categories/page.tsx) precedent for the tab strip.

import type { Metadata } from "next";
import Link from "next/link";

import { getSkillsSignalData } from "@/lib/ecosystem-leaderboards";
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
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import {
  SkillsTopTable,
  type SkillRow,
} from "@/components/skills/SkillsTopTable";

import { encodeSkillSlug } from "./_slug";

export const revalidate = 60;

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_N = 20;
const DESCRIPTION =
  "Top Claude / Codex / agent skills merged from skills.sh, GitHub, Smithery, lobehub, and skillsmp.";

// W5-SKILLS24H — supported tracking windows. Default 7d preserves the
// behavior the page had before the windowed tabs landed.
const SORT_WINDOWS = ["24h", "7d", "30d"] as const;
type SortWindow = (typeof SORT_WINDOWS)[number];

const WINDOW_LABEL: Record<SortWindow, string> = {
  "24h": "24H",
  "7d": "7D",
  "30d": "30D",
};

function parseSortWindow(value: string | string[] | undefined): SortWindow {
  const v = Array.isArray(value) ? value[0] : value;
  return SORT_WINDOWS.includes(v as SortWindow) ? (v as SortWindow) : "24h";
}

/**
 * Pull the install delta for the active window off a leaderboard row.
 * Returns undefined when the snapshot for that window isn't populated yet
 * (cold start — first 24h / 7d / 30d after the worker fetcher ships).
 */
function pickInstallsDelta(
  item: {
    installsDelta1d?: number;
    installsDelta7d?: number;
    installsDelta30d?: number;
  },
  win: SortWindow,
): number | undefined {
  if (win === "24h") return item.installsDelta1d;
  if (win === "30d") return item.installsDelta30d;
  return item.installsDelta7d;
}

function pickRepoDelta(repo: Repo | null, win: SortWindow): number | undefined {
  if (!repo) return undefined;
  if (win === "24h") return repo.starsDelta24h;
  if (win === "30d") return repo.starsDelta30d;
  return repo.starsDelta7d;
}

function fullNameFromUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const m = url.match(/github\.com\/([^/?#]+)\/([^/?#]+)/i);
  if (!m) return null;
  return `${m[1]}/${m[2].replace(/\.git$/i, "")}`.toLowerCase();
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
  searchParams?: Promise<{ window?: string | string[] }>;
}

export default async function SkillsPage({ searchParams }: SkillsPageProps) {
  const params = (await searchParams) ?? {};
  const sortWindow = parseSortWindow(params.window);

  // BUG-FIX 2026-05-03: rehydrate the in-memory caches `getDerivedRepos()`
  // depends on. Without these refreshes, `linked` repo lookups returned
  // stale (often empty) Repo objects and every star delta column rendered
  // as "—". Mirrors the pattern used by /githubrepo and /home — each
  // refresh is internally rate-limited (30s) + dedupes in-flight callers
  // so calling them here on every render is cheap.
  await Promise.all([
    refreshTrendingFromStore(),
    refreshRedditMentionsFromStore(),
    refreshHackernewsMentionsFromStore(),
    refreshBlueskyMentionsFromStore(),
    refreshDevtoMentionsFromStore(),
    refreshLobstersMentionsFromStore(),
    refreshNpmFromStore(),
    refreshHfModelsFromStore(),
    refreshArxivFromStore(),
  ]);

  const data = await getSkillsSignalData();
  const items = data.combined.items;
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

  // Active-window delta per row. Prefer the linked GitHub repo's real
  // star delta over the registry's installsDelta (which is mostly empty
  // until a 7d-old snapshot exists). Fall back to installsDelta when
  // the linked repo isn't in our tracked set.
  const deltaByItem = new Map<string, number>();
  for (const it of items) {
    const key = (it.linkedRepo ?? fullNameFromUrl(it.url))?.toLowerCase() ?? null;
    const uniqueRepo =
      key !== null && (linkedRepoCounts.get(key) ?? 0) === 1;
    const linked = uniqueRepo && key ? (repoByFullName.get(key) ?? null) : null;
    const fromRepo = pickRepoDelta(linked, sortWindow);
    const fromRegistry = pickInstallsDelta(it, sortWindow);
    const d = fromRepo ?? fromRegistry;
    if (d !== undefined && Number.isFinite(d)) deltaByItem.set(it.id, d);
  }
  const haveWindowedData = Array.from(deltaByItem.values()).some((v) => v !== 0);

  // Top — primary leaderboard. When the active window's snapshot is
  // populated, sort by the window delta (descending). Otherwise fall back
  // to the static signalScore ordering. Items missing delta-data sink below
  // items that have it so a cold deploy doesn't bury warmed rows.
  const topByScore = [...items]
    .sort((a, b) => {
      if (haveWindowedData) {
        const da = deltaByItem.get(a.id);
        const db = deltaByItem.get(b.id);
        if (da !== undefined && db !== undefined && da !== db) return db - da;
        if (da !== undefined && db === undefined) return -1;
        if (db !== undefined && da === undefined) return 1;
      }
      return b.signalScore - a.signalScore;
    })
    .slice(0, TOP_N);

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
  const mostCited = [...items]
    .filter((it) => (it.derivativeRepoCount ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.derivativeRepoCount ?? 0) - (a.derivativeRepoCount ?? 0) ||
        b.signalScore - a.signalScore,
    );

  // Breakout slice — new-this-week sorted by Δhotness fallback to absolute hotness.
  const breakout = [...newRecent]
    .sort((a, b) => {
      const aDelta = (a.hotness ?? 0) - (a.hotnessPrev7d ?? a.hotness ?? 0);
      const bDelta = (b.hotness ?? 0) - (b.hotnessPrev7d ?? b.hotness ?? 0);
      if (aDelta !== bDelta) return bDelta - aDelta;
      return (b.hotness ?? b.signalScore) - (a.hotness ?? a.signalScore);
    })
    .slice(0, 10);

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
        actionHref="/api/skills"
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

      <SectionHead
        num="// 01"
        title="Top skills"
        meta={
          <>
            <b>{items.length}</b> · sortable · stars Δ + installs Δ · sort{" "}
            <b>{WINDOW_LABEL[sortWindow]}</b>
          </>
        }
      />

      {/* W5-SKILLS24H — sort-by-window control. Server-rendered links so
          the URL is canonical + shareable; default 24h matches the page
          intent ("instant velocity"). Mirrors /categories pattern. */}
      <nav
        aria-label="Sort skills by time window"
        style={{
          display: "flex",
          gap: 6,
          padding: "6px 0 12px",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <span style={{ color: "var(--v4-ink-400)", paddingRight: 6 }}>
          SORT BY ·
        </span>
        {SORT_WINDOWS.map((w) => {
          const active = w === sortWindow;
          const href = w === "24h" ? "/skills" : `/skills?window=${w}`;
          return (
            <Link
              key={w}
              href={href}
              aria-current={active ? "page" : undefined}
              style={{
                padding: "2px 8px",
                borderRadius: 2,
                border: `1px solid ${active ? "var(--v4-acc)" : "var(--v4-line-200)"}`,
                color: active ? "var(--v4-ink-000)" : "var(--v4-ink-300)",
                background: active
                  ? "color-mix(in oklab, var(--v4-acc) 14%, transparent)"
                  : "transparent",
                textDecoration: "none",
              }}
            >
              {WINDOW_LABEL[w]}
            </Link>
          );
        })}
      </nav>

      {(() => {
        const skillRows: SkillRow[] = items.map((item) => {
          const key =
            (item.linkedRepo ?? fullNameFromUrl(item.url))?.toLowerCase() ?? null;
          const uniqueRepo =
            key !== null && (linkedRepoCounts.get(key) ?? 0) === 1;
          const linked = uniqueRepo && key ? (repoByFullName.get(key) ?? null) : null;
          return {
            id: item.id,
            title: item.title,
            author: item.author ?? null,
            href: `/skills/${encodeSkillSlug(item.id)}`,
            logoUrl: item.logoUrl ?? null,
            stars:
              typeof item.popularity === "number"
                ? item.popularity
                : (linked?.stars ?? 0),
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
          return (
            <p
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 12,
                color: "var(--v4-ink-300)",
                padding: "24px 0",
              }}
            >
              No skills leaderboard rows have landed yet. Waiting for upstream
              fetchers to populate Redis.
            </p>
          );
        }
        const sortKey =
          sortWindow === "24h" ? "s24" : sortWindow === "30d" ? "s30" : "s7";
        return <SkillsTopTable rows={skillRows} defaultSortKey={sortKey} />;
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
        <p
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 12,
            color: "var(--v4-ink-300)",
            padding: "24px 0",
          }}
        >
          No skills created or pushed in the last 7 days.
        </p>
      )}

      <SectionHead num="// 03" title="Most-cited skills" as="h3" />
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
            <li key={item.id}>
              <Link
                href={`/skills/${encodeSkillSlug(item.id)}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  border: "1px solid var(--v4-line-200)",
                  borderRadius: 3,
                  background: "var(--v4-bg-050)",
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  color: "var(--v4-ink-200)",
                  textDecoration: "none",
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
                    }}
                  >
                    {item.author ?? item.sourceLabel}
                  </span>
                </span>
                <span
                  style={{
                    color: "var(--v4-amber)",
                    fontWeight: 600,
                  }}
                >
                  {formatNumber(item.derivativeRepoCount ?? 0)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 12,
            color: "var(--v4-ink-300)",
            padding: "12px 0",
          }}
        >
          No derivative repo citations recorded yet.
        </p>
      )}
    </main>
  );
}

interface SkillAvatarProps {
  logoUrl: string | null;
  fallback: string;
}

function SkillAvatar({ logoUrl, fallback }: SkillAvatarProps) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
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

