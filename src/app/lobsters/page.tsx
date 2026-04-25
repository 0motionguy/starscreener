// /lobsters — Lobsters Signal Terminal page.
//
// Tabs:
//   1. Repo Mentions (default) — tracked repos discussed on Lobsters,
//      ranked by 7d mention count.
//   2. Trending News — top Lobsters stories by raw score, regardless of
//      whether they link a tracked repo.
//   3. Tags — dense list of active Lobsters tags with story totals and
//      the top story under each.
//
// No bubble map. No "scan now" button. Fresh data signal is the small
// LIVE/STALE pill in the header. Server-side auto-rescrape recovers a
// stale source quietly.

import {
  getAllLobstersMentions,
  getLobstersFile,
  lobstersFetchedAt,
  type LobstersStory,
} from "@/lib/lobsters";
import {
  getLobstersTopStories,
  getLobstersTrendingFile,
} from "@/lib/lobsters-trending";
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
  "Technical stories ranked by score, comments, tags, and repo mentions.";

interface TagTally {
  tag: string;
  count: number;
  topStory: LobstersStory | null;
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

function scaleScore(values: number[]): (n: number) => number {
  const max = Math.max(...values, 1);
  return (n: number) => Math.round((n / max) * 100);
}

export default function LobstersPage() {
  const mentionsFile = getLobstersFile();
  const fetchedAt = mentionsFile.fetchedAt || lobstersFetchedAt || null;
  const verdict = classifyFreshness("lobsters", fetchedAt);

  const mentions = getAllLobstersMentions();
  const trendingFile = getLobstersTrendingFile();
  const allStories: LobstersStory[] = trendingFile.stories ?? [];
  const topStoriesHydrated = getLobstersTopStories(500);

  // Build a quick lookup so we can pull submitter / createdUtc /
  // commentCount from the full story snapshot when we only have a
  // LobstersStoryRef on the mention bucket.
  const storyByShortId = new Map<string, LobstersStory>();
  for (const s of allStories) {
    storyByShortId.set(s.shortId, s);
  }

  // ─── Repo Mentions tab ─────────────────────────────────────────────────
  const mentionEntries = Object.entries(mentions)
    .filter(([, m]) => m.count7d > 0)
    .sort((a, b) => b[1].count7d - a[1].count7d)
    .slice(0, 50);
  const mentionScale = scaleScore(
    mentionEntries.map(([, m]) => m.scoreSum7d),
  );

  const mentionRows: SignalRow[] = mentionEntries.map(([fullName, m]) => {
    const topRef = m.topStory;
    const fullTop = topRef ? storyByShortId.get(topRef.shortId) ?? null : null;
    const postedAtMs = fullTop?.createdUtc ? fullTop.createdUtc * 1000 : 0;
    const commentCount = fullTop?.commentCount ?? 0;
    const titleExcerpt = (topRef?.title ?? fullTop?.title ?? "").slice(0, 80);
    return {
      id: `lobsters-mention:${fullName}`,
      title: fullName,
      href: `/repo/${fullName}`,
      external: false,
      attribution: titleExcerpt
        ? `${m.count7d}× · ${titleExcerpt}`
        : `${m.count7d}× / 7d`,
      engagement: m.scoreSum7d,
      engagementLabel: "Score",
      comments: commentCount,
      velocity: postedAtMs ? classifyVelocity(commentCount, postedAtMs) : null,
      postedAt: postedAtMs ? new Date(postedAtMs).toISOString() : null,
      signalScore: mentionScale(m.scoreSum7d),
      linkedRepo: null,
      badges: m.count7d >= 5 ? ["fire"] : undefined,
    };
  });

  // ─── Trending News tab ─────────────────────────────────────────────────
  // Re-sort the hydrated stories by raw score desc — the helper sorts by
  // trendingScore, but the news tab wants raw score ranking.
  const topPosts = topStoriesHydrated
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
  const newsScale = scaleScore(topPosts.map((p) => p.score));

  const newsRows: SignalRow[] = topPosts.map((story) => {
    const postedAtMs = story.createdUtc * 1000;
    const linkedRepo = story.linkedRepos?.[0]?.fullName ?? null;
    const tag = story.tags?.[0] ?? null;
    return {
      id: `lobsters-news:${story.shortId}`,
      title: story.title,
      href: story.commentsUrl || story.url,
      external: true,
      attribution: story.by ? `by ${story.by}` : null,
      engagement: story.score,
      engagementLabel: "Score",
      comments: story.commentCount,
      velocity: classifyVelocity(story.commentCount ?? 0, postedAtMs),
      postedAt: new Date(postedAtMs).toISOString(),
      signalScore: newsScale(story.score),
      linkedRepo,
      topic: tag,
    };
  });

  // ─── Tags tab ──────────────────────────────────────────────────────────
  // Tally tags across all stories, capture the highest-scoring story per
  // tag for the sidebar link.
  const tagMap: Map<string, TagTally> = new Map();
  for (const s of allStories) {
    for (const t of s.tags ?? []) {
      const cur =
        tagMap.get(t) ?? {
          tag: t,
          count: 0,
          topStory: null as LobstersStory | null,
        };
      cur.count += 1;
      if (!cur.topStory || (s.score ?? 0) > (cur.topStory.score ?? 0)) {
        cur.topStory = s;
      }
      tagMap.set(t, cur);
    }
  }
  const tagList = Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
  const totalTags = tagList.length;
  const activeTags = tagList.filter((t) => t.count >= 2).length;

  // ─── Metric strip ─────────────────────────────────────────────────────
  const reposHit = Object.keys(mentions).length;
  const scannedStories =
    mentionsFile.scannedStories || trendingFile.scannedTotal || allStories.length;

  const last24hStories = allStories.filter(
    (s) => Date.now() - s.createdUtc * 1000 < 24 * 3_600_000,
  );
  const commentsLast24h = last24hStories.reduce(
    (sum, s) => sum + (s.commentCount ?? 0),
    0,
  );
  const commentsPerHour = commentsLast24h / 24;
  const velocityHelper =
    commentsPerHour >= 10 ? "Hot" : commentsPerHour >= 3 ? "Rising" : "Steady";

  const securityDevtoolsCount = allStories.filter((s) =>
    (s.tags ?? []).some((t) => /security|devops|programming|practices/.test(t)),
  ).length;

  const topStory = topPosts[0] ?? null;
  const topSignalValue = topStory?.score ?? 0;
  const topSignalHelper = topStory ? topStory.title.slice(0, 40) : null;

  const metrics: SignalMetricCardProps[] = [
    {
      label: "Technical Signals",
      value: scannedStories,
      helper: `${trendingFile.windowHours ?? 72}h trending window`,
      sparkTone: "brand",
    },
    {
      label: "Repo Mentions",
      value: reposHit,
      helper:
        reposHit > 0
          ? `${reposHit} repo${reposHit === 1 ? "" : "s"} mentioned in 7d`
          : "no GitHub links matched tracked repos",
      sparkTone: "info",
    },
    {
      label: "Active Tags",
      value: `${activeTags} / ${totalTags}`,
      helper: tagList[0] ? `top: ${tagList[0].tag}` : null,
      sparkTone: "info",
    },
    {
      label: "Discussion Velocity",
      value: `${Math.round(commentsPerHour)}/h`,
      helper: velocityHelper,
      sparkTone: commentsPerHour >= 10 ? "warning" : "info",
    },
    {
      label: "Security / DevTools",
      value: securityDevtoolsCount,
      helper:
        securityDevtoolsCount > 0
          ? `tagged security · devops · programming · practices`
          : "no signal in window",
      sparkTone: "up",
    },
    {
      label: "Top signal",
      value: topSignalValue,
      helper: topSignalHelper,
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
      emptyTitle: "No tracked repos mentioned on Lobsters in the last 7 days.",
      emptySubtitle: "Pipeline is healthy; the watch list just hasn't lit up yet.",
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
      emptyTitle: "Lobsters is quiet right now. Check back in a few minutes.",
    },
    {
      id: "tags",
      label: "Tags",
      rows: [],
      content: <TagsPanel rows={tagList} />,
    },
  ];

  void triggerScanIfStale("lobsters", fetchedAt);

  return (
    <SignalSourcePage
      source="lobsters"
      sourceLabel="LOBSTERS"
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

// ─────────────────────────────────────────────────────────────────────────
// Tags tab — dense list. Each row carries the tag, story volume with a
// max-relative bar, and the top story link to commentsUrl.
// ─────────────────────────────────────────────────────────────────────────

function TagsPanel({ rows }: { rows: TagTally[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/30 px-4 py-10 text-center">
        <p className="font-mono text-sm text-text-tertiary">
          No active tags in the current window.
        </p>
      </div>
    );
  }

  const max = rows[0]?.count ?? 1;

  return (
    <div className="overflow-x-auto rounded-card border border-border-primary bg-bg-card">
      <table className="w-full text-xs">
        <thead className="text-left text-text-tertiary">
          <tr className="border-b border-border-primary bg-bg-muted/40">
            <th className="px-2 py-2 w-10 font-mono text-[10px] uppercase tracking-[0.12em]">
              #
            </th>
            <th className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.12em]">
              Tag
            </th>
            <th className="px-2 py-2 w-44 font-mono text-[10px] uppercase tracking-[0.12em]">
              Stories
            </th>
            <th className="px-2 py-2 hidden md:table-cell font-mono text-[10px] uppercase tracking-[0.12em]">
              Top story
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const top = r.topStory;
            const href = top ? top.commentsUrl || top.url : null;
            return (
              <tr
                key={r.tag}
                className="border-b border-border-primary/40 last:border-b-0 hover:bg-bg-muted/20"
              >
                <td className="px-2 py-2 font-mono text-text-tertiary tabular-nums">
                  {idx + 1}
                </td>
                <td className="px-2 py-2">
                  <span className="rounded-full border border-border-primary bg-bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary">
                    {r.tag}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-text-secondary w-8">
                      {r.count}
                    </span>
                    <div className="h-1.5 w-24 rounded-full bg-bg-muted overflow-hidden">
                      <div
                        className="h-full bg-brand"
                        style={{
                          width: `${Math.max(4, (r.count / max) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 hidden md:table-cell">
                  {top && href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-1 text-[11px] text-text-primary hover:underline"
                    >
                      {top.title}
                    </a>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

