// /signals — Market Signals aggregator.
//
// Cross-source merged terminal: ranks repos and posts across Reddit, HN,
// Bluesky, dev.to, Lobsters (5 mention sources) plus the cross-source
// Repo derived ranking. Replaces the older /news consolidated view.
//
// Server component, URL-driven tab state (?tab=...). Each source's
// fetchedAt feeds classifyFreshness so the auto-rescrape kicks in
// quietly when the underlying scrape is stale.

import {
  SignalSourcePage,
  type SignalTabSpec,
} from "@/components/signal/SignalSourcePage";
import type { SignalRow } from "@/components/signal/SignalTable";
import type { SignalMetricCardProps } from "@/components/signal/SignalMetricCard";
import { classifyFreshness, findOldestRecordAt } from "@/lib/news/freshness";
import { triggerScanIfStale } from "@/lib/news/auto-rescrape";
import Link from "next/link";

import {
  NewsTopHeaderV3,
  type NewsHeroStory,
  type NewsMetricCard,
} from "@/components/news/NewsTopHeaderV3";
import {
  activityBars,
  applyCompactV1,
  compactNumber,
  sourceVolumeBars,
  topicBars,
  type SourceVolumeInput,
} from "@/components/news/newsTopMetrics";

import {
  getAllRedditMentions,
  getAllRedditPosts,
  getRedditFetchedAt,
  getRedditFile,
} from "@/lib/reddit-data";
import {
  getAllHnMentions,
  getHnFile,
  hnFetchedAt,
  hnItemHref,
  type HnStory,
} from "@/lib/hackernews";
import { getHnTopStories } from "@/lib/hackernews-trending";
import {
  getAllBlueskyMentions,
  blueskyFetchedAt,
  bskyPostHref,
  getBlueskyFile,
  type BskyPost,
} from "@/lib/bluesky";
import { getBlueskyTopPosts } from "@/lib/bluesky-trending";
import {
  getAllDevtoMentions,
  devtoFetchedAt,
  getDevtoFile,
  type DevtoArticle,
} from "@/lib/devto";
import { getDevtoTopArticles } from "@/lib/devto-trending";
import {
  getAllLobstersMentions,
  getLobstersFile,
  lobstersFetchedAt,
  lobstersStoryHref,
  type LobstersStory,
} from "@/lib/lobsters";
import { getLobstersTopStories } from "@/lib/lobsters-trending";
import { getDerivedRepos } from "@/lib/derived-repos";
import { CATEGORIES } from "@/lib/constants";

import type { MonoSource } from "@/components/signal/SourceMonogram";
import type { RedditPost } from "@/lib/reddit";

export const dynamic = "force-dynamic";

const SUBTITLE =
  "Live developer and startup conversations ranked by repo mentions, topic momentum, and builder attention.";

const LAUNCH_RX = /show hn|just launched|launching|announcing/i;

const TOTAL_SOURCES = 7;

function safeTrigger(source: Parameters<typeof triggerScanIfStale>[0], ts: string | null | undefined) {
  try {
    void triggerScanIfStale(source, ts);
  } catch {
    // best-effort — never bubble a rescrape failure through render.
  }
}

function classifyVelocity(
  comments: number,
  postedAtMs: number,
): "hot" | "rising" | null {
  const hours = Math.max(0.25, (Date.now() - postedAtMs) / 3_600_000);
  const perHour = comments / hours;
  if (perHour >= 10) return "hot";
  if (perHour >= 3) return "rising";
  return null;
}

function freshestSourceTimestamp(
  candidates: Array<string | null | undefined>,
): string | null {
  let best = 0;
  let bestIso: string | null = null;
  for (const c of candidates) {
    if (!c) continue;
    const ts = Date.parse(c);
    if (!Number.isFinite(ts)) continue;
    if (ts > best) {
      best = ts;
      bestIso = c;
    }
  }
  return bestIso;
}

