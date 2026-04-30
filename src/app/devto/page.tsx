// /devto — long-form developer writing surface.
//
// Mirrors the structural rhythm of /hackernews/trending: header strip,
// 4 stat tiles, top-N article feed. Adds a right-rail leaderboard of
// repos cross-linked from article bodies/tags so readers can pivot from
// "what is dev.to writing about" to "which tracked repo is on fire in
// long-form". Single-source: data/devto-mentions.json (per-repo bucket)
// joined with data/devto-trending.json (top-100 by velocity score), both
// produced by scripts/scrape-devto.mjs (cron daily).
//
// Server component, force-static — every request renders identical HTML
// until the next deploy / cron-bumped commit lands.

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
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildDevtoHeaderFromArticles } from "@/components/news/newsTopMetrics";
import { TerminalFeedTable, type FeedColumn } from "@/components/feed/TerminalFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { userLogoUrl, resolveLogoUrl } from "@/lib/logos";

const DEVTO_ACCENT = "rgba(102, 153, 255, 0.85)";
const DEVTO_BLUE = "#6699ff";

export const dynamic = "force-static";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAgeFromIso(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const hours = diff / 3_600_000;
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {cold ? (
          <ColdState />
        ) : (
          <>
            {/* V3 top header — 3 charts + 3 hero articles. The legacy stat
                tiles below this were dropped — covered by the V3 snapshot. */}
            <div className="mb-6">
              <NewsTopHeaderV3
                routeTitle="DEV.TO · TOP ARTICLES"
                liveLabel={`LIVE · ${trendingFile.windowDays}D`}
                eyebrow="// DEV.TO · LIVE FIREHOSE"
                meta={[
                  { label: "TRACKED", value: totalArticles.toLocaleString("en-US") },
                  { label: "WINDOW", value: `${trendingFile.windowDays}D` },
                ]}
                {...buildDevtoHeaderFromArticles(
                  trendingFile.articles,
                  leaderboard,
                )}
                accent={DEVTO_ACCENT}
                caption={[
                  "// LAYOUT compact-v1",
                  "· 3-COL · 320 / 1FR / 1FR",
                  "· DATA UNCHANGED",
                ]}
              />
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6">
              {/* Left: top articles feed */}
              <section>
                <ArticlesFeed articles={articles} />
              </section>

              {/* Right: leaderboard (≥md only) */}
              <aside className="hidden md:block">
                <Leaderboard
                  entries={leaderboard.slice(0, 15)}
                  totalRepos={reposLinked}
                />
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Articles feed
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Leaderboard (right rail)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function ColdState() {
  return (
    <section
      className="p-8"
      style={{
        background: "var(--v4-bg-025)",
        border: "1px dashed var(--v4-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono text-lg font-bold uppercase tracking-[0.18em]"
        style={{ color: DEVTO_BLUE }}
      >
        {"// no dev.to data yet"}
      </h2>
      <p
        className="mt-3 max-w-xl text-sm"
        style={{ color: "var(--v4-ink-300)" }}
      >
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
