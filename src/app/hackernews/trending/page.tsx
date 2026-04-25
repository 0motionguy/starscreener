// /hackernews/trending — Hacker News Signal Terminal page.
//
// Tabs:
//   1. Repo Mentions (default) — tracked repos discussed on HN, ranked
//      by 7d mention volume + total score.
//   2. Trending News — top HN stories ranked by velocity * log10(score).
//   3. Front Page — same shape as news, filtered to stories that ever
//      hit the front page.
//
// Mirrors src/app/reddit/page.tsx: server component, dense rows,
// columns-driven SignalTable, six metric tiles, no scan-now buttons.

import {
  getAllHnMentions,
  getHnFile,
  hnFetchedAt,
  hnItemHref,
} from "@/lib/hackernews";
import {
  getHnTopStories,
  getHnTrendingFile,
} from "@/lib/hackernews-trending";
import {
  SignalSourcePage,
  type SignalTabSpec,
} from "@/components/signal/SignalSourcePage";
import type { SignalRow } from "@/components/signal/SignalTable";
import type { SignalMetricCardProps } from "@/components/signal/SignalMetricCard";
import { classifyFreshness } from "@/lib/news/freshness";
import { triggerScanIfStale } from "@/lib/news/auto-rescrape";

export const dynamic = "force-dynamic";

const SUBTITLE =
  "Trending Hacker News stories ranked by discussion velocity, front-page strength, and repo links.";

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

function scaleScore(values: number[]): (n: number) => number {
  const max = Math.max(...values, 1);
  return (n: number) => Math.round((n / max) * 100);
}

