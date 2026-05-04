// /lobsters — V4 SourceFeedTemplate consumer.
//
// Renders data/lobsters-trending.json (scripts/scrape-lobsters.mjs).
// Side-by-side: story feed + repo leaderboard.

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
import { TerminalFeedTable, type FeedColumn } from "@/components/feed/TerminalFeedTable";
import { WindowedFeedTable } from "@/components/feed/WindowedFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl, resolveLogoUrl } from "@/lib/logos";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";

export const dynamic = "force-static";

export const metadata: Metadata = {
  // Layout template appends ` — TrendingRepo`; bare title here.
  title: "Lobsters Trending",
  description:
    "Lobsters stories ranked by recent score velocity and cross-linked to tracked GitHub repositories.",
  alternates: { canonical: "/lobsters" },
  openGraph: {
    title: "Lobsters Trending — TrendingRepo",
    description:
      "Lobsters stories scored by velocity, cross-linked to tracked GitHub repos.",
    url: "/lobsters",
    type: "website",
  },
};

const LOBSTERS_RED = "#ac130d";

function formatAgeHours(ageHours: number | undefined): string {
  if (ageHours === undefined || !Number.isFinite(ageHours)) return "-";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
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

  if (cold) {
    return (
      <main className="home-surface">
        <SourceFeedTemplate
          crumb={
            <>
              <b>LOBSTERS</b> · TERMINAL · /LOBSTERS
            </>
          }
          title="Lobsters · top stories"
          lede="Stories ranked by recent score velocity, cross-linked to GitHub repos. The Lobsters firehose runs every cron tick and keeps the rolling 24h list fresh."
        />
        <ColdState />
      </main>
    );
  }

  const topScore = allStories.reduce((m, s) => Math.max(m, s.score), 0);
  const linkedRepoCount = allStories.filter(
    (s) => Array.isArray(s.linkedRepos) && s.linkedRepos.length > 0,
  ).length;

  return (
    <main className="home-surface">
      <SourceFeedTemplate
        crumb={
          <>
            <b>LOBSTERS</b> · TERMINAL · /LOBSTERS
          </>
        }
        title="Lobsters · top stories"
        lede="Stories ranked by recent score velocity, cross-linked to GitHub repos. The Lobsters firehose runs every cron tick and keeps the rolling 24h list fresh."
        clock={
          <>
            <span className="big">{formatClock(file.fetchedAt)}</span>
            <span className="muted">UTC · SCRAPED</span>
            <LiveDot label={`LIVE · ${file.windowHours}H`} />
            <FreshnessBadge source="lobsters" lastUpdatedAt={file.fetchedAt} />
          </>
        }
        snapshot={
          <KpiBand
            cells={[
              {
                label: "TRACKED",
                value: allStories.length.toLocaleString("en-US"),
                sub: `${file.windowHours}h rolling`,
                pip: LOBSTERS_RED,
              },
              {
                label: "TOP SCORE",
                value: topScore.toLocaleString("en-US"),
                sub: "velocity peak",
                tone: "acc",
                pip: "var(--v4-acc)",
              },
              {
                label: "LEADERBOARD",
                value: leaderboard.length,
                sub: "tracked repos · 7d",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "GH-LINKED",
                value: linkedRepoCount,
                sub: "stories with repo",
                pip: "var(--v4-blue)",
              },
            ]}
          />
        }
        listEyebrow="Story feed · 24h / 7d / 30d window · repo leaderboard"
        list={
          <div
            className={
              leaderboard.length > 0
                ? "grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6"
                : ""
            }
          >
            <WindowedStoryFeed allStories={allStories} />
            {leaderboard.length > 0 ? (
              <Leaderboard entries={leaderboard.slice(0, 15)} />
            ) : null}
          </div>
        }
      />
    </main>
  );
}

// AUDIT-2026-05-04 follow-up: 24h / 7d / 30d toggle on the story feed.
// All stories carry `ageHours`, so we filter server-side into three
// windows and let the client toggle which to render.
function WindowedStoryFeed({ allStories }: { allStories: LobstersStory[] }) {
  const sortByScore = (list: LobstersStory[]) =>
    list
      .slice()
      .sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0))
      .slice(0, 50);
  const inWindow = (max: number) =>
    sortByScore(
      allStories.filter(
        (s) => s.ageHours !== undefined && s.ageHours <= max,
      ),
    );
  const w24h = inWindow(24);
  const w7d = inWindow(7 * 24);
  const w30d = inWindow(30 * 24);
  return (
    <WindowedFeedTable
      count24h={w24h.length}
      count7d={w7d.length}
      count30d={w30d.length}
      table24h={<StoryFeed stories={w24h} />}
      table7d={<StoryFeed stories={w7d} />}
      table30d={<StoryFeed stories={w30d} />}
      defaultWindow="7d"
    />
  );
}

