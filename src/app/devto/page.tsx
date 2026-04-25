// /devto — dev.to Signal Terminal page.
//
// Tabs:
//   1. Repo Mentions (default) — tracked repos discussed in dev.to
//      articles in the last 7 days, ranked by mention volume.
//   2. Trending Articles — top dev.to articles by trendingScore
//      regardless of whether they link a tracked repo.
//   3. Tutorials — same shape as Trending Articles but filtered to
//      articles tagged tutorial / beginners / learn / guide / howto / series.
//
// No bubble map. No "scan now" button. Fresh data signal is the small
// LIVE/STALE pill in the header. Server-side auto-rescrape recovers a
// stale source quietly.

import {
  devtoFetchedAt,
  getAllDevtoMentions,
  getDevtoFile,
} from "@/lib/devto";
import { getDevtoTrendingFile } from "@/lib/devto-trending";
import {
  SignalSourcePage,
  type SignalTabSpec,
} from "@/components/signal/SignalSourcePage";
import type { SignalRow } from "@/components/signal/SignalTable";
import type { SignalMetricCardProps } from "@/components/signal/SignalMetricCard";
import { classifyFreshness } from "@/lib/news/freshness";
import { triggerScanIfStale } from "@/lib/news/auto-rescrape";
import Link from "next/link";

export const dynamic = "force-dynamic";

const SUBTITLE =
  "Developer articles ranked by attention, repo links, tutorials, and topic relevance.";

const TUTORIAL_TAGS = new Set([
  "tutorial",
  "beginners",
  "learn",
  "guide",
  "howto",
  "series",
]);

