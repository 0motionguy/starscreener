// /bluesky/trending — engagement-ranked Bluesky feed.
//
// Mirrors /hackernews/trending's rhythm: header strip, 4 stat tiles,
// list below. Shows the top 50 posts merged across curated AI query
// families (agents, LLMs, coding agents, MCP, workflow, etc.), scored
// by likes + 2*reposts + 0.5*replies. Any post that linked to a tracked
// github.com repo surfaces a clickable pill.

import {
  BLUESKY_TRENDING_KEYWORDS,
  getBlueskyTopPosts,
  getBlueskyTrendingFile,
  refreshBlueskyTrendingFromStore,
} from "@/lib/bluesky-trending";
import {
  blueskyCold,
  refreshBlueskyMentionsFromStore,
  repoFullNameToHref,
  type BskyPost,
} from "@/lib/bluesky";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildBlueskyHeader } from "@/components/news/newsTopMetrics";
import { TerminalFeedTable, type FeedColumn } from "@/components/feed/TerminalFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl, userLogoUrl, resolveLogoUrl } from "@/lib/logos";

const BSKY_ACCENT = "rgba(58, 214, 197, 0.85)";

export const dynamic = "force-static";

const BSKY_BLUE = "#0085FF";

function formatAgeHours(ageHours: number | undefined): string {
  if (ageHours === undefined || !Number.isFinite(ageHours)) return "—";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

export default async function BlueskyTrendingPage() {
  await Promise.all([
    refreshBlueskyTrendingFromStore(),
    refreshBlueskyMentionsFromStore(),
  ]);
  const trendingFile = getBlueskyTrendingFile();
  const posts = getBlueskyTopPosts(50);
  const allPosts = trendingFile.posts;
  // Reserved — mention counts surface on /research and via SignalTable.
  void BLUESKY_TRENDING_KEYWORDS;
  void trendingFile.queries;
  void trendingFile.queryFamilies;

  const cold = blueskyCold || allPosts.length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {cold ? (
          <ColdState />
        ) : (
          <>
            <div className="mb-6">
              <NewsTopHeaderV3
                routeTitle="BLUESKY · TOP POSTS"
                liveLabel="LIVE · 24H"
                eyebrow="// BLUESKY · LIVE FIREHOSE"
                meta={[
                  { label: "TRACKED", value: allPosts.length.toLocaleString("en-US") },
                  { label: "WINDOW", value: "24H" },
                ]}
                {...buildBlueskyHeader(trendingFile, getBlueskyTopPosts(3))}
                accent={BSKY_ACCENT}
                caption={[
                  "// LAYOUT compact-v1",
                  "· 3-COL · 320 / 1FR / 1FR",
                  "· DATA UNCHANGED",
                ]}
              />
            </div>

            <BskyPostFeed posts={posts} />
          </>
        )}
      </div>
    </main>
  );
}

