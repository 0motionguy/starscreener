// /hackernews/trending — velocity-scored HN story feed.
//
// Single-tab v1: top 50 stories from data/hackernews-trending.json
// (Firebase top-500 + Algolia 7d github-mention sweep, deduped, scored
// by velocity * log10(score)). Mirrors the structural/visual rhythm of
// /reddit/trending: header strip, 4 stat tiles, list below. No topic
// mindshare map (HN has no n-gram topics yet).

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
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildHackerNewsHeader } from "@/components/news/newsTopMetrics";
import { TerminalFeedTable, type FeedColumn } from "@/components/feed/TerminalFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl } from "@/lib/logos";

const HN_ACCENT = "rgba(245, 110, 15, 0.85)";

export const dynamic = "force-static";

const HN_ORANGE = "#ff6600";

function formatAgeHours(ageHours: number | undefined): string {
  if (ageHours === undefined || !Number.isFinite(ageHours)) return "—";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
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

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {cold ? (
          <ColdState />
        ) : (
          <>
            <div className="mb-6">
              <NewsTopHeaderV3
                eyebrow="// HACKERNEWS · TOP STORIES"
                status={`${allStories.length.toLocaleString("en-US")} TRACKED · ${trendingFile.windowHours}H`}
                {...buildHackerNewsHeader(trendingFile, getHnTopStories(3))}
                accent={HN_ACCENT}
              />
            </div>

            <HnStoryFeed stories={stories} />
          </>
        )}
      </div>
    </main>
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
          style={{ color: i < 10 ? HN_ORANGE : "var(--v3-ink-400)" }}
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
              className="truncate text-[13px] font-medium transition-colors hover:text-[color:var(--v3-acc)]"
              style={{ color: "var(--v3-ink-100)" }}
              title={s.title}
            >
              {s.title}
            </a>
            {linkedRepo ? (
              <a
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
          <span style={{ color: "var(--v3-ink-500)" }}>—</span>
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
          style={{ color: s.score >= 100 ? HN_ORANGE : "var(--v3-ink-100)" }}
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
          style={{ color: "var(--v3-ink-300)" }}
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
          style={{ color: "var(--v3-ink-400)" }}
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
// Pieces
// ---------------------------------------------------------------------------

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
        style={{ color: HN_ORANGE }}
      >
        {"// no data yet"}
      </h2>
      <p
        className="mt-3 max-w-xl text-sm"
        style={{ color: "var(--v3-ink-300)" }}
      >
        The Hacker News scraper hasn&apos;t run yet. Run{" "}
        <code style={{ color: "var(--v3-ink-100)" }}>npm run scrape:hn</code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v3-ink-100)" }}>
          data/hackernews-trending.json
        </code>
        , then refresh this page.
      </p>
    </section>
  );
}
