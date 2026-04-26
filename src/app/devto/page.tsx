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
  devtoBodyFetchMode,
  devtoFetchedAt,
  getDevtoLeaderboard,
  refreshDevtoMentionsFromStore,
} from "@/lib/devto";
import {
  getDevtoTopArticles,
  getDevtoTrendingFile,
  refreshDevtoTrendingFromStore,
} from "@/lib/devto-trending";
import { repoFullNameToHref } from "@/lib/hackernews";

export const dynamic = "force-static";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "unknown";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

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
  const sliceCount = trendingFile.discoverySlices?.length ?? 0;
  const tagCount = trendingFile.priorityTags?.length ?? 0;
  const cold = totalArticles === 0 && reposLinked === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Header */}
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              DEV.TO / ARTICLES
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// long-form developer writing + tutorials"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-3xl">
            Top dev.to articles scraped via the public dev.to API and ranked by
            a velocity score that blends reactions, comments, and post age.
            Discovery now combines global popularity slices plus curated AI/dev
            tag slices ({tagCount} tags, {sliceCount} total slices). Article
            bodies are scanned for GitHub links so each piece is cross-referenced
            back to the tracked repo set — useful for spotting which projects
            are getting written-up in tutorial form, not just starred.
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <>
            {/* Stat tiles */}
            <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile
                label="LAST SCRAPE"
                value={formatRelative(devtoFetchedAt)}
                hint={
                  devtoFetchedAt
                    ? new Date(devtoFetchedAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")
                    : undefined
                }
              />
              <StatTile
                label="ARTICLES TRACKED"
                value={totalArticles.toLocaleString("en-US")}
                hint={`${trendingFile.windowDays}d window · ${trendingFile.scannedArticles.toLocaleString("en-US")} scanned`}
              />
              <StatTile
                label="REPOS LINKED"
                value={reposLinked.toLocaleString("en-US")}
                hint="github mentions in body/tags"
              />
              <StatTile
                label="DISCOVERY"
                value={sliceCount.toLocaleString("en-US")}
                hint={
                  sliceCount > 0
                    ? `${tagCount} tags + rising/fresh + top`
                    : devtoBodyFetchMode
                }
              />
            </section>

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

function ArticlesFeed({
  articles,
}: {
  articles: ReturnType<typeof getDevtoTopArticles>;
}) {
  return (
    <div className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      <div className="grid grid-cols-[40px_1fr_60px_60px_80px] md:grid-cols-[40px_1fr_80px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>TITLE · AUTHOR</div>
        <div className="text-right">REACT</div>
        <div className="text-right">CMTS</div>
        <div className="hidden md:block">TAG</div>
        <div className="text-right">POSTED</div>
      </div>
      <ul>
        {articles.map((a, i) => {
          const tag = a.tags?.[0];
          const isHigh = a.reactionsCount >= 50;
          return (
            <li
              key={a.id}
              className="grid grid-cols-[40px_1fr_60px_60px_80px] md:grid-cols-[40px_1fr_80px_60px_60px_80px] gap-3 items-center px-3 h-12 hover:bg-bg-card-hover transition-colors border-b border-border-primary/40 last:border-b-0"
            >
              <div className="text-text-tertiary text-xs tabular-nums">
                {i + 1}
              </div>
              <div className="min-w-0">
                <a
                  href={devtoArticleHref(a.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-text-primary hover:text-accent-green truncate block"
                  title={a.title}
                >
                  {a.title}
                </a>
                <div className="text-[11px] text-text-tertiary truncate">
                  by @{a.author.username} · {a.readingTime} min read
                </div>
              </div>
              <div
                className={`text-right text-xs tabular-nums inline-flex items-center justify-end gap-1 ${
                  isHigh ? "text-up font-semibold" : "text-text-secondary"
                }`}
              >
                <HeartIcon className="w-3 h-3" />
                <span>{a.reactionsCount.toLocaleString("en-US")}</span>
              </div>
              <div className="text-right text-xs tabular-nums text-text-secondary">
                {a.commentsCount.toLocaleString("en-US")}
              </div>
              <div className="hidden md:block min-w-0">
                {tag ? (
                  <span
                    className="inline-block max-w-full truncate text-[10px] px-1.5 py-0.5 rounded border border-border-primary text-text-tertiary"
                    title={a.tags.join(", ")}
                  >
                    #{tag}
                  </span>
                ) : (
                  <span className="text-text-tertiary text-[10px]">—</span>
                )}
              </div>
              <div className="text-right text-xs tabular-nums text-text-tertiary">
                {formatAgeFromIso(a.publishedAt)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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
      <div className="border border-dashed border-border-primary rounded-md p-4 bg-bg-secondary/40">
        <h3 className="text-[11px] uppercase tracking-wider text-text-tertiary">
          REPO LEADERBOARD
        </h3>
        <p className="mt-2 text-[11px] text-text-tertiary">
          {"// no articles cross-linked to tracked repos yet — broaden the scrape window or wait for fresh data"}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      <div className="px-3 h-9 border-b border-border-primary flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
          REPO LEADERBOARD
        </span>
        <span className="text-[10px] text-text-tertiary tabular-nums">
          {entries.length}/{totalRepos}
        </span>
      </div>
      <div className="grid grid-cols-[28px_1fr_40px_50px] gap-2 items-center px-3 h-7 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>REPO</div>
        <div className="text-right">ART</div>
        <div className="text-right">REACT</div>
      </div>
      <ul>
        {entries.map((entry, i) => (
          <li
            key={entry.fullName}
            className="grid grid-cols-[28px_1fr_40px_50px] gap-2 items-center px-3 h-9 hover:bg-bg-card-hover transition-colors border-b border-border-primary/40 last:border-b-0"
          >
            <div className="text-text-tertiary text-xs tabular-nums">
              {i + 1}
            </div>
            <div className="min-w-0">
              <Link
                href={repoFullNameToHref(entry.fullName)}
                className="text-xs text-text-primary hover:text-accent-green truncate block"
                title={entry.fullName}
              >
                {entry.fullName}
              </Link>
            </div>
            <div className="text-right text-xs tabular-nums text-text-secondary">
              {entry.count7d.toLocaleString("en-US")}
            </div>
            <div className="text-right text-xs tabular-nums text-text-tertiary inline-flex items-center justify-end gap-1">
              <HeartIcon className="w-2.5 h-2.5" />
              {entry.reactionsSum7d.toLocaleString("en-US")}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function StatTile({
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

function ColdState() {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2 className="text-lg font-bold uppercase tracking-wider text-accent-green">
        {"// no dev.to data yet"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        The dev.to scraper hasn&apos;t produced data yet. Run{" "}
        <code className="text-text-primary">npm run scrape:devto</code> locally
        to populate{" "}
        <code className="text-text-primary">data/devto-mentions.json</code> and{" "}
        <code className="text-text-primary">data/devto-trending.json</code>,
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
