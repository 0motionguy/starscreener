// /twitter — V4 SourceFeedTemplate consumer.
//
// Trending repos with X/Twitter mentions in the last 24 hours, scored by the
// Apify-backed signal pipeline. Two tabs: trending pipeline overlap vs. the
// global X score.

import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Globe } from "lucide-react";
import { GithubIcon, XIcon } from "@/components/brand/BrandIcons";
import { formatNumber } from "@/lib/utils";
import type {
  TwitterLeaderboardRow,
  TwitterMentionAuthorBubble,
} from "@/lib/twitter/types";
import {
  getTwitterLeaderboard,
  getTwitterOverviewStats,
  getTwitterTrendingRepoLeaderboard,
} from "@/lib/twitter/service";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

const X_BLUE = "var(--v4-src-x)";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Trending Repos on X",
  description:
    "TrendingRepo-ranked repositories with real X/Twitter mentions in the last 24 hours.",
  alternates: { canonical: "/twitter" },
};

type TwitterTab = "trending" | "global";

function parseTwitterTab(raw: string | string[] | undefined): TwitterTab {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  // Default = "global" (sorted by finalTwitterScore). The previous default
  // "trending" walked getDerivedRepos() which is sorted by overall
  // momentumScore (GH+HN+Reddit composite) — Twitter signals were just a
  // filter, not the rank. That made the same momentum-leading repo sit on
  // top day after day regardless of actual X activity.
  return candidate === "trending" ? "trending" : "global";
}

function formatClock(iso: string | undefined | null): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

function formatClock(iso: string | undefined | null): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

const AUTHOR_BUBBLE_TONES = [
  {
    backgroundColor: "rgba(122, 167, 255, 0.16)",
    borderColor: "rgba(122, 167, 255, 0.36)",
    color: "#bcd2ff",
  },
  {
    backgroundColor: "rgba(16, 185, 129, 0.16)",
    borderColor: "rgba(16, 185, 129, 0.36)",
    color: "#8df3c9",
  },
  {
    backgroundColor: "rgba(244, 114, 182, 0.16)",
    borderColor: "rgba(244, 114, 182, 0.36)",
    color: "#f9b4d9",
  },
  {
    backgroundColor: "rgba(251, 191, 36, 0.16)",
    borderColor: "rgba(251, 191, 36, 0.36)",
    color: "#f5d778",
  },
  {
    backgroundColor: "rgba(168, 85, 247, 0.16)",
    borderColor: "rgba(168, 85, 247, 0.36)",
    color: "#dbb8ff",
  },
] as const;

function getAuthorBubbleTone(handle: string) {
  let hash = 0;
  for (const char of handle) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return AUTHOR_BUBBLE_TONES[hash % AUTHOR_BUBBLE_TONES.length];
}

function getAuthorInitial(handle: string): string {
  const normalized = handle.replace(/^@+/, "").trim();
  return normalized.charAt(0).toUpperCase() || "X";
}

function getProjectWebsiteUrl(row: TwitterLeaderboardRow): string | null {
  return row.homepageUrl ?? row.docsUrl ?? null;
}

function getRepoAvatarUrl(row: TwitterLeaderboardRow): string {
  if (row.ownerAvatarUrl) return row.ownerAvatarUrl;
  const owner = row.githubFullName.split("/", 1)[0]?.trim();
  return owner ? `https://github.com/${owner}.png?size=40` : "/favicon.ico";
}

