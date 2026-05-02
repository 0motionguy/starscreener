// /devto — V4 SourceFeedTemplate consumer.
//
// Long-form developer writing surface. Top 50 articles by velocity score
// + repo leaderboard sidebar (≥md). Single-source from data/devto-* files
// produced by scripts/scrape-devto.mjs.

import type { Metadata } from "next";
import Link from "next/link";
import {
  devtoArticleHref,
  getDevtoLeaderboard,
  refreshDevtoMentionsFromStore,
} from "@/lib/devto";
import {
  getDevtoTopArticles,
  getDevtoTrendingFile,
  refreshDevtoTrendingFromStore,
} from "@/lib/devto-trending";
import { repoFullNameToHref } from "@/lib/hackernews";
import { TerminalFeedTable, type FeedColumn } from "@/components/feed/TerminalFeedTable";
import { WindowedFeedTable } from "@/components/feed/WindowedFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { userLogoUrl, resolveLogoUrl } from "@/lib/logos";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

const DEVTO_BLUE = "#6699ff";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Trending on Dev.to",
  description:
    "Top developer-written articles by velocity score, plus the repo leaderboard mentioned across them. Long-form developer signal, scored.",
  alternates: { canonical: "/devto" },
  openGraph: {
    title: "Trending on Dev.to — TrendingRepo",
    description: "Top developer-written articles by velocity, plus mentioned repos.",
    url: "/devto",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trending on Dev.to — TrendingRepo",
    description: "Top developer-written articles by velocity, plus mentioned repos.",
  },
};

function formatAgeFromIso(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const hours = diff / 3_600_000;
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

export default async function DevtoPage() {
  await Promise.all([
    refreshDevtoTrendingFromStore(),
    refreshDevtoMentionsFromStore(),
  ]);
  const trendingFile = getDevtoTrendingFile();
  const articles = getDevtoTopArticles(50);
  const leaderboard = getDevtoLeaderboard();

  const totalArticles = trendingFile.articles.length;
  const reposLinked = leaderboard.length;
  const cold = totalArticles === 0 && reposLinked === 0;

  if (cold) {
    return (
      <main className="home-surface">
        <SourceFeedTemplate
          crumb={
            <>
              <b>DEV.TO</b> · TERMINAL · /DEVTO
            </>
          }
          title="dev.to · top articles"
          lede="Long-form developer writing ranked by velocity score (reactions × time decay), with a sidebar leaderboard of cross-linked tracked repos."
        />
        <ColdState />
      </main>
    );
  }

  const topReactions = trendingFile.articles.reduce(
    (m, a) => Math.max(m, a.reactionsCount ?? 0),
    0,
  );

  return (
    <main className="home-surface">
      <SourceFeedTemplate
        crumb={
          <>
            <b>DEV.TO</b> · TERMINAL · /DEVTO
          </>
        }
        title="dev.to · top articles"
        lede="Long-form developer writing ranked by velocity score (reactions × time decay), with a sidebar leaderboard of cross-linked tracked repos."
        clock={
          <>
            <span className="big">{formatClock(trendingFile.fetchedAt)}</span>
            <span className="muted">UTC · SCRAPED</span>
            <LiveDot label={`LIVE · ${trendingFile.windowDays}D`} />
          </>
        }
        snapshot={
          <KpiBand
            cells={[
              {
                label: "TRACKED",
                value: totalArticles.toLocaleString("en-US"),
                sub: `${trendingFile.windowDays}d rolling`,
                pip: "var(--v4-src-dev)",
              },
              {
                label: "TOP REACTIONS",
                value: topReactions.toLocaleString("en-US"),
                sub: "engagement peak",
                tone: "acc",
                pip: "var(--v4-acc)",
              },
              {
                label: "LEADERBOARD",
                value: reposLinked,
                sub: "tracked repos · 7d",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "FEED LEN",
                value: articles.length,
                sub: "shown · top 50",
                pip: "var(--v4-blue)",
              },
            ]}
          />
        }
        listEyebrow="Article feed · 24h / 7d / 30d window · repo leaderboard"
        list={
          <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6">
            <section>
              <WindowedArticlesFeed allArticles={trendingFile.articles} />
            </section>
            <aside className="hidden md:block">
              <Leaderboard
                entries={leaderboard.slice(0, 15)}
                totalRepos={reposLinked}
              />
            </aside>
          </div>
        }
      />
    </main>
  );
}

// AUDIT-2026-05-04 follow-up: 24h/7d/30d window switcher on /devto.
// Articles carry `publishedAt` ISO; filter into windows server-side and
// let the client toggle which pre-rendered table to mount.
function WindowedArticlesFeed({ allArticles }: { allArticles: DevtoArticle[] }) {
  const HOUR_MS = 3_600_000;
  const nowMs = Date.now();
  const sortByScore = (list: DevtoArticle[]) =>
    list
      .slice()
      .sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0))
      .slice(0, 50);
  const inWindow = (windowMs: number) =>
    sortByScore(
      allArticles.filter((a) => {
        const t = Date.parse(a.publishedAt);
        return Number.isFinite(t) && nowMs - t <= windowMs;
      }),
    );
  const w24h = inWindow(24 * HOUR_MS);
  const w7d = inWindow(7 * 24 * HOUR_MS);
  const w30d = inWindow(30 * 24 * HOUR_MS);
  return (
    <WindowedFeedTable
      count24h={w24h.length}
      count7d={w7d.length}
      count30d={w30d.length}
      table24h={<ArticlesFeed articles={w24h} />}
      table7d={<ArticlesFeed articles={w7d} />}
      table30d={<ArticlesFeed articles={w30d} />}
      defaultWindow="7d"
    />
  );
}