function BskyPostFeed({ posts }: { posts: BskyPost[] }) {
  const columns: FeedColumn<BskyPost>[] = [
    {
      id: "rank",
      header: "#",
      width: "44px",
      render: (_, i) => (
        <span
          className="font-mono text-[12px] tabular-nums font-semibold"
          style={{ color: i < 10 ? BSKY_BLUE : "var(--v3-ink-400)" }}
        >
          {String(i + 1).padStart(2, "0")}
        </span>
      ),
    },
    {
      id: "post",
      header: "Post",
      render: (p) => {
        const linkedRepo = p.linkedRepos?.[0]?.fullName;
        const snippet = p.text.length > 140 ? `${p.text.slice(0, 140)}…` : p.text;
        const authorAvatar =
          (p.author as { avatar?: string | null; avatarUrl?: string | null } | null)
            ?.avatar ??
          (p.author as { avatarUrl?: string | null } | null)?.avatarUrl ??
          null;
        // Author handle has a domain shape (handle.bsky.social or custom). The
        // favicon service returns a real site icon for custom domains and a
        // generic Bluesky butterfly for `*.bsky.social` — better than nothing.
        const handleFavicon = p.author?.handle
          ? resolveLogoUrl(p.author.handle, null, 64)
          : null;
        return (
          <div className="flex min-w-0 items-start gap-2">
            <EntityLogo
              src={
                repoLogoUrl(linkedRepo) ??
                userLogoUrl(authorAvatar) ??
                handleFavicon
              }
              name={linkedRepo ?? p.author?.handle ?? p.text}
              size={20}
              shape="circle"
              alt=""
            />
            <div className="min-w-0 flex-1">
            <a
              href={p.bskyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-2 text-[13px] font-medium transition-colors hover:text-[color:var(--v3-acc)]"
              style={{ color: "var(--v3-ink-100)" }}
              title={p.text}
            >
              {snippet}
            </a>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span
                className="text-[10px]"
                style={{ color: "var(--v3-ink-400)" }}
                title={
                  p.author.displayName
                    ? `${p.author.displayName} (@${p.author.handle})`
                    : `@${p.author.handle}`
                }
              >
                @{p.author.handle}
              </span>
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
            </div>
          </div>
        );
      },
    },
    {
      id: "topic",
      header: "Topic",
      width: "130px",
      hideBelow: "md",
      render: (p) => {
        const topicLabel = p.matchedTopicLabel ?? p.matchedKeyword;
        if (!topicLabel) {
          return <span style={{ color: "var(--v3-ink-500)" }}>—</span>;
        }
        return (
          <span
            className="v2-mono inline-flex max-w-full items-center truncate px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase"
            style={{
              color: BSKY_BLUE,
              borderColor: `${BSKY_BLUE}4D`,
              border: `1px solid ${BSKY_BLUE}4D`,
              backgroundColor: `${BSKY_BLUE}0D`,
              borderRadius: 2,
            }}
            title={
              p.matchedQuery
                ? `Matched topic: ${topicLabel} · query: ${p.matchedQuery}`
                : `Matched topic: ${topicLabel}`
            }
          >
            {topicLabel}
          </span>
        );
      },
    },
    {
      id: "likes",
      header: "♥",
      width: "60px",
      align: "right",
      render: (p) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{
            color:
              p.likeCount >= 50 || p.repostCount >= 5
                ? BSKY_BLUE
                : "var(--v3-ink-100)",
          }}
        >
          {p.likeCount.toLocaleString("en-US")}
        </span>
      ),
    },
    {
      id: "reposts",
      header: "⟲",
      width: "54px",
      align: "right",
      hideBelow: "sm",
      render: (p) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v3-ink-300)" }}
        >
          {p.repostCount.toLocaleString("en-US")}
        </span>
      ),
    },
    {
      id: "replies",
      header: "Cmts",
      width: "54px",
      align: "right",
      hideBelow: "md",
      render: (p) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v3-ink-300)" }}
        >
          {p.replyCount.toLocaleString("en-US")}
        </span>
      ),
    },
    {
      id: "age",
      header: "Age",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (p) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v3-ink-400)" }}
        >
          {formatAgeHours(p.ageHours)}
        </span>
      ),
    },
  ];

  return (
    <TerminalFeedTable
      rows={posts}
      columns={columns}
      rowKey={(p) => p.uri}
      accent={BSKY_BLUE}
      caption="Top Bluesky posts ranked by likes + reposts + replies"
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
        style={{ color: BSKY_BLUE }}
      >
        {"// no data yet"}
      </h2>
      <p
        className="mt-3 max-w-xl text-sm"
        style={{ color: "var(--v3-ink-300)" }}
      >
        The Bluesky scraper hasn&apos;t run yet. Run{" "}
        <code style={{ color: "var(--v3-ink-100)" }}>npm run scrape:bsky</code>{" "}
        locally (with <code style={{ color: "var(--v3-ink-100)" }}>BLUESKY_HANDLE</code>{" "}
        + <code style={{ color: "var(--v3-ink-100)" }}>BLUESKY_APP_PASSWORD</code>{" "}
        in env) to populate{" "}
        <code style={{ color: "var(--v3-ink-100)" }}>data/bluesky-trending.json</code>,
        then refresh this page.
      </p>
    </section>
  );
}