export default function HackerNewsTrendingPage() {
  const mentionsFile = getHnFile();
  const fetchedAt = mentionsFile.fetchedAt ?? hnFetchedAt;
  const verdict = classifyFreshness("hackernews", fetchedAt);

  const mentions = getAllHnMentions();
  const trendingFile = getHnTrendingFile();
  const allStories = trendingFile.stories;
  const topStories = getHnTopStories(30);

  // ─── Repo Mentions tab ─────────────────────────────────────────────────
  const mentionEntries = Object.entries(mentions)
    .filter(([, m]) => m.count7d > 0)
    .sort((a, b) => b[1].count7d - a[1].count7d)
    .slice(0, 50);
  const mentionScale = scaleScore(
    mentionEntries.map(([, m]) => m.scoreSum7d),
  );

  const mentionRows: SignalRow[] = mentionEntries.map(([fullName, m]) => {
    const top = m.topStory ?? null;
    const fallback = m.stories?.[0] ?? null;
    const velocitySource = fallback;
    const postedAtMs = velocitySource
      ? velocitySource.createdUtc * 1000
      : null;
    return {
      id: `hn-mention:${fullName}`,
      title: fullName,
      href: `/repo/${fullName}`,
      external: false,
      attribution: top
        ? `${m.count7d}× · top: ${top.title}`
        : `${m.count7d}× / 7d`,
      engagement: m.scoreSum7d,
      engagementLabel: "Score",
      velocity:
        velocitySource && postedAtMs !== null
          ? classifyVelocity(velocitySource.descendants ?? 0, postedAtMs)
          : null,
      postedAt: postedAtMs !== null ? new Date(postedAtMs).toISOString() : null,
      signalScore: mentionScale(m.scoreSum7d),
      linkedRepo: null,
      badges: m.count7d >= 5 ? ["fire"] : undefined,
    };
  });

  // ─── Trending News tab ─────────────────────────────────────────────────
  const newsScale = scaleScore(topStories.map((s) => s.score));

  const newsRows: SignalRow[] = topStories.map((s) => {
    const postedAtMs = s.createdUtc * 1000;
    const linkedRepo = s.linkedRepos?.[0]?.fullName ?? null;
    return {
      id: `hn-news:${s.id}`,
      title: s.title,
      href: s.url || hnItemHref(s.id),
      external: true,
      attribution: s.by ? `by ${s.by}` : null,
      engagement: s.score,
      engagementLabel: "Score",
      comments: s.descendants,
      velocity: classifyVelocity(s.descendants ?? 0, postedAtMs),
      postedAt: new Date(postedAtMs).toISOString(),
      signalScore: newsScale(s.score),
      linkedRepo,
      badges: s.everHitFrontPage ? ["front-page"] : undefined,
    };
  });

  // ─── Front Page tab ────────────────────────────────────────────────────
  const frontPageRows: SignalRow[] = newsRows.filter((r) =>
    r.badges?.includes("front-page"),
  );

  // ─── Metric strip ─────────────────────────────────────────────────────
  const frontPageCount = allStories.filter((s) => s.everHitFrontPage).length;
  const totalStories = allStories.length;
  const frontPagePct = totalStories > 0
    ? Math.round((frontPageCount / totalStories) * 100)
    : 0;

  const reposHit = Object.keys(mentions).length;
  const totalMentions = Object.values(mentions).reduce(
    (s, m) => s + (m.count7d ?? 0),
    0,
  );

  const last24hStories = allStories.filter(
    (s) => Date.now() - s.createdUtc * 1000 < 24 * 3_600_000,
  );
  const commentsLast24h = last24hStories.reduce(
    (s, st) => s + (st.descendants ?? 0),
    0,
  );
  const commentsPerHour = commentsLast24h / 24;

  const topStory = allStories.reduce<typeof allStories[number] | null>(
    (best, s) => (best === null || s.score > best.score ? s : best),
    null,
  );
  const topScore = topStory?.score ?? 0;

  const aiDevCount = allStories.filter((s) => {
    const tags = (s.content_tags ?? []).map((t) => t.toLowerCase());
    const hitsTag = tags.some(
      (t) => t === "ai" || t === "dev" || t === "ml" || t === "llm",
    );
    const hasRepo = (s.linkedRepos?.length ?? 0) > 0;
    return hitsTag || hasRepo;
  }).length;

  const metrics: SignalMetricCardProps[] = [
    {
      label: "Front Page Signals",
      value: frontPageCount,
      helper: `${frontPagePct}% on front page`,
      sparkTone: "warning",
    },
    {
      label: "Repo Mentions",
      value: reposHit,
      delta: totalMentions > 0 ? `${totalMentions} total` : null,
      sparkTone: "brand",
    },
    {
      label: "Discussion Velocity",
      value: `${Math.round(commentsPerHour)}/h`,
      helper:
        commentsPerHour >= 10
          ? "Hot"
          : commentsPerHour >= 3
            ? "Rising"
            : "Steady",
      sparkTone: commentsPerHour >= 10 ? "warning" : "info",
    },
    {
      label: "Top Story Score",
      value: topScore,
      helper: topStory?.title?.slice(0, 40) ?? null,
      sparkTone: "up",
    },
    {
      label: "Comments 24h",
      value: commentsLast24h,
      helper: `${last24hStories.length} stories`,
      sparkTone: "info",
    },
    {
      label: "AI / Dev stories",
      value: aiDevCount,
      helper: `of ${totalStories} tracked`,
      sparkTone: "brand",
    },
  ];

  // ─── Tabs ─────────────────────────────────────────────────────────────
  const tabs: SignalTabSpec[] = [
    {
      id: "mentions",
      label: "Repo Mentions",
      rows: mentionRows,
      columns: ["rank", "title", "engagement", "velocity", "age", "signal"],
      emptyTitle: "No tracked repos mentioned on Hacker News in the last 7 days.",
      emptySubtitle:
        "Pipeline is healthy; the watch list just hasn't lit up yet.",
    },
    {
      id: "news",
      label: "Trending News",
      rows: newsRows,
      columns: [
        "rank",
        "title",
        "linkedRepo",
        "engagement",
        "velocity",
        "age",
        "signal",
      ],
      emptyTitle: "Hacker News is quiet right now. Check back in a few minutes.",
    },
    {
      id: "frontpage",
      label: "Front Page",
      rows: frontPageRows,
      columns: [
        "rank",
        "title",
        "linkedRepo",
        "engagement",
        "velocity",
        "age",
        "signal",
      ],
      emptyTitle: "No front-page hits in the current window.",
    },
  ];

  void triggerScanIfStale("hackernews", fetchedAt);

  return (
    <SignalSourcePage
      source="hackernews"
      sourceLabel="HACKER NEWS"
      mode="TRENDING"
      subtitle={SUBTITLE}
      fetchedAt={fetchedAt}
      freshnessStatus={verdict.status}
      ageLabel={verdict.ageLabel}
      metrics={metrics}
      tabs={tabs}
    />
  );
}
