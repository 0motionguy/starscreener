// /news — unified News Terminal.
//
// Consolidates HackerNews + Bluesky + dev.to + ProductHunt + Lobsters into
// a single tabbed overview page. Each tab renders a 10-row compact list of
// the source's top items and links out to the dedicated /hackernews/trending
// or /bluesky/trending deep view when one exists. Per-source pages stay
// alive for deep-linking — this surface is the consolidated "morning
// terminal" view.
//
// Server component, URL-driven tab state (?tab=...), no client JS required.
// Mirrors the visual rhythm of /hackernews/trending: header strip, stat
// tiles, list rows, monospace tone.

import Link from "next/link";
import {
  getHnTopStories,
  getHnTrendingFile,
} from "@/lib/hackernews-trending";
import {
  getHnLeaderboard,
  hnItemHref,
  type HnStory,
} from "@/lib/hackernews";
import { getBlueskyTopPosts, getBlueskyTrendingFile } from "@/lib/bluesky-trending";
import {
  blueskyCold,
  bskyPostHref,
  getBlueskyLeaderboard,
  type BskyPost,
} from "@/lib/bluesky";
import {
  devtoArticleHref,
  getDevtoFile,
  getDevtoLeaderboard,
  type DevtoTopArticleRef,
} from "@/lib/devto";
import {
  getRecentLaunches,
  getPhFile,
  type Launch,
} from "@/lib/producthunt";

export const dynamic = "force-static";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HN_ORANGE = "#ff6600";
const BSKY_BLUE = "#0085FF";
const PH_RED = "#DA552F";
const LOBSTERS_RED = "#AC130D";

type TabId = "hackernews" | "bluesky" | "devto" | "producthunt" | "lobsters";

const TAB_ORDER: TabId[] = [
  "hackernews",
  "bluesky",
  "devto",
  "producthunt",
  "lobsters",
];

const TAB_LABELS: Record<TabId, string> = {
  hackernews: "hackernews",
  bluesky: "bluesky",
  devto: "dev.to",
  producthunt: "producthunt",
  lobsters: "lobsters",
};

function isTabId(value: string | undefined): value is TabId {
  return (
    value === "hackernews" ||
    value === "bluesky" ||
    value === "devto" ||
    value === "producthunt" ||
    value === "lobsters"
  );
}

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

function formatAgeHours(ageHours: number | null | undefined): string {
  if (ageHours === undefined || ageHours === null || !Number.isFinite(ageHours))
    return "—";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const activeTab: TabId = isTabId(params.tab) ? params.tab : "hackernews";

  // Pre-compute counts for tab badges (server-side, cheap — JSON already loaded).
  const hnStoriesTop = getHnTopStories(10);
  const bskyPostsTop = getBlueskyTopPosts(10);
  const devtoLeaderboard = getDevtoLeaderboard();
  const phLaunchesTop = getRecentLaunches(7, 10);

  const tabCounts: Record<TabId, number> = {
    hackernews: hnStoriesTop.length,
    bluesky: bskyPostsTop.length,
    devto: Math.min(devtoLeaderboard.length, 10),
    producthunt: phLaunchesTop.length,
    lobsters: 0,
  };

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              NEWS / DEV MEDIA FIRELOOSE
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// where developers post, share, and launch"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-3xl">
            One terminal for the dev-media surface: HackerNews, Bluesky,
            dev.to, ProductHunt, and Lobsters in a single tabbed overview,
            scored by engagement. Each tab links out to its full dedicated
            view when one exists — this page is the morning glance.
          </p>
        </header>

        {/* Tab strip */}
        <nav className="mb-6 flex items-center gap-1 flex-wrap border-b border-border-primary">
          {TAB_ORDER.map((tab) => {
            const isActive = tab === activeTab;
            const href = tab === "hackernews" ? "/news" : `/news?tab=${tab}`;
            const labelClass = isActive
              ? "text-accent-green"
              : "text-text-tertiary hover:text-text-secondary";
            const borderClass = isActive
              ? "border-b-2 border-accent-green"
              : "border-b-2 border-transparent";
            return (
              <Link
                key={tab}
                href={href}
                className={`inline-flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider transition-colors ${labelClass} ${borderClass}`}
              >
                <span>{TAB_LABELS[tab]}</span>
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] tabular-nums bg-bg-secondary border border-border-primary text-text-tertiary">
                  {tabCounts[tab]}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Active tab body */}
        {activeTab === "hackernews" ? (
          <HackerNewsTabBody stories={hnStoriesTop} />
        ) : null}
        {activeTab === "bluesky" ? (
          <BlueskyTabBody posts={bskyPostsTop} />
        ) : null}
        {activeTab === "devto" ? <DevtoTabBody /> : null}
        {activeTab === "producthunt" ? (
          <ProductHuntTabBody launches={phLaunchesTop} />
        ) : null}
        {activeTab === "lobsters" ? <LobstersTabBody /> : null}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Pieces — shared
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

function ListShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      {children}
    </section>
  );
}

function FullViewLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-4 text-right">
      <Link
        href={href}
        className="text-xs text-accent-green hover:underline uppercase tracking-wider"
      >
        {label} →
      </Link>
    </div>
  );
}