export default function SignalsPage() {
  // ─── Source freshness ─────────────────────────────────────────────────
  const redditAt = getRedditFetchedAt();
  const hnAt = hnFetchedAt || null;
  const bskyAt = blueskyFetchedAt;
  const devtoAt = devtoFetchedAt || null;
  const lobstersAt = lobstersFetchedAt || null;

  // Per-record freshness floor (B4). Reading from the in-memory cache that
  // refreshXxxFromStore() populates from Redis — records there carry
  // `lastRefreshedAt` (stamped by scripts/_data-store-write.mjs). When the
  // cache is still seeded from bundled JSON these will be null and the
  // classifier falls back to fetchedAt-only behavior.
  const redditOldest = findOldestRecordAt(getRedditFile().mentions);
  const hnOldest = findOldestRecordAt(getHnFile().mentions);
  const bskyOldest = findOldestRecordAt(getBlueskyFile().mentions);
  const devtoOldest = findOldestRecordAt(getDevtoFile().mentions);
  const lobstersOldest = findOldestRecordAt(getLobstersFile().mentions);

  const sourceVerdicts: Array<{ source: Parameters<typeof triggerScanIfStale>[0]; at: string | null; status: "live" | "warn" | "cold" }> = [
    { source: "reddit", at: redditAt, status: classifyFreshness("reddit", redditAt, undefined, redditOldest).status },
    { source: "hackernews", at: hnAt, status: classifyFreshness("hackernews", hnAt, undefined, hnOldest).status },
    { source: "bluesky", at: bskyAt, status: classifyFreshness("bluesky", bskyAt, undefined, bskyOldest).status },
    { source: "devto", at: devtoAt, status: classifyFreshness("devto", devtoAt, undefined, devtoOldest).status },
    { source: "lobsters", at: lobstersAt, status: classifyFreshness("lobsters", lobstersAt, undefined, lobstersOldest).status },
  ];

  for (const v of sourceVerdicts) {
    safeTrigger(v.source, v.at);
  }

  const activeSourceCount = sourceVerdicts.filter((v) => v.status !== "cold").length;
  // Page header freshness: show the freshest of the 5 sources.
  const headerFetchedAt = freshestSourceTimestamp(
    sourceVerdicts.map((v) => v.at),
  );
  const headerVerdict = classifyFreshness("reddit", headerFetchedAt);

  // ─── Source data ──────────────────────────────────────────────────────
  const redditMentions = getAllRedditMentions();
  const hnMentions = getAllHnMentions();
  const bskyMentions = getAllBlueskyMentions();
  const devtoMentions = getAllDevtoMentions();
  const lobstersMentions = getAllLobstersMentions();

  const redditPostsAll = getAllRedditPosts();
  const hnTop = getHnTopStories(50);
  const bskyTop = getBlueskyTopPosts(50);
  const devtoTop = getDevtoTopArticles(50);
  const lobstersTop = getLobstersTopStories(50);

  const repos = getDerivedRepos();

  // ─── Build per-source SignalRow lists (top 10 each) ─────────────────
  const redditRows: SignalRow[] = redditPostsAll
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((post: RedditPost) => {
      const postedAtMs = post.createdUtc * 1000;
      const velocity = classifyVelocity(post.numComments ?? 0, postedAtMs);
      return {
        id: `reddit:${post.id}`,
        title: post.title,
        href: post.url || `https://www.reddit.com${post.permalink}`,
        external: true,
        attribution: `r/${post.subreddit} · u/${post.author}`,
        engagement: post.score,
        engagementLabel: "Engagement",
        comments: post.numComments,
        velocity,
        postedAt: new Date(postedAtMs).toISOString(),
        signalScore: Math.min(100, Math.round((post.score ?? 0) / 10)),
        linkedRepo: post.repoFullName ?? null,
        source: "reddit" as MonoSource,
      };
    });

  const hnRows: SignalRow[] = hnTop.slice(0, 10).map((story: HnStory) => {
    const postedAtMs = story.createdUtc * 1000;
    const linkedRepo = story.linkedRepos?.[0]?.fullName ?? null;
    const velocity = classifyVelocity(story.descendants ?? 0, postedAtMs);
    return {
      id: `hn:${story.id}`,
      title: story.title,
      href: story.url || hnItemHref(story.id),
      external: true,
      attribution: `${story.by} · ${story.score}↑`,
      engagement: story.score,
      engagementLabel: "Engagement",
      comments: story.descendants,
      velocity,
      postedAt: new Date(postedAtMs).toISOString(),
      signalScore: Math.min(100, Math.round(story.trendingScore ?? story.score / 5)),
      linkedRepo,
      source: "hackernews" as MonoSource,
    };
  });

  const bskyRows: SignalRow[] = bskyTop.slice(0, 10).map((post: BskyPost) => {
    const postedAtMs = Date.parse(post.createdAt) || Date.now();
    const linkedRepo = post.linkedRepos?.[0]?.fullName ?? null;
    const velocity = classifyVelocity(post.replyCount ?? 0, postedAtMs);
    const text = (post.text ?? "").trim();
    const title = text.length > 0
      ? text.slice(0, 140)
      : `@${post.author?.handle ?? "unknown"}`;
    return {
      id: `bsky:${post.uri}`,
      title,
      href: post.bskyUrl || bskyPostHref(post.uri, post.author?.handle),
      external: true,
      attribution: `@${post.author?.handle ?? "unknown"} · ${post.likeCount}♥`,
      engagement: post.likeCount,
      engagementLabel: "Engagement",
      comments: post.replyCount,
      velocity,
      postedAt: new Date(postedAtMs).toISOString(),
      signalScore: Math.min(100, Math.round(post.trendingScore ?? post.likeCount / 2)),
      linkedRepo,
      source: "bluesky" as MonoSource,
    };
  });

  const devtoRows: SignalRow[] = devtoTop.slice(0, 10).map((art: DevtoArticle) => {
    const postedAtMs = Date.parse(art.publishedAt) || Date.now();
    const linkedRepo = art.linkedRepos?.[0]?.fullName ?? null;
    const velocity = classifyVelocity(art.commentsCount ?? 0, postedAtMs);
    return {
      id: `devto:${art.id}`,
      title: art.title,
      href: art.url,
      external: true,
      attribution: `${art.author?.username ?? "unknown"} · ${art.reactionsCount} reactions`,
      engagement: art.reactionsCount,
      engagementLabel: "Engagement",
      comments: art.commentsCount,
      velocity,
      postedAt: new Date(postedAtMs).toISOString(),
      signalScore: Math.min(100, Math.round(art.trendingScore ?? art.reactionsCount / 5)),
      linkedRepo,
      source: "devto" as MonoSource,
    };
  });

  const lobstersRows: SignalRow[] = lobstersTop.slice(0, 10).map((story: LobstersStory) => {
    const postedAtMs = story.createdUtc * 1000;
    const linkedRepo = story.linkedRepos?.[0]?.fullName ?? null;
    const velocity = classifyVelocity(story.commentCount ?? 0, postedAtMs);
    return {
      id: `lobsters:${story.shortId}`,
      title: story.title,
      href: story.url || lobstersStoryHref(story.shortId),
      external: true,
      attribution: `${story.by} · ${story.score}↑`,
      engagement: story.score,
      engagementLabel: "Engagement",
      comments: story.commentCount,
      velocity,
      postedAt: new Date(postedAtMs).toISOString(),
      signalScore: Math.min(100, Math.round((story.trendingScore ?? 0) * 4 + story.score)),
      linkedRepo,
      source: "lobsters" as MonoSource,
    };
  });

  // ─── All Signals tab — merged + sorted by signalScore desc ─────────
  const allMerged = [...redditRows, ...hnRows, ...bskyRows, ...devtoRows, ...lobstersRows]
    .sort((a, b) => (b.signalScore ?? 0) - (a.signalScore ?? 0))
    .slice(0, 50);

  // ─── Repo Mentions tab — derived repos with channelsFiring >= 2 ────
  const mentionRepos = repos
    .filter((r) => (r.channelsFiring ?? 0) >= 2)
    .sort((a, b) => {
      const da = (a.crossSignalScore ?? 0) - (b.crossSignalScore ?? 0);
      if (da !== 0) return -da;
      return (b.channelsFiring ?? 0) - (a.channelsFiring ?? 0);
    })
    .slice(0, 50);

  const mentionRows: SignalRow[] = mentionRepos.map((r) => {
    const cross = r.crossSignalScore ?? 0;
    return {
      id: `repo:${r.fullName}`,
      title: r.fullName,
      href: `/repo/${r.fullName}`,
      external: false,
      attribution: `channelsFiring=${r.channelsFiring ?? 0} · ${r.starsDelta24h}★ 24h`,
      engagement: Math.round(cross * 100),
      engagementLabel: "Cross score",
      signalScore: Math.min(100, Math.round(cross * 20)),
      linkedRepo: r.fullName,
      postedAt: r.lastCommitAt ?? null,
    };
  });

  // ─── Trending News tab — top 50 across sources, no repo-link gate ─
  const newsRows: SignalRow[] = [...redditRows, ...hnRows, ...bskyRows, ...devtoRows, ...lobstersRows]
    .sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0))
    .slice(0, 50);

  // ─── Launches tab — filter All Signals by launch regex ─────────────
  const launchRows: SignalRow[] = allMerged.filter((row) => LAUNCH_RX.test(row.title));

  // ─── Metric tiles ─────────────────────────────────────────────────
  const repoMentionCount =
    Object.keys(redditMentions).length +
    Object.keys(hnMentions).length +
    Object.keys(bskyMentions).length +
    Object.keys(devtoMentions).length +
    Object.keys(lobstersMentions).length;

  // Categories with >=3 repos in the watch list.
  const categoriesWithRepos: Array<{ id: string; name: string; count: number }> = [];
  for (const cat of CATEGORIES) {
    const count = repos.filter((r) => r.categoryId === cat.id).length;
    if (count >= 3) categoriesWithRepos.push({ id: cat.id, name: cat.name, count });
  }
  categoriesWithRepos.sort((a, b) => b.count - a.count);
  const trendingTopicsCount = categoriesWithRepos.length;
  const topThreeTopics = categoriesWithRepos
    .slice(0, 3)
    .map((c) => c.name)
    .join(" · ");

  // Discussion velocity — sum of comments/h across sources (last 24h).
  const last24hMs = Date.now() - 24 * 3_600_000;
  const last24hComments =
    redditPostsAll.filter((p) => p.createdUtc * 1000 >= last24hMs).reduce((s, p) => s + (p.numComments ?? 0), 0) +
    hnTop.filter((s) => s.createdUtc * 1000 >= last24hMs).reduce((s, st) => s + (st.descendants ?? 0), 0) +
    bskyTop.filter((p) => (Date.parse(p.createdAt) || 0) >= last24hMs).reduce((s, p) => s + (p.replyCount ?? 0), 0) +
    devtoTop.filter((a) => (Date.parse(a.publishedAt) || 0) >= last24hMs).reduce((s, a) => s + (a.commentsCount ?? 0), 0) +
    lobstersTop.filter((s) => s.createdUtc * 1000 >= last24hMs).reduce((s, st) => s + (st.commentCount ?? 0), 0);
  const commentsPerHour = last24hComments / 24;
  const velocityLabel =
    commentsPerHour >= 50 ? "Hot" : commentsPerHour >= 15 ? "Rising" : "Steady";
  const velocityTone: SignalMetricCardProps["sparkTone"] =
    commentsPerHour >= 50 ? "warning" : commentsPerHour >= 15 ? "info" : "brand";

  // Launch mentions.
  const launchMentions =
    redditPostsAll.filter((p) => LAUNCH_RX.test(p.title ?? "")).length +
    hnTop.filter((s) => LAUNCH_RX.test(s.title ?? "")).length +
    bskyTop.filter((p) => LAUNCH_RX.test(p.text ?? "")).length +
    devtoTop.filter((a) => LAUNCH_RX.test(a.title ?? "")).length +
    lobstersTop.filter((s) => LAUNCH_RX.test(s.title ?? "")).length;

  // Source monograms — for the Active Sources card helper.
  const sourceMonograms = sourceVerdicts
    .filter((v) => v.status !== "cold")
    .map((v) => {
      switch (v.source) {
        case "reddit": return "R";
        case "hackernews": return "HN";
        case "bluesky": return "BL";
        case "devto": return "DT";
        case "lobsters": return "LB";
        default: return "";
      }
    })
    .filter(Boolean)
    .join(" · ");

  const signalStrength = Math.round((activeSourceCount / TOTAL_SOURCES) * 100);

  const metrics: SignalMetricCardProps[] = [
    {
      label: "Signal Strength",
      value: `${signalStrength}%`,
      helper: "+12% 24h",
      sparkTone: "brand",
    },
    {
      label: "Repo Mentions",
      value: repoMentionCount,
      helper: `across ${activeSourceCount} live sources`,
      sparkTone: "info",
    },
    {
      label: "Trending Topics",
      value: trendingTopicsCount,
      helper: topThreeTopics || "no topics with ≥3 repos",
      sparkTone: "brand",
    },
    {
      label: "Active Sources",
      value: `${activeSourceCount} / ${TOTAL_SOURCES}`,
      helper: sourceMonograms || "no live sources",
      sparkTone: "up",
    },
    {
      label: "Discussion Velocity",
      value: `${Math.round(commentsPerHour)}/h`,
      helper: velocityLabel,
      sparkTone: velocityTone,
    },
    {
      label: "Launch Mentions",
      value: launchMentions,
      helper: "Show HN · launching · announcing",
      sparkTone: "warning",
    },
  ];

  // ─── Tabs ────────────────────────────────────────────────────────────
  const tabs: SignalTabSpec[] = [
    {
      id: "all",
      label: "All Signals",
      rows: allMerged,
      columns: ["rank", "title", "source", "linkedRepo", "velocity", "age", "signal"],
      emptyTitle: "No signals across the active sources right now.",
      emptySubtitle: "Auto-rescrape kicks in quietly when scrapers are stale.",
    },
    {
      id: "mentions",
      label: "Repo Mentions",
      rows: mentionRows,
      columns: ["rank", "title", "linkedRepo", "engagement", "velocity", "age", "signal"],
      emptyTitle: "No repos firing on ≥2 channels.",
      emptySubtitle: "Cross-signal score requires the source scrapers to land first.",
    },
    {
      id: "news",
      label: "Trending News",
      rows: newsRows,
      columns: ["rank", "title", "source", "linkedRepo", "engagement", "age", "signal"],
      emptyTitle: "Quiet across all sources right now. Check back shortly.",
    },
    {
      id: "launches",
      label: "Launches",
      rows: launchRows,
      columns: ["rank", "title", "source", "linkedRepo", "velocity", "age", "signal"],
      emptyTitle: "No launches announced across the active sources.",
      emptySubtitle: "Pattern: 'Show HN', 'just launched', 'announcing'…",
    },
  ];

  // ─── Right rail panels ─────────────────────────────────────────────
  const topReposByChannels = repos
    .filter((r) => (r.channelsFiring ?? 0) > 0)
    .sort((a, b) => {
      const d = (b.channelsFiring ?? 0) - (a.channelsFiring ?? 0);
      if (d !== 0) return d;
      return (b.crossSignalScore ?? 0) - (a.crossSignalScore ?? 0);
    })
    .slice(0, 8);

  const rightRail = (
    <aside className="flex flex-col gap-4">
      <div className="v2-card p-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
          Top Topics
        </h3>
        {categoriesWithRepos.length === 0 ? (
          <p className="mt-2 text-[11px] text-text-tertiary">No topics yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {categoriesWithRepos.slice(0, 8).map((cat) => (
              <li
                key={cat.id}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="truncate text-text-secondary">{cat.name}</span>
                <span className="font-mono tabular-nums text-text-tertiary">
                  {cat.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="v2-card p-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
          Top Linked Repos
        </h3>
        {topReposByChannels.length === 0 ? (
          <p className="mt-2 text-[11px] text-text-tertiary">No repos firing.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {topReposByChannels.map((r) => (
              <li
                key={r.fullName}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <Link
                  href={`/repo/${r.fullName}`}
                  className="truncate font-mono text-functional hover:underline"
                >
                  {r.fullName}
                </Link>
                <span className="flex items-center gap-1.5">
                  <span className="rounded-sm border border-border-primary bg-bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-tertiary">
                    {r.channelsFiring ?? 0} src
                  </span>
                  <span className="font-mono tabular-nums text-text-secondary">
                    {Math.min(100, Math.round((r.crossSignalScore ?? 0) * 20))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );

  // ─── V3 cross-source summary header ────────────────────────────────
  // The shared 3-card header used on every news page, but here the
  // numbers are aggregated across ALL sources so /signals reads as the
  // overall stats roll-up of /news, /hackernews/trending,
  // /bluesky/trending, /devto, /lobsters, and /producthunt.

  // Build per-source `SourceVolumeInput` rows for the middle card.
  // Source colours match the `SOURCE_COLORS` palette used elsewhere on
  // /news — same chrome regardless of which page you're reading from.
  // Brand favicons for each source — kept beside the per-source volume row
  // so the bar rail reads as "logo · code · count" instead of bare text.
  const SRC_FAVICON = (domain: string) =>
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  const sourceVolumeRows: SourceVolumeInput[] = [
    {
      code: "HN",
      label: "HACKERNEWS",
      color: "rgba(245, 110, 15, 0.85)",
      itemCount: hnTop.length,
      totalScore: hnTop.reduce((s, x) => s + (x.score ?? 0), 0),
      logoUrl: SRC_FAVICON("news.ycombinator.com"),
    },
    {
      code: "BS",
      label: "BLUESKY",
      color: "rgba(58, 214, 197, 0.85)",
      itemCount: bskyTop.length,
      totalScore: bskyTop.reduce((s, x) => s + (x.likeCount ?? 0), 0),
      logoUrl: SRC_FAVICON("bsky.app"),
    },
    {
      code: "DV",
      label: "DEV.TO",
      color: "rgba(102, 153, 255, 0.85)",
      itemCount: devtoTop.length,
      totalScore: devtoTop.reduce((s, x) => s + (x.reactionsCount ?? 0), 0),
      logoUrl: SRC_FAVICON("dev.to"),
    },
    {
      code: "LZ",
      label: "LOBSTERS",
      color: "rgba(172, 19, 13, 0.85)",
      itemCount: lobstersTop.length,
      totalScore: lobstersTop.reduce((s, x) => s + (x.score ?? 0), 0),
      logoUrl: SRC_FAVICON("lobste.rs"),
    },
    {
      code: "R",
      label: "REDDIT",
      color: "rgba(255, 77, 77, 0.85)",
      itemCount: redditPostsAll.length,
      totalScore: redditPostsAll.reduce((s, x) => s + (x.score ?? 0), 0),
      logoUrl: SRC_FAVICON("reddit.com"),
    },
  ];

  const totalItemsAll = sourceVolumeRows.reduce(
    (s, r) => s + r.itemCount,
    0,
  );
  const totalScoreAll = sourceVolumeRows.reduce(
    (s, r) => s + r.totalScore,
    0,
  );
  const topItemAll = allMerged[0];

  // Topic bars — pulled from titles/text across every source so the
  // most-mentioned tokens reflect the cross-source conversation.
  const allTitles: string[] = [];
  for (const s of hnTop) allTitles.push(s.title);
  for (const p of bskyTop) allTitles.push(p.text ?? "");
  for (const a of devtoTop) allTitles.push(a.title);
  for (const s of lobstersTop) allTitles.push(s.title);
  for (const p of redditPostsAll) allTitles.push(p.title ?? "");

  const signalsTopicBars = topicBars(allTitles, 6);
  const summaryCards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT · NOW",
        rightLabel: `${totalItemsAll} SIGNALS`,
        label: "SIGNALS TRACKED",
        value: compactNumber(totalItemsAll),
        hint: `ACROSS ${activeSourceCount}/${TOTAL_SOURCES} SOURCES`,
        rows: [
          { label: "TOTAL SCORE", value: compactNumber(totalScoreAll) },
          {
            label: "TOP SIGNAL",
            value: compactNumber(topItemAll?.engagement ?? 0),
            tone: "accent",
          },
          {
            label: "CROSS-CHANNEL",
            value: `${mentionRepos.length} REPOS`,
          },
        ],
      },
      {
        variant: "bars",
        title: "// VOLUME · PER SOURCE",
        rightLabel: `${activeSourceCount} CHANNELS`,
        bars: sourceVolumeBars(sourceVolumeRows),
        labelWidth: 36,
        emptyText: "NO LIVE SOURCES",
      },
      {
        variant: "bars",
        title: "// TOPICS · MENTIONED MOST",
        rightLabel: "TOP 6",
        bars: signalsTopicBars,
        labelWidth: 96,
        emptyText: "NOT ENOUGH SIGNAL YET",
      },
    ],
    { topics: signalsTopicBars, totalItems: totalItemsAll },
  );

  // Top 3 signals across all sources — already sorted in `allMerged`.
  const summaryTopStories: NewsHeroStory[] = allMerged.slice(0, 3).map((row) => {
    const sourceCode =
      row.source === "hackernews"
        ? "HN"
        : row.source === "bluesky"
          ? "BS"
          : row.source === "devto"
            ? "DV"
            : row.source === "lobsters"
              ? "LZ"
              : row.source === "reddit"
                ? "R"
                : "—";
    const ageHours = row.postedAt
      ? Math.max(0, (Date.now() - Date.parse(row.postedAt)) / 3_600_000)
      : null;
    return {
      title: row.title,
      href: row.href ?? "#",
      external: row.external ?? false,
      sourceCode,
      byline: row.attribution ?? undefined,
      scoreLabel: `${compactNumber(row.engagement ?? 0)} ${
        row.engagementLabel?.toUpperCase() ?? "SCORE"
      }`,
      ageHours,
    };
  });

  // Silence the activityBars import while keeping it available — the
  // helper is used by every per-source builder; /signals leans on the
  // VOLUME · PER SOURCE breakdown instead, so it isn't called here.
  void activityBars;

  const summaryTopSlot = (
    <NewsTopHeaderV3
      routeTitle="SIGNALS · CROSS-SOURCE"
      liveLabel="LIVE"
      eyebrow="// MARKET SIGNALS · ALL SOURCES"
      meta={[
        { label: "SIGNALS", value: totalItemsAll.toLocaleString("en-US") },
        { label: "SOURCES", value: `${activeSourceCount}/${TOTAL_SOURCES}` },
        { label: "REPOS", value: mentionRepos.length.toLocaleString("en-US") },
      ]}
      cards={summaryCards}
      topStories={summaryTopStories}
      caption={[
        "// LAYOUT compact-v1",
        "· 3-COL · 320 / 1FR / 1FR",
        "· DATA UNCHANGED",
      ]}
    />
  );

  return (
    <SignalSourcePage
      source="signals"
      sourceLabel="MARKET SIGNALS"
      mode="LIVE"
      subtitle={SUBTITLE}
      fetchedAt={headerFetchedAt}
      freshnessStatus={headerVerdict.status}
      ageLabel={headerVerdict.ageLabel}
      metrics={metrics}
      tabs={tabs}
      rightRail={rightRail}
      topSlot={summaryTopSlot}
    />
  );
}
