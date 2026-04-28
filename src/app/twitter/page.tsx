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
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildTwitterHeader } from "@/components/twitter/twitterTopMetrics";

const TWITTER_ACCENT = "rgba(29, 155, 240, 0.85)";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trending Repos on X",
  description:
    "TrendingRepo-ranked repositories with real X/Twitter mentions in the last 24 hours.",
  alternates: { canonical: "/twitter" },
};

type TwitterTab = "trending" | "global";

function parseTwitterTab(raw: string | string[] | undefined): TwitterTab {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return candidate === "global" ? "global" : "trending";
}

const AUTHOR_BUBBLE_TONES = [
  {
    backgroundColor: "rgba(29, 155, 240, 0.16)",
    borderColor: "rgba(29, 155, 240, 0.36)",
    color: "#8fd2ff",
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
            border: "1px solid var(--v3-line-200)",
            background: "var(--v3-bg-100)",
            color: "var(--v3-ink-400)",
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
            border: "1px solid var(--v3-line-200)",
            background: "var(--v3-bg-100)",
            color: "var(--v3-ink-400)",
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

        return (
          <Link
            key={`${author.profileUrl}:${author.postUrl}`}
            href={author.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${
              index === 0 ? "" : "-ml-1.5"
            } inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border text-[9px] font-semibold uppercase ring-1 ring-bg-secondary transition-transform hover:z-10 hover:-translate-y-0.5`}
            style={tone}
            aria-label={`Open top X mention from @${author.authorHandle}`}
            title={`@${author.authorHandle} - ${formatNumber(author.engagement)} engagement`}
          >
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt=""
                width={20}
                height={20}
                unoptimized
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              getAuthorInitial(author.authorHandle)
            )}
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
      id: "trending",
      label: "Trending repos + X",
      count: trendingCount,
      href: "/twitter",
    },
    {
      id: "global",
      label: "Global X score",
      count: globalCount,
      href: "/twitter?tab=global",
    },
  ];

  const TWITTER_BLUE = "#1d9bf0";
  return (
    <nav
      aria-label="Twitter leaderboard tabs"
      className="mb-6 flex items-center gap-1 overflow-x-auto scrollbar-hide"
      style={{ borderBottom: "1px solid var(--v3-line-100)" }}
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
              color: isActive ? "var(--v3-ink-100)" : "var(--v3-ink-400)",
              borderBottom: isActive
                ? `2px solid ${TWITTER_BLUE}`
                : "2px solid transparent",
            }}
          >
            <span>{tab.label}</span>
            <span
              className="inline-flex h-[18px] min-w-[22px] items-center justify-center px-1 text-[10px] tabular-nums"
              style={{
                border: "1px solid var(--v3-line-200)",
                background: "var(--v3-bg-100)",
                color: "var(--v3-ink-400)",
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
    getTwitterTrendingRepoLeaderboard(100),
    getTwitterLeaderboard(100),
    getTwitterOverviewStats(),
  ]);
  const rows = activeTab === "global" ? globalRows : trendingRows;
  const { cards, topStories } = buildTwitterHeader(rows, stats);

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <TwitterTabNav
          activeTab={activeTab}
          trendingCount={trendingRows.length}
          globalCount={globalRows.length}
        />

        <div className="mb-6">
          <NewsTopHeaderV3
            cards={cards}
            topStories={topStories}
            accent={TWITTER_ACCENT}
            routeTitle="X · TOP TWEETS"
            liveLabel="LIVE · 24H"
            eyebrow="// X · TWITTER · LIVE FIREHOSE"
            meta={[
              { label: "ROWS", value: rows.length.toLocaleString("en-US") },
              { label: "WINDOW", value: "24H" },
            ]}
            caption={[
              "// LAYOUT compact-v1",
              "· 3-COL · 320 / 1FR / 1FR",
              "· DATA UNCHANGED",
            ]}
          />
        </div>

        {rows.length === 0 ? (
          <section
            className="p-8"
            style={{
              background: "var(--v3-bg-025)",
              border: "1px dashed var(--v3-line-100)",
              borderRadius: 2,
            }}
          >
            <h2
              className="v2-mono text-lg font-bold uppercase tracking-[0.18em]"
              style={{ color: "var(--v3-acc)" }}
            >
              {activeTab === "global"
                ? "// no global X findings yet"
                : "// no trending repo X findings yet"}
            </h2>
            <p
              className="mt-3 max-w-xl text-sm"
              style={{ color: "var(--v3-ink-300)" }}
            >
              Post a completed OpenClaw scan to{" "}
              <code style={{ color: "var(--v3-ink-100)" }}>
                /api/internal/signals/twitter/v1/ingest
              </code>{" "}
              to populate this leaderboard.
            </p>
          </section>
        ) : (
          <section
            className="overflow-x-auto"
            style={{
              background: "var(--v3-bg-050)",
              border: "1px solid var(--v3-line-200)",
              borderRadius: 2,
            }}
          >
            <div className="min-w-[840px]">
              <div
                className="v2-mono grid h-9 grid-cols-[36px_56px_minmax(260px,1.7fr)_72px_72px_72px_72px_88px] items-center gap-3 px-3 text-[10px] uppercase tracking-[0.18em]"
                style={{
                  borderBottom: "1px solid var(--v3-line-100)",
                  background: "var(--v3-bg-025)",
                  color: "var(--v3-ink-400)",
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
                          color: "var(--v3-acc)",
                        }
                      : row.badgeState === "x"
                        ? {
                            border: "1px solid rgba(29, 155, 240, 0.4)",
                            background: "rgba(29, 155, 240, 0.1)",
                            color: "#4db7ff",
                          }
                        : {
                            border: "1px solid var(--v3-line-200)",
                            color: "var(--v3-ink-400)",
                          };

                  return (
                    <li
                      key={row.repoId}
                      className="v2-row group grid grid-cols-[36px_56px_minmax(260px,1.7fr)_72px_72px_72px_72px_88px] items-center gap-3 px-3 py-2"
                      style={{
                        borderBottom: "1px dashed var(--v3-line-100)",
                        animation:
                          "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                        animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
                      }}
                    >
                      <div
                        className="text-xs tabular-nums"
                        style={{ color: "var(--v3-ink-400)" }}
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
                                border: "1px solid var(--v3-line-200)",
                                background: "var(--v3-bg-100)",
                              }}
                            />
                            <Link
                              href={`/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`}
                              className="truncate text-sm font-medium transition-colors hover:text-[color:var(--v3-acc)]"
                              style={{ color: "var(--v3-ink-100)" }}
                            >
                              {row.githubFullName}
                            </Link>
                          </div>
                          <RepoActionLinks row={row} />
                        </div>
                        {activeTab === "trending" ? (
                          <div
                            className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]"
                            style={{ color: "var(--v3-ink-400)" }}
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
                        style={{ color: "var(--v3-ink-100)" }}
                      >
                        {formatNumber(row.mentionCount24h)}
                      </div>
                      <div
                        className="text-right text-xs tabular-nums"
                        style={{ color: "var(--v3-ink-100)" }}
                      >
                        {formatNumber(row.totalLikes24h)}
                      </div>
                      <div
                        className="text-right text-xs tabular-nums"
                        style={{ color: "var(--v3-ink-100)" }}
                      >
                        {formatNumber(row.totalReposts24h)}
                      </div>
                      <div
                        className="text-right text-xs font-semibold tabular-nums"
                        style={{ color: "var(--v3-acc)" }}
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
        )}
      </div>
    </main>
  );
}