function ComingSoonNote({ message }: { message: string }) {
  return (
    <div className="mt-4 text-right text-xs text-text-tertiary">
      {`// ${message}`}
    </div>
  );
}

function ColdCard({
  title,
  body,
  accent,
}: {
  title: string;
  body: React.ReactNode;
  accent?: string;
}) {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2
        className="text-lg font-bold uppercase tracking-wider text-accent-green"
        style={accent ? { color: accent } : undefined}
      >
        {title}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">{body}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// HackerNews tab
// ---------------------------------------------------------------------------

function HackerNewsTabBody({ stories }: { stories: HnStory[] }) {
  const trendingFile = getHnTrendingFile();
  const allStories = trendingFile.stories;
  const frontPageCount = allStories.filter((s) => s.everHitFrontPage).length;
  const reposLinked = getHnLeaderboard().length;
  const cold = allStories.length === 0;

  if (cold) {
    return (
      <ColdCard
        title="// hackernews cold"
        body={
          <>
            The Hacker News scraper hasn&apos;t run yet. Run{" "}
            <code className="text-text-primary">npm run scrape:hn</code>{" "}
            locally to populate{" "}
            <code className="text-text-primary">
              data/hackernews-trending.json
            </code>
            , then refresh.
          </>
        }
      />
    );
  }

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(trendingFile.fetchedAt)}
          hint="hackernews"
        />
        <StatTile
          label="STORIES TRACKED"
          value={allStories.length.toLocaleString()}
          hint={`${trendingFile.windowHours}h window`}
        />
        <StatTile
          label="FRONT PAGE"
          value={frontPageCount.toLocaleString()}
          hint="ever hit top 30"
        />
        <StatTile
          label="REPOS LINKED"
          value={reposLinked.toLocaleString()}
          hint="github mentions 7d"
        />
      </section>

      <ListShell>
        <div className="grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
          <div>#</div>
          <div>TITLE</div>
          <div className="text-right">FP</div>
          <div className="text-right">SCORE</div>
          <div className="text-right">CMTS</div>
          <div className="text-right">AGE</div>
        </div>
        <ul>
          {stories.map((s, i) => {
            const isHigh = s.score >= 100;
            return (
              <li
                key={s.id}
                className="grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-10 hover:bg-bg-card-hover transition-colors border-b border-border-primary/40 last:border-b-0"
              >
                <div className="text-text-tertiary text-xs tabular-nums">
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <a
                    href={hnItemHref(s.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-text-primary hover:text-accent-green truncate block"
                    title={s.title}
                  >
                    {s.title}
                  </a>
                </div>
                <div className="text-right">
                  {s.everHitFrontPage ? (
                    <span
                      className="inline-flex items-center justify-center text-[8px] font-bold w-3.5 h-3.5 rounded-sm text-white"
                      style={{ backgroundColor: HN_ORANGE }}
                      title="Hit the HN front page"
                    >
                      Y
                    </span>
                  ) : (
                    <span className="text-text-tertiary text-[10px]">—</span>
                  )}
                </div>
                <div
                  className="text-right text-xs tabular-nums"
                  style={isHigh ? { color: HN_ORANGE } : undefined}
                >
                  {s.score.toLocaleString()}
                </div>
                <div className="text-right text-xs tabular-nums text-text-secondary">
                  {s.descendants.toLocaleString()}
                </div>
                <div className="text-right text-xs tabular-nums text-text-tertiary">
                  {formatAgeHours(s.ageHours)}
                </div>
              </li>
            );
          })}
        </ul>
      </ListShell>

      <FullViewLink href="/hackernews/trending" label="View full" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Bluesky tab
// ---------------------------------------------------------------------------

function BlueskyTabBody({ posts }: { posts: BskyPost[] }) {
  const trendingFile = getBlueskyTrendingFile();
  const reposLinked = getBlueskyLeaderboard().length;
  const cold = blueskyCold || trendingFile.posts.length === 0;

  if (cold) {
    return (
      <ColdCard
        title="// bluesky cold"
        body={
          <>
            No Bluesky data yet — run{" "}
            <code className="text-text-primary">npm run scrape:bsky</code>{" "}
            locally (with{" "}
            <code className="text-text-primary">BLUESKY_HANDLE</code> +{" "}
            <code className="text-text-primary">BLUESKY_APP_PASSWORD</code>{" "}
            in env) to populate{" "}
            <code className="text-text-primary">
              data/bluesky-trending.json
            </code>
            .
          </>
        }
        accent={BSKY_BLUE}
      />
    );
  }

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(trendingFile.fetchedAt)}
          hint="bluesky"
        />
        <StatTile
          label="POSTS TRACKED"
          value={trendingFile.posts.length.toLocaleString()}
          hint={`${trendingFile.keywords.length} keywords`}
        />
        <StatTile
          label="REPOS LINKED"
          value={reposLinked.toLocaleString()}
          hint="github mentions 7d"
        />
        <StatTile
          label="SCANNED"
          value={trendingFile.scannedPosts.toLocaleString()}
          hint="raw posts swept"
        />
      </section>

      <ListShell>
        <div className="grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
          <div>#</div>
          <div>POST · AUTHOR</div>
          <div className="text-right">♥</div>
          <div className="text-right">⟲</div>
          <div className="text-right">CMTS</div>
          <div className="text-right">AGE</div>
        </div>
        <ul>
          {posts.map((p, i) => {
            const snippet = truncate(p.text, 80);
            const isHigh = p.likeCount >= 50 || p.repostCount >= 5;
            return (
              <li
                key={p.uri}
                className="grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-10 hover:bg-bg-card-hover transition-colors border-b border-border-primary/40 last:border-b-0"
              >
                <div className="text-text-tertiary text-xs tabular-nums">
                  {i + 1}
                </div>
                <div className="min-w-0 flex items-center gap-2">
                  <a
                    href={bskyPostHref(p.uri, p.author.handle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-text-primary hover:text-accent-green truncate"
                    title={p.text}
                  >
                    {snippet}
                  </a>
                  <span
                    className="shrink-0 text-[10px] text-text-tertiary"
                    title={
                      p.author.displayName
                        ? `${p.author.displayName} (@${p.author.handle})`
                        : `@${p.author.handle}`
                    }
                  >
                    @{p.author.handle}
                  </span>
                </div>
                <div
                  className="text-right text-xs tabular-nums"
                  style={isHigh ? { color: BSKY_BLUE } : undefined}
                >
                  {p.likeCount.toLocaleString()}
                </div>
                <div className="text-right text-xs tabular-nums text-text-secondary">
                  {p.repostCount.toLocaleString()}
                </div>
                <div className="text-right text-xs tabular-nums text-text-secondary">
                  {p.replyCount.toLocaleString()}
                </div>
                <div className="text-right text-xs tabular-nums text-text-tertiary">
                  {formatAgeHours(p.ageHours)}
                </div>
              </li>
            );
          })}
        </ul>
      </ListShell>

      <FullViewLink href="/bluesky/trending" label="View full" />
    </>
  );
}

// ---------------------------------------------------------------------------
// dev.to tab
// ---------------------------------------------------------------------------

function DevtoTabBody() {
  const file = getDevtoFile();
  const leaderboard = getDevtoLeaderboard();

  // Build a top-10 of articles by walking the leaderboard and pulling each
  // repo's topArticle. Skip entries that don't have one. This avoids the
  // need to import the larger devto-trending bundle here, while still
  // surfacing the highest-engagement article-per-repo pairs.
  const rows: { repo: string; article: DevtoTopArticleRef }[] = [];
  for (const entry of leaderboard) {
    const mention = file.mentions[entry.fullName];
    if (mention?.topArticle) {
      rows.push({ repo: entry.fullName, article: mention.topArticle });
    }
    if (rows.length >= 10) break;
  }

  const articlesScanned = file.scannedArticles;
  const reposLinked = leaderboard.length;
  const cold = reposLinked === 0;

  if (cold) {
    return (
      <ColdCard
        title="// dev.to cold"
        body={
          <>
            No dev.to data yet. Run{" "}
            <code className="text-text-primary">npm run scrape:devto</code>{" "}
            locally to populate{" "}
            <code className="text-text-primary">data/devto-mentions.json</code>
            .
          </>
        }
      />
    );
  }

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(file.fetchedAt)}
          hint="dev.to"
        />
        <StatTile
          label="ARTICLES SCANNED"
          value={articlesScanned.toLocaleString()}
          hint={`${file.windowDays}d window`}
        />
        <StatTile
          label="REPOS LINKED"
          value={reposLinked.toLocaleString()}
          hint="github mentions 7d"
        />
        <StatTile
          label="BODY MODE"
          value={file.bodyFetchMode}
          hint="article body fetch strategy"
        />
      </section>

      <ListShell>
        <div className="grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
          <div>#</div>
          <div>TITLE · AUTHOR</div>
          <div className="text-right">REACT</div>
          <div className="text-right">CMTS</div>
          <div className="text-right">READ</div>
          <div className="text-right">AGE</div>
        </div>
        <ul>
          {rows.map(({ repo, article }, i) => (
            <li
              key={`${repo}-${article.id}`}
              className="grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-10 hover:bg-bg-card-hover transition-colors border-b border-border-primary/40 last:border-b-0"
            >
              <div className="text-text-tertiary text-xs tabular-nums">
                {i + 1}
              </div>
              <div className="min-w-0 flex items-center gap-2">
                <a
                  href={devtoArticleHref(article.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-text-primary hover:text-accent-green truncate"
                  title={article.title}
                >
                  {article.title}
                </a>
                <span
                  className="shrink-0 text-[10px] text-text-tertiary"
                  title={article.author}
                >
                  @{article.author}
                </span>
              </div>
              <div className="text-right text-xs tabular-nums text-text-secondary">
                {article.reactions.toLocaleString()}
              </div>
              <div className="text-right text-xs tabular-nums text-text-secondary">
                {article.comments.toLocaleString()}
              </div>
              <div className="text-right text-xs tabular-nums text-text-tertiary">
                {`${article.readingTime}m`}
              </div>
              <div className="text-right text-xs tabular-nums text-text-tertiary">
                {formatAgeHours(article.hoursSincePosted)}
              </div>
            </li>
          ))}
        </ul>
      </ListShell>

      <ComingSoonNote message="dedicated /devto page coming soon" />
    </>
  );
}

// ---------------------------------------------------------------------------
// ProductHunt tab
// ---------------------------------------------------------------------------

function ProductHuntTabBody({ launches }: { launches: Launch[] }) {
  const file = getPhFile();
  const allLaunches = file.launches ?? [];
  const cold = allLaunches.length === 0;

  if (cold) {
    return (
      <ColdCard
        title="// producthunt cold"
        body={
          <>
            No ProductHunt launches loaded. Run{" "}
            <code className="text-text-primary">npm run scrape:ph</code>{" "}
            locally to populate{" "}
            <code className="text-text-primary">
              data/producthunt-launches.json
            </code>
            .
          </>
        }
        accent={PH_RED}
      />
    );
  }

  const totalVotes = allLaunches.reduce((acc, l) => acc + (l.votesCount ?? 0), 0);
  const linkedRepos = allLaunches.filter((l) => l.linkedRepo).length;

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(file.lastFetchedAt)}
          hint="producthunt"
        />
        <StatTile
          label="LAUNCHES TRACKED"
          value={allLaunches.length.toLocaleString()}
          hint={`${file.windowDays}d window`}
        />
        <StatTile
          label="TOTAL VOTES"
          value={totalVotes.toLocaleString()}
          hint="across all launches"
        />
        <StatTile
          label="REPOS LINKED"
          value={linkedRepos.toLocaleString()}
          hint="github links resolved"
        />
      </section>

      <ListShell>
        <div className="grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
          <div>#</div>
          <div>NAME · TAGLINE</div>
          <div className="text-right">VOTES</div>
          <div className="text-right">CMTS</div>
          <div className="text-right">DAYS</div>
          <div className="text-right">DATE</div>
        </div>
        <ul>
          {launches.map((l, i) => {
            const isHigh = l.votesCount >= 200;
            const t = new Date(l.createdAt).getTime();
            const launchDate = Number.isFinite(t)
              ? new Date(l.createdAt).toISOString().slice(5, 10)
              : "—";
            return (
              <li
                key={l.id}
                className="grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-10 hover:bg-bg-card-hover transition-colors border-b border-border-primary/40 last:border-b-0"
              >
                <div className="text-text-tertiary text-xs tabular-nums">
                  {i + 1}
                </div>
                <div className="min-w-0 flex items-center gap-2">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-text-primary hover:text-accent-green truncate"
                    title={`${l.name} — ${l.tagline}`}
                  >
                    <span className="font-semibold">{l.name}</span>
                    {l.tagline ? (
                      <span className="text-text-tertiary"> · {l.tagline}</span>
                    ) : null}
                  </a>
                </div>
                <div
                  className="text-right text-xs tabular-nums"
                  style={isHigh ? { color: PH_RED } : undefined}
                >
                  {l.votesCount.toLocaleString()}
                </div>
                <div className="text-right text-xs tabular-nums text-text-secondary">
                  {l.commentsCount.toLocaleString()}
                </div>
                <div className="text-right text-xs tabular-nums text-text-tertiary">
                  {`${l.daysSinceLaunch}d`}
                </div>
                <div className="text-right text-xs tabular-nums text-text-tertiary">
                  {launchDate}
                </div>
              </li>
            );
          })}
        </ul>
      </ListShell>

      <ComingSoonNote message="dedicated /producthunt page coming soon" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Lobsters stub
// ---------------------------------------------------------------------------

function LobstersTabBody() {
  return (
    <section className="rounded-md border border-dashed border-border-primary bg-bg-secondary/40 p-8">
      <h2
        className="text-lg font-bold uppercase tracking-wider"
        style={{ color: LOBSTERS_RED }}
      >
        {"// lobsters coming soon"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        Lobsters integration coming soon. Will pull from{" "}
        <code className="text-text-primary">lobste.rs/hottest.json</code> with
        the same velocity scoring as the HackerNews adapter — points/hour
        weighted by log10(score), deduped on URL canonicalization, joined
        against the tracked-repo set for sidebar badges.
      </p>
      <div className="mt-6 pt-6 border-t border-border-primary/50 text-xs text-text-tertiary">
        {"// no ETA — lands after the dev.to + ProductHunt mention surfaces stabilize"}
      </div>
    </section>
  );
}
