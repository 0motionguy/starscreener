// /lobsters — V4 SourceFeedTemplate consumer.
//
// Renders data/lobsters-trending.json (scripts/scrape-lobsters.mjs).
// Side-by-side: story feed + repo leaderboard.

import type { Metadata } from "next";
import Link from "next/link";
import {
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
import { repoLogoUrl } from "@/lib/logos";
import type { CSSProperties } from "react";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";

// No `dynamic` export — reading `searchParams` already opts the route out
// of static rendering in Next 15, which is enough for `?win=` to drive the
// active table on each render. `force-dynamic` would clash with the root
// layout's MobileDrawerLazy (dynamic-with-ssr:false).

export const metadata: Metadata = {
  title: "TrendingRepo — Lobsters Trending",
  description:
    "Lobsters stories ranked by recent score velocity and cross-linked to tracked GitHub repositories.",
};

type Win = "24h" | "7d" | "30d";

function parseWin(raw: string | string[] | undefined): Win {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "24h" || v === "30d" ? v : "7d";
}

const LOBSTERS_RED = "#ac130d";

// Lobsters-red square with a small "L" mark — mirrors LobstersBadge's
// glyph so an unlinked story (75 of 76 in the rolling window) shows a
// consistent on-brand chip instead of EntityLogo's hash-coloured monogram
// (orange/yellow/pink/cyan tiles per row looked broken on a dense feed).
// When a story DOES have a linked GitHub repo we still render the owner
// avatar so cross-source association stays visible.
const LOBSTERS_L_TILE_STYLE: CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 2,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: LOBSTERS_RED,
  color: "#fff",
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  border: "1px solid rgba(172, 19, 13, 0.55)",
};

function LobstersLogoCell({
  linkedRepo,
  storyTitle,
}: {
  linkedRepo: string | undefined;
  storyTitle: string;
}) {
  if (linkedRepo) {
    return (
      <EntityLogo
        src={repoLogoUrl(linkedRepo)}
        name={linkedRepo}
        size={20}
        shape="square"
        alt=""
      />
    );
  }
  return (
    <span
      role="presentation"
      aria-hidden="true"
      title={storyTitle}
      style={LOBSTERS_L_TILE_STYLE}
    >
      L
    </span>
  );
}

// Spread the feed so one dominant tag (e.g. "vibecoding" with 13 stories
// in the 7d window) does not gobble the top 50. Walks input order, keeps
// at most `cap` per first tag. Mirrors capPerAuthor in /skills/page.tsx.
function capPerTag(stories: LobstersStory[], cap: number): LobstersStory[] {
  const counts = new Map<string, number>();
  const out: LobstersStory[] = [];
  for (const s of stories) {
    const tag = (s.tags?.[0] ?? "").toLowerCase();
    const bucket = tag || s.shortId; // tagless story → its own bucket
    const seen = counts.get(bucket) ?? 0;
    if (seen >= cap) continue;
    counts.set(bucket, seen + 1);
    out.push(s);
  }
  return out;
}

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

export default async function LobstersPage({
  searchParams,
}: {
  searchParams: Promise<{ win?: string | string[] }>;
}) {
  const { win: winParam } = await searchParams;
  const win = parseWin(winParam);
  await Promise.all([
    refreshLobstersTrendingFromStore(),
    refreshLobstersMentionsFromStore(),
  ]);
  const file = getLobstersTrendingFile();
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
            <WindowedStoryFeed allStories={allStories} activeWindow={win} />
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
// Active-only mode (2026-05-07): the page reads `?win=` from searchParams
// and renders ONLY the active window's table — the other two windows pay
// nothing on the wire. Counts for all three are still computed cheaply so
// the tab strip can show the row totals.
function WindowedStoryFeed({
  allStories,
  activeWindow,
}: {
  allStories: LobstersStory[];
  activeWindow: Win;
}) {
  // Sort by trending velocity, then thin per-tag bursts (cap 6 per first
  // tag) BEFORE the 50-row cut so the visible feed is diverse — without
  // the cap, "vibecoding" alone takes 13 of the 50 slots in the 7d window.
  const sortAndCap = (list: LobstersStory[]) =>
    capPerTag(
      list
        .slice()
        .sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0)),
      6,
    ).slice(0, 50);
  const filterWindow = (max: number) =>
    allStories.filter((s) => s.ageHours !== undefined && s.ageHours <= max);

  // Pre-filter all 3 windows for the count badges (cheap — no row render).
  const f24h = filterWindow(24);
  const f7d = filterWindow(7 * 24);
  const f30d = filterWindow(30 * 24);

  // Only sort + render the active window's stories.
  const activeFiltered =
    activeWindow === "24h" ? f24h : activeWindow === "30d" ? f30d : f7d;
  const activeStories = sortAndCap(activeFiltered);

  // Counts shown in the tab strip — pre-cap counts so the user sees the
  // raw window size, not the post-cap 50-row floor.
  return (
    <WindowedFeedTable
      count24h={Math.min(f24h.length, 50)}
      count7d={Math.min(f7d.length, 50)}
      count30d={Math.min(f30d.length, 50)}
      activeWindow={activeWindow}
      tableActive={<StoryFeed stories={activeStories} />}
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
        return (
          <div className="flex min-w-0 items-center gap-2">
            <LobstersLogoCell
              linkedRepo={linkedRepo}
              storyTitle={story.title}
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
        // Render at most 2 chips per row — width=140 truncates the third
        // anyway, and dropping it cuts ~75 chips off the 7d window. The
        // remaining tags still surface in the row title attribute.
        const tags = (story.tags ?? []).slice(0, 2);
        if (tags.length === 0) {
          return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
        }
        return (
          <div className="flex min-w-0 items-center gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="v2-mono max-w-full truncate px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase tabular-nums"
                style={{
                  border: "1px solid var(--v4-line-200)",
                  color: "var(--v4-ink-300)",
                  background: "var(--v4-bg-025)",
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
