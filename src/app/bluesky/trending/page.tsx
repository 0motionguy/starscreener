// /bluesky/trending — V4 SourceFeedTemplate consumer.
//
// Top 50 posts merged across curated AI query families, scored by
// likes + 2*reposts + 0.5*replies. Posts linking to tracked github.com
// repos surface a clickable pill.

import type { Metadata } from "next";
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
import { TerminalFeedTable, type FeedColumn } from "@/components/feed/TerminalFeedTable";
import { WindowedFeedTable } from "@/components/feed/WindowedFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl, userLogoUrl, resolveLogoUrl } from "@/lib/logos";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Trending on Bluesky",
  description:
    "Top Bluesky posts about AI, dev tools, and open source — scored by likes, reposts, and replies. Posts linking to tracked GitHub repos surface inline.",
  alternates: { canonical: "/bluesky/trending" },
  openGraph: {
    title: "Trending on Bluesky — TrendingRepo",
    description: "Top Bluesky tech posts, scored by engagement and tracked-repo overlap.",
    url: "/bluesky/trending",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trending on Bluesky — TrendingRepo",
    description: "Top Bluesky tech posts, scored by engagement and tracked-repo overlap.",
  },
};

const BSKY_BLUE = "#0085FF";

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

  if (cold) {
    return (
      <main className="home-surface">
        <SourceFeedTemplate
          crumb={
            <>
              <b>BLUESKY</b> · TERMINAL · /BLUESKY/TRENDING
            </>
          }
          title="Bluesky · top posts"
          lede="Posts merged across curated AI query families (agents, LLMs, coding agents, MCP, workflow), scored by engagement and cross-linked to GitHub repos."
        />
        <ColdState />
      </main>
    );
  }

  const topLikes = allPosts.reduce((m, p) => Math.max(m, p.likeCount), 0);
  const linkedRepoCount = allPosts.filter(
    (p) => Array.isArray(p.linkedRepos) && p.linkedRepos.length > 0,
  ).length;
  const topicCount = new Set(
    allPosts.map((p) => p.matchedTopicLabel ?? p.matchedKeyword).filter(Boolean),
  ).size;

  return (
    <main className="home-surface">
      <SourceFeedTemplate
        crumb={
          <>
            <b>BLUESKY</b> · TERMINAL · /BLUESKY/TRENDING
          </>
        }
        title="Bluesky · top posts"
        lede="Posts merged across curated AI query families (agents, LLMs, coding agents, MCP, workflow), scored by engagement and cross-linked to GitHub repos."
        clock={
          <>
            <span className="big">{formatClock(trendingFile.fetchedAt)}</span>
            <span className="muted">UTC · SCRAPED</span>
            <LiveDot label="LIVE · 24H" />
          </>
        }
        snapshot={
          <KpiBand
            cells={[
              {
                label: "TRACKED",
                value: allPosts.length.toLocaleString("en-US"),
                sub: "24h rolling",
                pip: "var(--v4-src-bsky)",
              },
              {
                label: "TOP LIKES",
                value: topLikes.toLocaleString("en-US"),
                sub: "engagement peak",
                tone: "acc",
                pip: "var(--v4-acc)",
              },
              {
                label: "TOPICS",
                value: topicCount,
                sub: "matched query families",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "GH-LINKED",
                value: linkedRepoCount,
                sub: "posts with repo",
                pip: "var(--v4-blue)",
              },
            ]}
          />
        }
        listEyebrow="Post feed · 24h / 7d / 30d window"
        list={<WindowedBskyFeed allPosts={allPosts} />}
      />
    </main>
  );
}

// AUDIT-2026-05-04 follow-up: 24h / 7d / 30d toggle on /bluesky/trending.
// Posts carry `ageHours`; filter into windows server-side, render three
// pre-built tables, let the client toggle.
function WindowedBskyFeed({ allPosts }: { allPosts: BskyPost[] }) {
  const sortByScore = (list: BskyPost[]) =>
    list
      .slice()
      .sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0))
      .slice(0, 50);
  const inWindow = (max: number) =>
    sortByScore(
      allPosts.filter(
        (p) => p.ageHours !== undefined && p.ageHours <= max,
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
      table24h={<BskyPostFeed posts={w24h} />}
      table7d={<BskyPostFeed posts={w7d} />}
      table30d={<BskyPostFeed posts={w30d} />}
      defaultWindow="7d"
    />
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
          style={{ color: i < 10 ? BSKY_BLUE : "var(--v4-ink-400)" }}
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
                className="line-clamp-2 text-[13px] font-medium transition-colors hover:text-[color:var(--v4-acc)]"
                style={{ color: "var(--v4-ink-100)" }}
                title={p.text}
              >
                {snippet}
              </a>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <span
                  className="text-[10px]"
                  style={{ color: "var(--v4-ink-400)" }}
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
          return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
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
                : "var(--v4-ink-100)",
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
          style={{ color: "var(--v4-ink-300)" }}
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
          style={{ color: "var(--v4-ink-300)" }}
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
          style={{ color: "var(--v4-ink-400)" }}
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
          color: BSKY_BLUE,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {"// no data yet"}
      </h2>
      <p style={{ marginTop: 12, maxWidth: "32rem", fontSize: 13, color: "var(--v4-ink-300)" }}>
        The Bluesky scraper hasn&apos;t run yet. Run{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>npm run scrape:bsky</code>{" "}
        locally (with{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>BLUESKY_HANDLE</code> +{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>BLUESKY_APP_PASSWORD</code> in env) to
        populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>data/bluesky-trending.json</code>, then
        refresh this page.
      </p>
    </section>
  );
}