function articleIsTutorial(tags: string[] | undefined): boolean {
  if (!tags) return false;
  for (const t of tags) {
    if (TUTORIAL_TAGS.has(t.toLowerCase())) return true;
  }
  return false;
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

export default function DevtoPage() {
  void getDevtoFile();
  const fetchedAt = devtoFetchedAt;
  const verdict = classifyFreshness("devto", fetchedAt);

  const mentions = getAllDevtoMentions();
  const trendingFile = getDevtoTrendingFile();
  const articles = trendingFile.articles;

  // ─── Repo Mentions tab ─────────────────────────────────────────────────
  const mentionEntries = Object.entries(mentions)
    .filter(([, m]) => m.count7d > 0)
    .sort((a, b) => b[1].count7d - a[1].count7d)
    .slice(0, 50);
  const mentionScale = scaleScore(
    mentionEntries.map(([, m]) => m.reactionsSum7d),
  );

  const mentionRows: SignalRow[] = mentionEntries.map(([fullName, m]) => {
    const top = m.topArticle;
    const matchingArticle = top
      ? m.articles.find((a) => a.id === top.id) ?? null
      : null;
    const postedAtIso = matchingArticle?.publishedAt ?? null;
    const postedAtMs = postedAtIso ? Date.parse(postedAtIso) : 0;
    const topTitle = top?.title ?? "";
    return {
      id: `devto-mention:${fullName}`,
      title: fullName,
      href: `/repo/${fullName}`,
      external: false,
      attribution: top
        ? `${m.count7d}× · ${topTitle.slice(0, 80)}`
        : `${m.count7d}× / 7d`,
      engagement: m.reactionsSum7d,
      engagementLabel: "Reactions",
      comments: top?.comments,
      velocity: top
        ? classifyVelocity(top.comments ?? 0, postedAtMs || Date.now())
        : null,
      postedAt: postedAtIso,
      signalScore: mentionScale(m.reactionsSum7d),
      linkedRepo: null,
      badges: m.count7d >= 5 ? ["fire"] : undefined,
    };
  });

  // ─── Trending Articles tab ─────────────────────────────────────────────
  const topArticles = articles
    .slice()
    .sort((a, b) => b.trendingScore - a.trendingScore)
    .slice(0, 30);
  const articleScale = scaleScore(topArticles.map((a) => a.reactionsCount));

  const articleRows: SignalRow[] = topArticles.map((a) => {
    const postedAtMs = Date.parse(a.publishedAt);
    return {
      id: `devto-article:${a.id}`,
      title: a.title,
      href: a.url,
      external: true,
      attribution: `@${a.author.username}`,
      engagement: a.reactionsCount,
      engagementLabel: "Reactions",
      comments: a.commentsCount,
      velocity: classifyVelocity(
        a.commentsCount ?? 0,
        Number.isFinite(postedAtMs) ? postedAtMs : Date.now(),
      ),
      postedAt: a.publishedAt,
      signalScore: articleScale(a.reactionsCount),
      linkedRepo: a.linkedRepos?.[0]?.fullName ?? null,
      topic: a.tags?.[0] ?? null,
    };
  });

  // ─── Tutorials tab ─────────────────────────────────────────────────────
  const tutorials = articles
    .filter((a) => articleIsTutorial(a.tags))
    .slice()
    .sort((a, b) => b.trendingScore - a.trendingScore)
    .slice(0, 30);
  const tutorialScale = scaleScore(tutorials.map((a) => a.reactionsCount));

  const tutorialRows: SignalRow[] = tutorials.map((a) => {
    const postedAtMs = Date.parse(a.publishedAt);
    return {
      id: `devto-tutorial:${a.id}`,
      title: a.title,
      href: a.url,
      external: true,
      attribution: `@${a.author.username}`,
      engagement: a.reactionsCount,
      engagementLabel: "Reactions",
      comments: a.commentsCount,
      velocity: classifyVelocity(
        a.commentsCount ?? 0,
        Number.isFinite(postedAtMs) ? postedAtMs : Date.now(),
      ),
      postedAt: a.publishedAt,
      signalScore: tutorialScale(a.reactionsCount),
      linkedRepo: a.linkedRepos?.[0]?.fullName ?? null,
      topic: a.tags?.[0] ?? null,
    };
  });

  // ─── Metric strip ─────────────────────────────────────────────────────
  const now = Date.now();
  const within24h = (iso: string | null | undefined): boolean => {
    if (!iso) return false;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return false;
    return now - t < 24 * 3_600_000;
  };

  const last24hArticles = articles.filter((a) => within24h(a.publishedAt));
  const reactions24h = last24hArticles.reduce(
    (s, a) => s + (a.reactionsCount ?? 0),
    0,
  );
  const comments24h = last24hArticles.reduce(
    (s, a) => s + (a.commentsCount ?? 0),
    0,
  );
  const tutorialCount = articles.filter((a) => articleIsTutorial(a.tags)).length;

  // Top linked repos by mention count for header tile + right rail.
  const topRepos = Object.entries(mentions)
    .filter(([, m]) => m.count7d > 0)
    .sort((a, b) => b[1].count7d - a[1].count7d);
  const topRepoFullName = topRepos[0]?.[0] ?? null;
  const topRepoShort = topRepoFullName
    ? topRepoFullName.split("/")[1] ?? "—"
    : "—";

  const metrics: SignalMetricCardProps[] = [
    {
      label: "Trending Articles",
      value: articles.length,
      helper: `${trendingFile.windowDays}d window`,
      sparkTone: "brand",
    },
    {
      label: "Repo Mentions",
      value: Object.keys(mentions).length,
      helper:
        mentionEntries.length > 0
          ? `${mentionEntries.length} active`
          : "no mentions",
      sparkTone: "info",
    },
    {
      label: "Tutorials",
      value: tutorialCount,
      helper:
        tutorialCount > 0 ? "tutorial / guide / series" : "no tutorials",
      sparkTone: "up",
    },
    {
      label: "Reactions 24h",
      value: reactions24h.toLocaleString("en-US"),
      helper: `${last24hArticles.length} articles`,
      sparkTone: "warning",
    },
    {
      label: "Comments 24h",
      value: comments24h.toLocaleString("en-US"),
      helper: comments24h > 0 ? "thread velocity" : "quiet",
      sparkTone: "info",
    },
    {
      label: "Top repo",
      value: topRepoShort,
      helper: topRepos[0]
        ? `${topRepos[0][1].count7d}× / 7d`
        : null,
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
      emptyTitle: "No tracked repos mentioned on dev.to in the last 7 days.",
      emptySubtitle:
        "Pipeline is healthy; the watch list just hasn't lit up yet.",
    },
    {
      id: "articles",
      label: "Trending Articles",
      rows: articleRows,
      columns: [
        "rank",
        "title",
        "linkedRepo",
        "engagement",
        "velocity",
        "age",
        "signal",
      ],
      emptyTitle: "dev.to is quiet right now. Check back in a few minutes.",
    },
    {
      id: "tutorials",
      label: "Tutorials",
      rows: tutorialRows,
      columns: [
        "rank",
        "title",
        "linkedRepo",
        "engagement",
        "velocity",
        "age",
        "signal",
      ],
      emptyTitle: "No tutorials in the current window.",
    },
  ];

  void triggerScanIfStale("devto", fetchedAt);

  return (
    <SignalSourcePage
      source="devto"
      sourceLabel="DEV.TO"
      mode="ARTICLES"
      subtitle={SUBTITLE}
      fetchedAt={fetchedAt}
      freshnessStatus={verdict.status}
      ageLabel={verdict.ageLabel}
      metrics={metrics}
      tabs={tabs}
      rightRail={<TopLinkedReposPanel rows={topRepos.slice(0, 5)} />}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Right rail — Top Linked Repos panel.
// ─────────────────────────────────────────────────────────────────────────

function TopLinkedReposPanel({
  rows,
}: {
  rows: Array<[string, { count7d: number; reactionsSum7d: number }]>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/30 px-3 py-6 text-center">
        <p className="font-mono text-[11px] text-text-tertiary">
          No linked repos in window.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border-primary bg-bg-card">
      <div className="border-b border-border-primary px-3 py-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
          Top Linked Repos
        </h2>
      </div>
      <ul className="divide-y divide-border-primary/40">
        {rows.map(([fullName, m], idx) => (
          <li key={fullName} className="px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={`/repo/${fullName}`}
                className="truncate font-mono text-[11px] text-functional hover:underline"
                title={fullName}
              >
                <span className="text-text-tertiary tabular-nums mr-1">
                  {idx + 1}.
                </span>
                {fullName}
              </Link>
              <span className="font-mono tabular-nums text-[11px] text-text-secondary">
                {m.count7d}×
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-text-tertiary tabular-nums">
              {m.reactionsSum7d.toLocaleString("en-US")} reactions
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
