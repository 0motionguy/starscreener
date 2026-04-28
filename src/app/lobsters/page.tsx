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
import { TerminalFeedTable, type FeedColumn } from "@/components/feed/TerminalFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl } from "@/lib/logos";

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
  const columns: FeedColumn<LobstersStory>[] = [
    {
      id: "rank",
      header: "#",
      width: "44px",
      align: "left",
      render: (_, i) => (
        <span
          className="font-mono text-[12px] tabular-nums font-semibold"
          style={{ color: i < 10 ? LOBSTERS_RED : "var(--v3-ink-400)" }}
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
            <EntityLogo
              src={repoLogoUrl(linkedRepo)}
              name={linkedRepo ?? story.by ?? story.title}
              size={20}
              shape="square"
              alt=""
            />
            <a
              href={commentsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-[13px] font-medium transition-colors hover:text-[color:var(--v3-acc)]"
              style={{ color: "var(--v3-ink-100)" }}
              title={story.title}
            >
              {story.title}
            </a>
            {story.url ? (
              <a
                href={story.url}
                target="_blank"
                rel="noopener noreferrer"
                className="v2-mono shrink-0 text-[10px] tracking-[0.14em] uppercase hover:text-[color:var(--v3-acc)]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                src
              </a>
            ) : null}
            {linkedRepo ? (
              <Link
                href={repoFullNameToHref(linkedRepo)}
                className="v2-mono shrink-0 px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase transition-colors hover:text-[color:var(--v3-acc)]"
                style={{
                  border: "1px solid var(--v3-line-200)",
                  background: "var(--v3-bg-100)",
                  color: "var(--v3-ink-300)",
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
          return <span style={{ color: "var(--v3-ink-500)" }}>—</span>;
        }
        return (
          <div className="flex min-w-0 items-center gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="v2-mono max-w-full truncate px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase"
                style={{
                  border: "1px solid var(--v3-line-200)",
                  color: "var(--v3-ink-400)",
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
          style={{ color: story.score >= 25 ? LOBSTERS_RED : "var(--v3-ink-100)" }}
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
          style={{ color: "var(--v3-ink-300)" }}
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
          style={{ color: "var(--v3-ink-400)" }}
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
        background: "var(--v3-bg-050)",
        border: "1px solid var(--v3-line-200)",
        borderRadius: 2,
      }}
    >
      <div
        className="v2-mono flex h-9 items-center justify-between px-3"
        style={{
          borderBottom: "1px solid var(--v3-line-100)",
          background: "var(--v3-bg-025)",
        }}
      >
        <span
          className="text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--v3-ink-300)" }}
        >
          REPO LEADERBOARD
        </span>
        <span
          className="text-[10px] tabular-nums tracking-[0.14em]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          {entries.length}
        </span>
      </div>
      <div
        className="v2-mono grid h-7 grid-cols-[28px_1fr_40px_50px] items-center gap-2 px-3 text-[10px] uppercase tracking-[0.18em]"
        style={{
          borderBottom: "1px solid var(--v3-line-100)",
          color: "var(--v3-ink-400)",
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
                borderBottom: "1px dashed var(--v3-line-100)",
                animation: "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
              }}
            >
              <div
                className="font-mono text-xs tabular-nums"
                style={{ color: "var(--v3-ink-400)" }}
              >
                {index + 1}
              </div>
              <Link
                href={repoFullNameToHref(entry.fullName)}
                className="truncate text-xs transition-colors hover:text-[color:var(--v3-acc)]"
                style={{ color: "var(--v3-ink-100)" }}
                title={entry.fullName}
              >
                {entry.fullName}
              </Link>
              <div
                className="text-right text-xs tabular-nums"
                style={{ color: "var(--v3-ink-200)" }}
              >
                {entry.count7d.toLocaleString("en-US")}
              </div>
              <div
                className="text-right text-xs tabular-nums"
                style={{ color: "var(--v3-ink-400)" }}
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
      className="p-8"
      style={{
        background: "var(--v3-bg-025)",
        border: "1px dashed var(--v3-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono text-lg font-bold uppercase tracking-[0.18em]"
        style={{ color: LOBSTERS_RED }}
      >
        {"// no lobsters data yet"}
      </h2>
      <p
        className="mt-3 max-w-xl text-sm"
        style={{ color: "var(--v3-ink-300)" }}
      >
        The Lobsters scraper has not produced data yet. Run{" "}
        <code style={{ color: "var(--v3-ink-100)" }}>npm run scrape:lobsters</code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v3-ink-100)" }}>data/lobsters-trending.json</code>
        , then refresh this page.
      </p>
    </section>
  );
}