type DevtoArticle = ReturnType<typeof getDevtoTopArticles>[number];

function ArticlesFeed({ articles }: { articles: DevtoArticle[] }) {
  const columns: FeedColumn<DevtoArticle>[] = [
    {
      id: "rank",
      header: "#",
      width: "44px",
      render: (_, i) => (
        <span
          className="font-mono text-[12px] tabular-nums font-semibold"
          style={{ color: i < 10 ? DEVTO_BLUE : "var(--v4-ink-400)" }}
        >
          {String(i + 1).padStart(2, "0")}
        </span>
      ),
    },
    {
      id: "title",
      header: "Title · Author",
      render: (a) => (
        <div className="flex min-w-0 items-center gap-2">
          <EntityLogo
            src={
              userLogoUrl(
                (
                  a.author as {
                    profile_image?: string | null;
                    profile_image_90?: string | null;
                  } | null
                )?.profile_image ??
                  (
                    a.author as {
                      profile_image_90?: string | null;
                    } | null
                  )?.profile_image_90 ??
                  null,
              ) ??
              (a.author?.username
                ? `https://dev.to/${encodeURIComponent(a.author.username)}.png`
                : null) ??
              resolveLogoUrl(a.url ?? null, a.title, 64)
            }
            name={a.author?.username ?? a.title}
            size={20}
            shape="circle"
            alt=""
          />
          <div className="min-w-0">
            <a
              href={devtoArticleHref(a.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-[13px] font-medium transition-colors hover:text-[color:var(--v4-acc)]"
              style={{ color: "var(--v4-ink-100)" }}
              title={a.title}
            >
              {a.title}
            </a>
            <div
              className="truncate text-[11px]"
              style={{ color: "var(--v4-ink-400)" }}
            >
              by @{a.author.username} · {a.readingTime} min read
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "reactions",
      header: "React",
      width: "84px",
      align: "right",
      render: (a) => (
        <span
          className="inline-flex items-center justify-end gap-1 font-mono text-[12px] tabular-nums"
          style={{
            color: a.reactionsCount >= 50 ? "var(--v4-money)" : "var(--v4-ink-200)",
          }}
        >
          <HeartIcon className="h-3 w-3" />
          {a.reactionsCount.toLocaleString("en-US")}
        </span>
      ),
    },
    {
      id: "comments",
      header: "Cmts",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (a) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-300)" }}
        >
          {a.commentsCount.toLocaleString("en-US")}
        </span>
      ),
    },
    {
      id: "tag",
      header: "Tag",
      width: "100px",
      hideBelow: "md",
      render: (a) => {
        const tag = a.tags?.[0];
        if (!tag) return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
        return (
          <span
            className="v2-mono inline-block max-w-full truncate px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase"
            style={{
              border: "1px solid var(--v4-line-200)",
              color: "var(--v4-ink-400)",
              borderRadius: 2,
            }}
            title={a.tags.join(", ")}
          >
            #{tag}
          </span>
        );
      },
    },
    {
      id: "age",
      header: "Posted",
      width: "70px",
      align: "right",
      render: (a) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {formatAgeFromIso(a.publishedAt)}
        </span>
      ),
    },
  ];

  return (
    <TerminalFeedTable
      rows={articles}
      columns={columns}
      rowKey={(a) => String(a.id)}
      accent={DEVTO_BLUE}
      caption="Top dev.to articles ranked by velocity score"
    />
  );
}