function RepoActionLinks({ row }: { row: TwitterLeaderboardRow }) {
  const websiteUrl = getProjectWebsiteUrl(row);

  return (
    <div className="inline-flex shrink-0 items-center gap-1">
      {row.topPostUrl ? (
        <Link
          href={row.topPostUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors"
          style={{
            border: "1px solid var(--v4-line-200)",
            background: "var(--v4-bg-100)",
            color: "var(--v4-ink-400)",
          }}
          aria-label={`Open the strongest X mention for ${row.githubFullName}`}
          title={`Open the strongest X mention for ${row.githubFullName}`}
        >
          <XIcon size={11} monochrome />
        </Link>
      ) : null}
      <Link
        href={row.githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-primary bg-bg-secondary text-text-tertiary transition-colors hover:border-brand/40 hover:text-brand"
        aria-label={`Open ${row.githubFullName} on GitHub`}
        title={`Open ${row.githubFullName} on GitHub`}
      >
        <GithubIcon size={11} monochrome />
      </Link>
      {websiteUrl ? (
        <Link
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors"
          style={{
            border: "1px solid var(--v4-line-200)",
            background: "var(--v4-bg-100)",
            color: "var(--v4-ink-400)",
          }}
          aria-label={
            row.homepageUrl
              ? `Open the project website for ${row.githubFullName}`
              : `Open the docs for ${row.githubFullName}`
          }
          title={
            row.homepageUrl
              ? `Open the project website for ${row.githubFullName}`
              : `Open the docs for ${row.githubFullName}`
          }
        >
          <Globe size={11} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function MentionAuthorBubbles({
  authors,
}: {
  authors: TwitterMentionAuthorBubble[];
}) {
  if (authors.length === 0) {
    return <span className="text-[10px] text-text-tertiary">--</span>;
  }

  return (
    <div className="inline-flex items-center justify-center">
      {authors.slice(0, 5).map((author, index) => {
        const tone = getAuthorBubbleTone(author.authorHandle);
        const avatarUrl = author.avatarUrl ?? null;
        const initial = getAuthorInitial(author.authorHandle);

        return (
          <Link
            key={`${author.profileUrl}:${author.postUrl}`}
            href={author.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${
              index === 0 ? "" : "-ml-1.5"
            } relative inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border text-[9px] font-semibold uppercase ring-1 ring-bg-secondary transition-transform hover:z-10 hover:-translate-y-0.5`}
            style={tone}
            aria-label={`Open top X mention from @${author.authorHandle}`}
            title={`@${author.authorHandle} - ${formatNumber(author.engagement)} engagement`}
          >
            {/* Initial sits behind the image so it shows through when unavatar.io
                rate-limits us (429) or the avatar URL otherwise fails to load.
                Without this, broken-image placeholders rendered as empty
                colored circles in production. */}
            <span aria-hidden className="absolute inset-0 flex items-center justify-center">
              {initial}
            </span>
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt=""
                width={20}
                height={20}
                unoptimized
                loading="lazy"
                className="relative h-full w-full object-cover"
              />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

function TwitterTabNav({
  activeTab,
  trendingCount,
  globalCount,
}: {
  activeTab: TwitterTab;
  trendingCount: number;
  globalCount: number;
}) {
  const tabs: { id: TwitterTab; label: string; count: number; href: string }[] = [
    {
      id: "global",
      label: "Top X buzz",
      count: globalCount,
      href: "/twitter",
    },
    {
      id: "trending",
      label: "By repo momentum",
      count: trendingCount,
      href: "/twitter?tab=trending",
    },
  ];

  return (
    <nav
      aria-label="Twitter leaderboard tabs"
      className="mb-6 flex items-center gap-1 overflow-x-auto scrollbar-hide"
      style={{ borderBottom: "1px solid var(--v4-line-100)" }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className="v2-mono inline-flex min-h-[40px] shrink-0 items-center gap-2 px-3 text-[11px] uppercase tracking-[0.18em] transition-colors"
            style={{
              color: isActive ? "var(--v4-ink-100)" : "var(--v4-ink-400)",
              borderBottom: isActive
                ? `2px solid ${X_BLUE}`
                : "2px solid transparent",
            }}
          >
            <span>{tab.label}</span>
            <span
              className="inline-flex h-[18px] min-w-[22px] items-center justify-center px-1 text-[10px] tabular-nums"
              style={{
                border: "1px solid var(--v4-line-200)",
                background: "var(--v4-bg-100)",
                color: "var(--v4-ink-400)",
                borderRadius: 2,
              }}
            >
              {tab.count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

export default async function TwitterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab: rawTab } = await searchParams;
  const activeTab = parseTwitterTab(rawTab);

  const [trendingRows, globalRows, stats] = await Promise.all([
    getTwitterTrendingRepoLeaderboard(200),
    getTwitterLeaderboard(200),
    getTwitterOverviewStats(),
  ]);
  const rows = activeTab === "global" ? globalRows : trendingRows;

  const cold = rows.length === 0;

  if (cold) {
    return (
      <main className="home-surface">
        <SourceFeedTemplate
          crumb={
            <>
              <b>X</b> · TERMINAL · /TWITTER
            </>
          }
          title="X · top tweets"
          lede="TrendingRepo-ranked repositories with real X/Twitter mentions in the last 24 hours, sourced from the Apify tweet-scraper pipeline."
          clock={
            <>
              <span className="big">{formatClock(stats.lastScannedAt)}</span>
              <span className="muted">UTC · SCRAPED</span>
              <LiveDot label="LIVE · 24H" />
            </>
          }
        />
        <ColdState activeTab={activeTab} />
      </main>
    );
  }

  // KPI snapshot.
  const trackedTweets = stats.totalMentions24h;
  const topLikes = rows.reduce((m, r) => Math.max(m, r.totalLikes24h), 0);
  const topReposts = rows.reduce((m, r) => Math.max(m, r.totalReposts24h), 0);
  const peakEngagement = Math.max(topLikes, topReposts);
  const peakEngagementLabel = topLikes >= topReposts ? "TOP LIKES" : "TOP RTS";
  const kolHandles = new Set<string>();
  for (const row of rows) {
    for (const author of row.topMentionAuthors) {
      if (author.authorHandle) kolHandles.add(author.authorHandle.toLowerCase());
    }
  }

  return (
    <main className="home-surface">
      <SourceFeedTemplate
        crumb={
          <>
            <b>X</b> · TERMINAL · /TWITTER
          </>
        }
        title="X · top tweets"
        lede="TrendingRepo-ranked repositories with real X/Twitter mentions in the last 24 hours, sourced from the Apify tweet-scraper pipeline."
        clock={
          <>
            <span className="big">{formatClock(stats.lastScannedAt)}</span>
            <span className="muted">UTC · SCRAPED</span>
            <LiveDot label="LIVE · 24H" />
          </>
        }
        snapshot={
          <KpiBand
            cells={[
              {
                label: "TRACKED",
                value: trackedTweets.toLocaleString("en-US"),
                sub: "tweets 24h",
                pip: "var(--v4-src-x)",
              },
              {
                label: peakEngagementLabel,
                value: peakEngagement.toLocaleString("en-US"),
                sub: "engagement peak",
                tone: "acc",
                pip: "var(--v4-acc)",
              },
              {
                label: "KOLS",
                value: kolHandles.size.toLocaleString("en-US"),
                sub: "unique authors",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "GH-LINKED",
                value: rows.length.toLocaleString("en-US"),
                sub: "repos with buzz",
                pip: "var(--v4-blue)",
              },
            ]}
          />
        }
        listEyebrow={
          activeTab === "global"
            ? "Tweet feed · global X score"
            : "Tweet feed · trending repos with X mentions"
        }
        list={
          <>
            <TwitterTabNav
              activeTab={activeTab}
              trendingCount={trendingRows.length}
              globalCount={globalRows.length}
            />
            <TwitterLeaderboardTable rows={rows} activeTab={activeTab} />
          </>
        }
      />
    </main>
  );
}

function TwitterLeaderboardTable({
  rows,
  activeTab,
}: {
  rows: TwitterLeaderboardRow[];
  activeTab: TwitterTab;
}) {
  return (
    <section
      className="overflow-x-auto"
      style={{
        background: "var(--v4-bg-050)",
        border: "1px solid var(--v4-line-200)",
        borderRadius: 2,
      }}
    >
      <div className="min-w-[840px]">
        <div
          className="v2-mono grid h-9 grid-cols-[36px_56px_minmax(260px,1.7fr)_72px_72px_72px_72px_88px] items-center gap-3 px-3 text-[10px] uppercase tracking-[0.18em]"
          style={{
            borderBottom: "1px solid var(--v4-line-100)",
            background: "var(--v4-bg-025)",
            color: "var(--v4-ink-400)",
          }}
        >
          <div>{activeTab === "global" ? "#" : "TR"}</div>
          <div className="text-center">Top</div>
          <div>Repo</div>
          <div className="text-right">Mentions</div>
          <div className="text-right">Likes</div>
          <div className="text-right">Reposts</div>
          <div className="text-right">Score</div>
          <div>Badge</div>
        </div>
        <ol>
          {rows.map((row, index) => {
            const [owner, name] = row.githubFullName.split("/", 2);
            const badgeLabel =
              row.badgeState === "x_fire"
                ? "X FIRE"
                : row.badgeState === "x"
                  ? "X"
                  : "--";
            const rankLabel =
              activeTab === "trending" && row.trendingRank
                ? `#${row.trendingRank}`
                : `#${index + 1}`;
            const stagger = Math.min(index, 6) * 50;

            const badgeStyle =
              row.badgeState === "x_fire"
                ? {
                    border: "1px solid rgba(245, 110, 15, 0.4)",
                    background: "rgba(245, 110, 15, 0.1)",
                    color: "var(--v4-acc)",
                  }
                : row.badgeState === "x"
                  ? {
                      border: `1px solid ${X_BLUE}66`,
                      background: `${X_BLUE}1A`,
                      color: X_BLUE,
                    }
                  : {
                      border: "1px solid var(--v4-line-200)",
                      color: "var(--v4-ink-400)",
                    };

            return (
              <li
                key={row.repoId}
                className="v2-row group grid grid-cols-[36px_56px_minmax(260px,1.7fr)_72px_72px_72px_72px_88px] items-center gap-3 px-3 py-2"
                style={{
                  borderBottom: "1px dashed var(--v4-line-100)",
                  animation:
                    "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                  animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
                }}
              >
                <div
                  className="text-xs tabular-nums"
                  style={{ color: "var(--v4-ink-400)" }}
                >
                  {rankLabel}
                </div>
                <div className="flex items-center justify-center">
                  <MentionAuthorBubbles authors={row.topMentionAuthors} />
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Image
                        src={getRepoAvatarUrl(row)}
                        alt=""
                        width={18}
                        height={18}
                        unoptimized
                        className="h-[18px] w-[18px] shrink-0 rounded-full"
                        style={{
                          border: "1px solid var(--v4-line-200)",
                          background: "var(--v4-bg-100)",
                        }}
                      />
                      <Link
                        href={`/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`}
                        className="truncate text-sm font-medium transition-colors hover:text-[color:var(--v4-acc)]"
                        style={{ color: "var(--v4-ink-100)" }}
                      >
                        {row.githubFullName}
                      </Link>
                    </div>
                    <RepoActionLinks row={row} />
                  </div>
                  {activeTab === "trending" ? (
                    <div
                      className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]"
                      style={{ color: "var(--v4-ink-400)" }}
                    >
                      {row.momentumScore !== undefined ? (
                        <span>{row.momentumScore.toFixed(1)} momentum</span>
                      ) : null}
                      {row.starsDelta24h !== undefined ? (
                        <span>
                          {formatSignedNumber(row.starsDelta24h)} stars 24h
                        </span>
                      ) : null}
                      {row.stars !== undefined ? (
                        <span>{formatNumber(row.stars)} stars</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div
                  className="text-right text-xs tabular-nums"
                  style={{ color: "var(--v4-ink-100)" }}
                >
                  {formatNumber(row.mentionCount24h)}
                </div>
                <div
                  className="text-right text-xs tabular-nums"
                  style={{ color: "var(--v4-ink-100)" }}
                >
                  {formatNumber(row.totalLikes24h)}
                </div>
                <div
                  className="text-right text-xs tabular-nums"
                  style={{ color: "var(--v4-ink-100)" }}
                >
                  {formatNumber(row.totalReposts24h)}
                </div>
                <div
                  className="text-right text-xs font-semibold tabular-nums"
                  style={{ color: "var(--v4-acc)" }}
                >
                  {row.finalTwitterScore.toFixed(1)}
                </div>
                <div>
                  <span
                    className="v2-mono inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]"
                    style={{ ...badgeStyle, borderRadius: 2 }}
                  >
                    {badgeLabel}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cold-state fallback
// ---------------------------------------------------------------------------

function ColdState({ activeTab }: { activeTab: TwitterTab }) {
  return (
    <section
      style={{
        padding: 32,
        background: "var(--v4-bg-025)",
        border: "1px dashed var(--v4-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono"
        style={{
          color: X_BLUE,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {activeTab === "global"
          ? "// no global X findings yet"
          : "// no trending repo X findings yet"}
      </h2>
      <p
        style={{
          marginTop: 12,
          maxWidth: "32rem",
          fontSize: 13,
          color: "var(--v4-ink-300)",
        }}
      >
        Post a completed OpenClaw scan to{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>
          /api/internal/signals/twitter/v1/ingest
        </code>{" "}
        to populate this leaderboard.
      </p>
    </section>
  );
}
