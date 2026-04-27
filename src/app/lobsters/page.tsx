// /lobsters - full Lobsters story feed.
//
// Renders data/lobsters-trending.json, produced by scripts/scrape-lobsters.mjs.
// The compact version also appears inside /news?tab=lobsters.

import type { Metadata } from "next";
import Link from "next/link";
import {
  getLobstersTopStories,
  getLobstersTrendingFile,
  refreshLobstersTrendingFromStore,
} from "@/lib/lobsters-trending";
import {
  getLobstersLeaderboard,
  lobstersStoryHref,
  refreshLobstersMentionsFromStore,
  repoFullNameToHref,
  type LobstersStory,
} from "@/lib/lobsters";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildLobstersHeader } from "@/components/news/newsTopMetrics";

const LOBSTERS_ACCENT = "rgba(172, 19, 13, 0.85)";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "TrendingRepo - Lobsters Trending",
  description:
    "Lobsters stories ranked by recent score velocity and cross-linked to tracked GitHub repositories.",
};

const LOBSTERS_RED = "#ac130d";

function formatAgeHours(ageHours: number | undefined): string {
  if (ageHours === undefined || !Number.isFinite(ageHours)) return "-";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

export default async function LobstersPage() {
  await Promise.all([
    refreshLobstersTrendingFromStore(),
    refreshLobstersMentionsFromStore(),
  ]);
  const file = getLobstersTrendingFile();
  const stories = getLobstersTopStories(50);
  const allStories = file.stories ?? [];
  const leaderboard = getLobstersLeaderboard();
  const cold = allStories.length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* V3 page header — mono eyebrow + title + tight subtitle. */}
        <header
          className="mb-5 pb-4 border-b"
          style={{ borderColor: "var(--v3-line-100)" }}
        >
          <div
            className="v2-mono mb-2 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {"// COMMUNITY TECH LINKS + GITHUB MENTIONS"}
          </div>
          <h1
            className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2"
            style={{ color: "var(--v3-ink-000)" }}
          >
            <span style={{ color: LOBSTERS_RED }} aria-hidden>
              L
            </span>
            LOBSTERS / ALL TRENDING
          </h1>
          <p
            className="mt-2 text-[13px] leading-relaxed max-w-3xl"
            style={{ color: "var(--v3-ink-300)" }}
          >
            Top Lobsters stories from hottest, active, and newest public JSON
            feeds. Stories are ranked by score decay over the last{" "}
            {file.windowHours} hours and joined against tracked GitHub repos
            when a story links to one.
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <>
            {/* V3 top header — 3 charts + 3 hero stories. The legacy stat
                tiles below this were dropped — covered by the V3 snapshot. */}
            <div className="mb-6">
              <NewsTopHeaderV3
                eyebrow="// LOBSTERS · TOP STORIES"
                status={`${allStories.length.toLocaleString("en-US")} TRACKED · ${file.windowHours}H`}
                {...buildLobstersHeader(file, getLobstersTopStories(3))}
                accent={LOBSTERS_ACCENT}
              />
            </div>

            <div
              className={
                leaderboard.length > 0
                  ? "grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6"
                  : ""
              }
            >
              <StoryFeed stories={stories} />
              {leaderboard.length > 0 ? (
                <Leaderboard entries={leaderboard.slice(0, 15)} />
              ) : null}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function StoryFeed({ stories }: { stories: LobstersStory[] }) {
  return (
    <section className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      <div className="hidden md:grid grid-cols-[40px_minmax(0,1fr)_120px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>TITLE</div>
        <div>TAGS</div>
        <div className="text-right">SCORE</div>
        <div className="text-right">CMTS</div>
        <div className="text-right">AGE</div>
      </div>
      <div className="grid md:hidden grid-cols-[32px_minmax(0,1fr)_56px] gap-2 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>TITLE</div>
        <div className="text-right">SCORE</div>
      </div>
      <ul>
        {stories.map((story, index) => (
          <StoryRow key={story.shortId} rank={index + 1} story={story} />
        ))}
      </ul>
    </section>
  );
}

function StoryRow({ rank, story }: { rank: number; story: LobstersStory }) {
  const commentsHref = story.commentsUrl || lobstersStoryHref(story.shortId);
  const linkedRepo = story.linkedRepos?.[0]?.fullName;
  const tags = (story.tags ?? []).slice(0, 3);
  const isHigh = story.score >= 25;

  return (
    <li className="border-b border-border-primary/40 last:border-b-0">
      <div className="hidden md:grid grid-cols-[40px_minmax(0,1fr)_120px_60px_60px_80px] gap-3 items-center px-3 min-h-[44px] py-2 hover:bg-bg-card-hover transition-colors">
        <div
          className="text-xs tabular-nums font-semibold"
          style={rank <= 10 ? { color: LOBSTERS_RED } : undefined}
        >
          #{rank}
        </div>
        <div className="min-w-0 flex items-center gap-2">
          <a
            href={commentsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-primary hover:text-accent-green truncate"
            title={story.title}
          >
            {story.title}
          </a>
          {story.url ? (
            <a
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[10px] text-text-tertiary hover:text-accent-green"
            >
              src
            </a>
          ) : null}
          {linkedRepo ? (
            <Link
              href={repoFullNameToHref(linkedRepo)}
              className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-border-primary text-text-tertiary hover:text-accent-green hover:border-accent-green/50 transition-colors"
              title={`Linked repo: ${linkedRepo}`}
            >
              {linkedRepo}
            </Link>
          ) : null}
        </div>
        <div className="min-w-0 flex items-center gap-1">
          {tags.length > 0 ? (
            tags.map((tag) => (
              <span
                key={tag}
                className="min-w-0 max-w-full truncate text-[10px] px-1.5 py-0.5 rounded border border-border-primary text-text-tertiary"
                title={tag}
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-text-tertiary text-[10px]">-</span>
          )}
        </div>
        <div
          className="text-right text-xs tabular-nums"
          style={isHigh ? { color: LOBSTERS_RED } : undefined}
        >
          {story.score.toLocaleString("en-US")}
        </div>
        <div className="text-right text-xs tabular-nums text-text-secondary">
          {story.commentCount.toLocaleString("en-US")}
        </div>
        <div className="text-right text-xs tabular-nums text-text-tertiary">
          {formatAgeHours(story.ageHours)}
        </div>
      </div>

      <div className="grid md:hidden grid-cols-[32px_minmax(0,1fr)_56px] gap-2 items-center px-3 py-2 min-h-[54px] hover:bg-bg-card-hover transition-colors">
        <div
          className="text-xs tabular-nums font-semibold"
          style={rank <= 10 ? { color: LOBSTERS_RED } : undefined}
        >
          #{rank}
        </div>
        <div className="min-w-0">
          <a
            href={commentsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-text-primary hover:text-accent-green truncate"
            title={story.title}
          >
            {story.title}
          </a>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-text-tertiary tabular-nums">
            <span>{story.commentCount.toLocaleString("en-US")} cmts</span>
            <span>{formatAgeHours(story.ageHours)}</span>
            {linkedRepo ? (
              <Link
                href={repoFullNameToHref(linkedRepo)}
                className="min-w-0 truncate hover:text-accent-green"
                title={linkedRepo}
              >
                {linkedRepo}
              </Link>
            ) : null}
          </div>
        </div>
        <div
          className="text-right text-xs tabular-nums"
          style={isHigh ? { color: LOBSTERS_RED } : undefined}
        >
          {story.score.toLocaleString("en-US")}
        </div>
      </div>
    </li>
  );
}

function Leaderboard({
  entries,
}: {
  entries: ReturnType<typeof getLobstersLeaderboard>;
}) {
  return (
    <aside className="hidden lg:block border border-border-primary rounded-md bg-bg-secondary overflow-hidden h-fit">
      <div className="px-3 h-9 border-b border-border-primary flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
          REPO LEADERBOARD
        </span>
        <span className="text-[10px] text-text-tertiary tabular-nums">
          {entries.length}
        </span>
      </div>
      <div className="grid grid-cols-[28px_1fr_40px_50px] gap-2 items-center px-3 h-7 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>REPO</div>
        <div className="text-right">ST</div>
        <div className="text-right">PTS</div>
      </div>
      <ul>
        {entries.map((entry, index) => (
          <li
            key={entry.fullName}
            className="grid grid-cols-[28px_1fr_40px_50px] gap-2 items-center px-3 h-9 hover:bg-bg-card-hover transition-colors border-b border-border-primary/40 last:border-b-0"
          >
            <div className="text-text-tertiary text-xs tabular-nums">
              {index + 1}
            </div>
            <Link
              href={repoFullNameToHref(entry.fullName)}
              className="text-xs text-text-primary hover:text-accent-green truncate"
              title={entry.fullName}
            >
              {entry.fullName}
            </Link>
            <div className="text-right text-xs tabular-nums text-text-secondary">
              {entry.count7d.toLocaleString("en-US")}
            </div>
            <div className="text-right text-xs tabular-nums text-text-tertiary">
              {entry.scoreSum7d.toLocaleString("en-US")}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}


function ColdState() {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2
        className="text-lg font-bold uppercase tracking-wider"
        style={{ color: LOBSTERS_RED }}
      >
        {"// no lobsters data yet"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        The Lobsters scraper has not produced data yet. Run{" "}
        <code className="text-text-primary">npm run scrape:lobsters</code>{" "}
        locally to populate{" "}
        <code className="text-text-primary">data/lobsters-trending.json</code>
        , then refresh this page.
      </p>
    </section>
  );
}
