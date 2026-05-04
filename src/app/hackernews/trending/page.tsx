// /hackernews/trending — V4 SourceFeedTemplate consumer.
//
// Top 50 HN stories by velocity-weighted trending score (Firebase top-500 +
// Algolia 7d github-mention sweep). Template provides PageHead + KpiBand
// snapshot + list slot; HnStoryFeed table renders inside the list slot
// unchanged.

import type { Metadata } from "next";
import {
  getHnTopStories,
  getHnTrendingFile,
  refreshHackernewsTrendingFromStore,
} from "@/lib/hackernews-trending";
import {
  hnItemHref,
  refreshHackernewsMentionsFromStore,
  repoFullNameToHref,
  type HnStory,
} from "@/lib/hackernews";
import { TerminalFeedTable, type FeedColumn } from "@/components/feed/TerminalFeedTable";
import { WindowedFeedTable } from "@/components/feed/WindowedFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl } from "@/lib/logos";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

// ISR (5min) so the page picks up hourly Redis refreshes from
// scrape-trending.yml. `force-static` was baking whatever data was
// bundled at deploy time and never re-running the refresh hook below,
// causing the 24h-window count to drift to single digits between
// deploys (HN reports 100s of stories/day; the cron runs hourly).
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Trending on Hacker News",
  description:
    "Top Hacker News stories by velocity-weighted trending score (Firebase top-500 plus Algolia 7-day GitHub-mention sweep). Live HN signal terminal.",
  alternates: { canonical: "/hackernews/trending" },
  openGraph: {
    title: "Trending on Hacker News — TrendingRepo",
    description: "HN top 50 by velocity-weighted score with linked-repo overlap.",
    url: "/hackernews/trending",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trending on Hacker News — TrendingRepo",
    description: "HN top 50 by velocity-weighted score with linked-repo overlap.",
  },
};

const HN_ORANGE = "#ff6600";

function formatAgeHours(ageHours: number | undefined): string {
  if (ageHours === undefined || !Number.isFinite(ageHours)) return "—";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

export default async function HackerNewsTrendingPage() {
  await Promise.all([
    refreshHackernewsTrendingFromStore(),
    refreshHackernewsMentionsFromStore(),
  ]);
  const trendingFile = getHnTrendingFile();
  const stories = getHnTopStories(50);
  const allStories = trendingFile.stories;
  const cold = allStories.length === 0;

  if (cold) {
    return (
      <main className="home-surface">
        <SourceFeedTemplate
          crumb={
            <>
              <b>HN</b> · TERMINAL · /HACKERNEWS
            </>
          }
          title="Hacker News · trending"
          lede="Top stories ranked by velocity-weighted trending score. Firebase top-500 cross-checked with the 7-day Algolia GitHub-mention sweep, deduped, scored."
        />
        <ColdState />
      </main>
    );
  }

  const topScore = allStories.reduce((m, s) => Math.max(m, s.score), 0);
  const frontPageHits = allStories.filter((s) => s.everHitFrontPage).length;
  const linkedRepoCount = allStories.filter(
    (s) => Array.isArray(s.linkedRepos) && s.linkedRepos.length > 0,
  ).length;

  return (
    <main className="home-surface">
      <SourceFeedTemplate
        crumb={
          <>
            <b>HN</b> · TERMINAL · /HACKERNEWS
          </>
        }
        title="Hacker News · trending"
        lede="Top stories ranked by velocity-weighted trending score. Firebase top-500 cross-checked with the 7-day Algolia GitHub-mention sweep, deduped, scored."
        clock={
          <>
            <span className="big">{formatClock(trendingFile.fetchedAt)}</span>
            <span className="muted">UTC · SCRAPED</span>
            <LiveDot label={`LIVE · ${trendingFile.windowHours}H`} />
          </>
        }
        snapshot={
          <KpiBand
            cells={[
              {
                label: "TRACKED",
                value: allStories.length.toLocaleString("en-US"),
                sub: `${trendingFile.windowHours}h rolling`,
                pip: "var(--v4-src-hn)",
              },
              {
                label: "TOP SCORE",
                value: topScore.toLocaleString("en-US"),
                sub: "velocity peak",
                tone: "acc",
                pip: "var(--v4-acc)",
              },
              {
                label: "FRONT PAGE",
                value: frontPageHits,
                sub: "ever hit FP",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "GH-LINKED",
                value: linkedRepoCount,
                sub: "repos in feed",
                pip: "var(--v4-blue)",
              },
            ]}
          />
        }
        listEyebrow="Story feed · top 50 by score"
        list={<HnStoryFeed stories={stories} />}
      />
    </main>
  );
}

// AUDIT-2026-05-04 follow-up: 24h / 7d / 30d toggle on the HN feed.
// HN stories carry `ageHours`; filter into windows server-side, render
// three pre-built tables, let the client toggle.
function WindowedHnFeed({ allStories }: { allStories: HnStory[] }) {
  const sortByScore = (list: HnStory[]) =>
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
      table24h={<HnStoryFeed stories={w24h} />}
      table7d={<HnStoryFeed stories={w7d} />}
      table30d={<HnStoryFeed stories={w30d} />}
      defaultWindow="7d"
    />
  );
}

