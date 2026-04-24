import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Globe } from "lucide-react";
import { GithubIcon, XIcon } from "@/components/brand/BrandIcons";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import type {
  TwitterLeaderboardRow,
  TwitterMentionAuthorBubble,
} from "@/lib/twitter/types";
import {
  getTwitterLeaderboard,
  getTwitterOverviewStats,
  getTwitterTrendingRepoLeaderboard,
} from "@/lib/twitter/service";

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

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-border-primary rounded-md px-4 py-3 bg-bg-secondary">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold truncate">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-text-tertiary truncate">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

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
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-primary bg-bg-secondary text-text-tertiary transition-colors hover:border-brand/40 hover:text-brand"
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
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-primary bg-bg-secondary text-text-tertiary transition-colors hover:border-brand/40 hover:text-brand"
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

  return (
    <nav
      aria-label="Twitter leaderboard tabs"
      className="mb-6 flex items-center gap-1 border-b border-border-primary overflow-x-auto scrollbar-hide"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-2 border-b-2 px-3 text-xs uppercase tracking-wider transition-colors ${
              isActive
                ? "border-brand text-brand"
                : "border-transparent text-text-tertiary hover:text-text-secondary"
            }`}
          >
            <span>{tab.label}</span>
            <span className="inline-flex h-[18px] min-w-[22px] items-center justify-center rounded border border-border-primary bg-bg-secondary px-1 text-[10px] tabular-nums text-text-tertiary">
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

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              X / TRENDING REPO MENTIONS
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// main repo rank plus real X buzz - last 24h"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-2xl">
            Default view follows the main TrendingRepo ranking and filters to
            repos with accepted X mentions. The global tab keeps the raw X-only
            score as a separate signal.
          </p>
        </header>

        <TwitterTabNav
          activeTab={activeTab}
          trendingCount={trendingRows.length}
          globalCount={globalRows.length}
        />

        <section className="mb-6 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <Stat
            label="Last scan"
            value={stats.lastScannedAt ? getRelativeTime(stats.lastScannedAt) : "--"}
            hint={stats.lastScannedAt ?? "no scans yet"}
          />
          <Stat
            label="Repos with buzz"
            value={stats.reposWithMentions.toLocaleString("en-US")}
            hint={`${stats.scansStored} scans stored`}
          />
          <Stat
            label="Badged repos"
            value={stats.badgedRepos.toLocaleString("en-US")}
          />
          <Stat
            label="Breakouts"
            value={stats.breakoutRepos.toLocaleString("en-US")}
          />
          <Stat
            label="Mentions 24h"
            value={formatNumber(stats.totalMentions24h)}
          />
          <Stat
            label="Likes 24h"
            value={formatNumber(stats.totalLikes24h)}
          />
          <Stat
            label="Reposts 24h"
            value={formatNumber(stats.totalReposts24h)}
          />
          <Stat
            label="Top score"
            value={stats.topRepoScore !== null ? stats.topRepoScore.toFixed(1) : "--"}
            hint={stats.topRepoFullName ?? "no leader yet"}
          />
        </section>

        {rows.length === 0 ? (
          <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
            <h2 className="text-lg font-bold uppercase tracking-wider text-brand">
              {activeTab === "global"
                ? "// no global X findings yet"
                : "// no trending repo X findings yet"}
            </h2>
            <p className="mt-3 text-sm text-text-secondary max-w-xl">
              Post a completed OpenClaw scan to{" "}
              <code className="text-text-primary">
                /api/internal/signals/twitter/v1/ingest
              </code>{" "}
              to populate this leaderboard.
            </p>
          </section>
        ) : (
          <section className="border border-border-primary rounded-md bg-bg-secondary overflow-x-auto">
            <div className="min-w-[840px]">
              <div className="grid grid-cols-[36px_56px_minmax(260px,1.7fr)_72px_72px_72px_72px_88px] gap-3 items-center px-3 h-8 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
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

                  return (
                    <li
                      key={row.repoId}
                      className="grid grid-cols-[36px_56px_minmax(260px,1.7fr)_72px_72px_72px_72px_88px] gap-3 items-center px-3 py-2 border-b border-border-primary/40 last:border-b-0 hover:bg-bg-card-hover"
                    >
                      <div className="text-text-tertiary text-xs tabular-nums">
                        {rankLabel}
                      </div>
                      <div className="flex items-center justify-center">
                        <MentionAuthorBubbles authors={row.topMentionAuthors} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <Image
                              src={getRepoAvatarUrl(row)}
                              alt=""
                              width={18}
                              height={18}
                              unoptimized
                              className="h-[18px] w-[18px] shrink-0 rounded-full border border-border-primary bg-bg-tertiary"
                            />
                            <Link
                              href={`/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`}
                              className="truncate text-sm text-text-primary hover:text-brand transition-colors"
                            >
                              {row.githubFullName}
                            </Link>
                          </div>
                          <RepoActionLinks row={row} />
                        </div>
                        {activeTab === "trending" ? (
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-text-tertiary">
                            {row.momentumScore !== undefined ? (
                              <span>
                                {row.momentumScore.toFixed(1)} momentum
                              </span>
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
                      <div className="text-right text-xs tabular-nums text-text-primary">
                        {formatNumber(row.mentionCount24h)}
                      </div>
                      <div className="text-right text-xs tabular-nums text-text-primary">
                        {formatNumber(row.totalLikes24h)}
                      </div>
                      <div className="text-right text-xs tabular-nums text-text-primary">
                        {formatNumber(row.totalReposts24h)}
                      </div>
                      <div className="text-right text-xs tabular-nums text-brand">
                        {row.finalTwitterScore.toFixed(1)}
                      </div>
                      <div>
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                            row.badgeState === "x_fire"
                              ? "border-brand/40 bg-brand/10 text-brand"
                              : row.badgeState === "x"
                                ? "border-[#1d9bf0]/40 bg-[#1d9bf0]/10 text-[#4db7ff]"
                                : "border-border-primary text-text-tertiary"
                          }`}
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