function StoryFeed({ stories }: { stories: LobstersStory[] }) {
  const columns: FeedColumn<LobstersStory>[] = [
    {
      id: "rank",
      header: "#",
      width: "44px",
      align: "left",
      render: (_, i) => (
        <span
          className="font-mono text-[12px] tabular-nums font-semibold"
          style={{ color: i < 10 ? LOBSTERS_RED : "var(--v4-ink-400)" }}
        >
          {String(i + 1).padStart(2, "0")}
        </span>
      ),
    },
    {
      id: "title",
      header: "Story",
      align: "left",
      render: (story) => {
        const commentsHref = story.commentsUrl || lobstersStoryHref(story.shortId);
        const linkedRepo = story.linkedRepos?.[0]?.fullName;
        const fallbackLogo = resolveLogoUrl(story.url ?? null, story.title, 64);
        return (
          <div className="flex min-w-0 items-center gap-2">
            <EntityLogo
              src={repoLogoUrl(linkedRepo) ?? fallbackLogo}
              name={linkedRepo ?? story.title}
              size={20}
              shape="square"
              alt=""
            />
            <a
              href={commentsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-[13px] font-medium transition-colors hover:text-[color:var(--v4-acc)]"
              style={{ color: "var(--v4-ink-100)" }}
              title={story.title}
            >
              {story.title}
            </a>
            {story.url ? (
              <a
                href={story.url}
                target="_blank"
                rel="noopener noreferrer"
                className="v2-mono shrink-0 text-[10px] tracking-[0.14em] uppercase hover:text-[color:var(--v4-acc)]"
                style={{ color: "var(--v4-ink-400)" }}
              >
                src
              </a>
            ) : null}
            {linkedRepo ? (
              <Link
                href={repoFullNameToHref(linkedRepo)}
                className="v2-mono shrink-0 px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase transition-colors hover:text-[color:var(--v4-acc)]"
                style={{
                  border: "1px solid var(--v4-line-200)",
                  background: "var(--v4-bg-100)",
                  color: "var(--v4-ink-300)",
                  borderRadius: 2,
                }}
                title={`Linked repo: ${linkedRepo}`}
              >
                ↳ {linkedRepo}
              </Link>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "tags",
      header: "Tags",
      width: "140px",
      align: "left",
      hideBelow: "md",
      render: (story) => {
        const tags = (story.tags ?? []).slice(0, 3);
        if (tags.length === 0) {
          return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
        }
        return (
          <div className="flex min-w-0 items-center gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="v2-mono max-w-full truncate px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase"
                style={{
                  border: "1px solid var(--v4-line-200)",
                  color: "var(--v4-ink-400)",
                  borderRadius: 2,
                }}
                title={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      id: "score",
      header: "Score",
      width: "70px",
      align: "right",
      render: (story) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: story.score >= 25 ? LOBSTERS_RED : "var(--v4-ink-100)" }}
        >
          {story.score.toLocaleString("en-US")}
        </span>
      ),
    },
    {
      id: "comments",
      header: "Cmts",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (story) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-300)" }}
        >
          {story.commentCount.toLocaleString("en-US")}
        </span>
      ),
    },
    {
      id: "age",
      header: "Age",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (story) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {formatAgeHours(story.ageHours)}
        </span>
      ),
    },
  ];

  return (
    <TerminalFeedTable
      rows={stories}
      columns={columns}
      rowKey={(story) => story.shortId}
      accent={LOBSTERS_RED}
      caption="Lobsters trending stories ranked by recent score velocity"
      emptyTitle="No stories in this window"
    />
  );
}

function Leaderboard({
  entries,
}: {
  entries: ReturnType<typeof getLobstersLeaderboard>;
}) {
  return (
    <aside
      className="hidden h-fit overflow-hidden lg:block"
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
          {entries.length}
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
        <div className="text-right">ST</div>
        <div className="text-right">PTS</div>
      </div>
      <ul>
        {entries.map((entry, index) => {
          const stagger = Math.min(index, 6) * 50;
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
                {index + 1}
              </div>
              <Link
                href={repoFullNameToHref(entry.fullName)}
                className="truncate text-xs transition-colors hover:text-[color:var(--v4-acc)]"
                style={{ color: "var(--v4-ink-100)" }}
                title={entry.fullName}
              >
                {entry.fullName}
              </Link>
              <div
                className="text-right text-xs tabular-nums"
                style={{ color: "var(--v4-ink-200)" }}
              >
                {entry.count7d.toLocaleString("en-US")}
              </div>
              <div
                className="text-right text-xs tabular-nums"
                style={{ color: "var(--v4-ink-400)" }}
              >
                {entry.scoreSum7d.toLocaleString("en-US")}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
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
          color: LOBSTERS_RED,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {"// no lobsters data yet"}
      </h2>
      <p style={{ marginTop: 12, maxWidth: "32rem", fontSize: 13, color: "var(--v4-ink-300)" }}>
        The Lobsters scraper has not produced data yet. Run{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>npm run scrape:lobsters</code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>data/lobsters-trending.json</code>
        , then refresh this page.
      </p>
    </section>
  );
}