function HnStoryFeed({ stories }: { stories: HnStory[] }) {
  const columns: FeedColumn<HnStory>[] = [
    {
      id: "rank",
      header: "#",
      width: "44px",
      render: (_, i) => (
        <span
          className="font-mono text-[12px] tabular-nums font-semibold"
          style={{ color: i < 10 ? HN_ORANGE : "var(--v4-ink-400)" }}
        >
          {String(i + 1).padStart(2, "0")}
        </span>
      ),
    },
    {
      id: "title",
      header: "Title",
      render: (s) => {
        const linkedRepo = s.linkedRepos?.[0]?.fullName;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <EntityLogo
              src={repoLogoUrl(linkedRepo)}
              name={linkedRepo ?? s.by ?? s.title}
              size={20}
              shape="square"
              alt=""
            />
            <a
              href={hnItemHref(s.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-[13px] font-medium transition-colors hover:text-[color:var(--v4-acc)]"
              style={{ color: "var(--v4-ink-100)" }}
              title={s.title}
            >
              {s.title}
            </a>
            {linkedRepo ? (
              <a
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
              </a>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "fp",
      header: "FP",
      width: "44px",
      hideBelow: "sm",
      render: (s) =>
        s.everHitFrontPage ? (
          <span
            className="inline-flex h-4 w-4 items-center justify-center text-[9px] font-bold text-white"
            style={{ backgroundColor: HN_ORANGE, borderRadius: 2 }}
            title="Hit the HN front page"
          >
            Y
          </span>
        ) : (
          <span style={{ color: "var(--v4-ink-500)" }}>—</span>
        ),
    },
    {
      id: "score",
      header: "Score",
      width: "70px",
      align: "right",
      render: (s) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: s.score >= 100 ? HN_ORANGE : "var(--v4-ink-100)" }}
        >
          {s.score.toLocaleString("en-US")}
        </span>
      ),
    },
    {
      id: "comments",
      header: "Cmts",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (s) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-300)" }}
        >
          {s.descendants.toLocaleString("en-US")}
        </span>
      ),
    },
    {
      id: "age",
      header: "Age",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (s) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {formatAgeHours(s.ageHours)}
        </span>
      ),
    },
  ];

  return (
    <TerminalFeedTable
      rows={stories}
      columns={columns}
      rowKey={(s) => String(s.id)}
      accent={HN_ORANGE}
      caption="Hacker News top stories ranked by velocity-weighted trending score"
    />
  );
}

// ---------------------------------------------------------------------------
// Cold-state fallback
// ---------------------------------------------------------------------------

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
          color: HN_ORANGE,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {"// no data yet"}
      </h2>
      <p style={{ marginTop: 12, maxWidth: "32rem", fontSize: 13, color: "var(--v4-ink-300)" }}>
        The Hacker News scraper hasn&apos;t run yet. Run{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>npm run scrape:hn</code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>
          data/hackernews-trending.json
        </code>
        , then refresh this page.
      </p>
    </section>
  );
}