function Leaderboard({
  entries,
  totalRepos,
}: {
  entries: ReturnType<typeof getDevtoLeaderboard>;
  totalRepos: number;
}) {
  if (entries.length === 0) {
    return (
      <div
        className="p-4"
        style={{
          background: "var(--v4-bg-025)",
          border: "1px dashed var(--v4-line-100)",
          borderRadius: 2,
        }}
      >
        <h3
          className="v2-mono text-[11px] uppercase tracking-[0.18em]"
          style={{ color: "var(--v4-ink-300)" }}
        >
          REPO LEADERBOARD
        </h3>
        <p
          className="mt-2 text-[11px]"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {"// no articles cross-linked to tracked repos yet — broaden the scrape window or wait for fresh data"}
        </p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden"
      style={{
        background: "var(--v4-bg-050)",
        border: "1px solid var(--v4-line-200)",
        borderRadius: 2,
      }}
    >
      <div
        className="v2-mono flex h-9 items-center justify-between px-3"
        style={{
          borderBottom: "1px solid var(--v4-line-100)",
          background: "var(--v4-bg-025)",
        }}
      >
        <span
          className="text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--v4-ink-300)" }}
        >
          REPO LEADERBOARD
        </span>
        <span
          className="text-[10px] tabular-nums tracking-[0.14em]"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {entries.length}/{totalRepos}
        </span>
      </div>
      <div
        className="v2-mono grid h-7 grid-cols-[28px_1fr_40px_50px] items-center gap-2 px-3 text-[10px] uppercase tracking-[0.18em]"
        style={{
          borderBottom: "1px solid var(--v4-line-100)",
          color: "var(--v4-ink-400)",
        }}
      >
        <div>#</div>
        <div>REPO</div>
        <div className="text-right">ART</div>
        <div className="text-right">REACT</div>
      </div>
      <ul>
        {entries.map((entry, i) => {
          const stagger = Math.min(i, 6) * 50;
          return (
            <li
              key={entry.fullName}
              className="v2-row group grid h-9 grid-cols-[28px_1fr_40px_50px] items-center gap-2 px-3"
              style={{
                borderBottom: "1px dashed var(--v4-line-100)",
                animation: "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
              }}
            >
              <div
                className="font-mono text-xs tabular-nums"
                style={{ color: "var(--v4-ink-400)" }}
              >
                {i + 1}
              </div>
              <div className="min-w-0">
                <Link
                  href={repoFullNameToHref(entry.fullName)}
                  className="block truncate text-xs transition-colors hover:text-[color:var(--v4-acc)]"
                  style={{ color: "var(--v4-ink-100)" }}
                  title={entry.fullName}
                >
                  {entry.fullName}
                </Link>
              </div>
              <div
                className="text-right text-xs tabular-nums"
                style={{ color: "var(--v4-ink-200)" }}
              >
                {entry.count7d.toLocaleString("en-US")}
              </div>
              <div
                className="inline-flex items-center justify-end gap-1 text-right text-xs tabular-nums"
                style={{ color: "var(--v4-ink-400)" }}
              >
                <HeartIcon className="h-2.5 w-2.5" />
                {entry.reactionsSum7d.toLocaleString("en-US")}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ColdState() {
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
          color: DEVTO_BLUE,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {"// no dev.to data yet"}
      </h2>
      <p style={{ marginTop: 12, maxWidth: "32rem", fontSize: 13, color: "var(--v4-ink-300)" }}>
        The dev.to scraper hasn&apos;t produced data yet. Run{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>npm run scrape:devto</code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>data/devto-mentions.json</code>{" "}
        and{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>data/devto-trending.json</code>,
        then refresh this page.
      </p>
    </section>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4.5 4.5 8.5C19 16.65 12 21 12 21z" />
    </svg>
  );
}
