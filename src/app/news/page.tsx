// /news — unified News Terminal (v2-styled).
//
// Consolidates HackerNews + Bluesky + dev.to + ProductHunt + Lobsters into
// a single tabbed overview page. Each tab renders a 10-row compact list of
// the source's top items and links out to the dedicated deep view when one
// exists.
//
// Server component, URL-driven tab state (?tab=...), no client JS required.

import Link from "next/link";
import {
  getHnTopStories,
  getHnTrendingFile,
  refreshHackernewsTrendingFromStore,
} from "@/lib/hackernews-trending";
import {
  getHnLeaderboard,
  hnItemHref,
  refreshHackernewsMentionsFromStore,
  type HnStory,
} from "@/lib/hackernews";
import {
  getBlueskyTopPosts,
  getBlueskyTrendingFile,
  refreshBlueskyTrendingFromStore,
} from "@/lib/bluesky-trending";
import {
  blueskyCold,
  bskyPostHref,
  getBlueskyLeaderboard,
  refreshBlueskyMentionsFromStore,
  type BskyPost,
} from "@/lib/bluesky";
import {
  devtoArticleHref,
  getDevtoFile,
  getDevtoLeaderboard,
  devtoCold,
  refreshDevtoMentionsFromStore,
  type DevtoTopArticleRef,
} from "@/lib/devto";
import { refreshDevtoTrendingFromStore } from "@/lib/devto-trending";
import {
  getRecentLaunches,
  getPhFile,
  refreshProducthuntLaunchesFromStore,
  type Launch,
} from "@/lib/producthunt";
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
import { LaunchLinkIcons } from "@/components/producthunt/LaunchLinkIcons";
import { TerminalBar, MonoLabel, BarcodeTicker, BracketMarkers } from "@/components/v2";

export const dynamic = "force-dynamic";

const HN_ORANGE = "#ff6600";
const BSKY_BLUE = "#0085FF";
const PH_RED = "#DA552F";

const SOURCE_META: Record<TabId, { code: string; color: string; label: string }> = {
  hackernews: { code: "HN", color: "rgba(245, 110, 15, 0.85)", label: "HACKERNEWS" },
  bluesky:    { code: "BS", color: "rgba(58, 214, 197, 0.85)", label: "BLUESKY" },
  devto:      { code: "DV", color: "rgba(102, 153, 255, 0.85)", label: "DEV.TO" },
  producthunt:{ code: "PH", color: "rgba(218, 85, 47, 0.85)", label: "PRODUCTHUNT" },
  lobsters:   { code: "LZ", color: "rgba(172, 19, 13, 0.85)", label: "LOBSTERS" },
};

const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","to","of","and","in","on","at","by","for","with","as","from",
  "that","this","it","its","have","has","had","do","does","did","will","would","could","should","may","might","can","shall",
  "you","your","we","our","us","i","my","me","he","she","they","them","his","her","their","what","which","who","when","where",
  "why","how","all","any","both","each","few","more","most","other","some","such","no","nor","not","only","own","same","so","than",
  "too","very","just","now","then","here","there","up","out","if","about","into","through","during","before","after","above","below",
  "between","under","again","further","once","also","but","or","yet","because","until","while","although","though","unless","since",
  "ago","new","using","use","used","show","shows","showing","via","based","build","building","built","make","making","made",
  "get","gets","getting","one","two","three","first","last","way","ways","time","times","day","days","year","years","work","works",
  "working","add","adds","added","adding","fix","fixes","fixed","support","supports","supported","release","releases","released",
  "version","update","updates","updated","github","com","http","https","www","org","io","dev","app","web","site","page","repo",
  "open","source","code","project","projects","tool","tools","api","cli","ui","ux","ai","llm","ml","gpu","cpu","ram",
  "javascript","typescript","python","rust","go","java","cpp","cplusplus","html","css","sql","json","xml","yaml","docker","kubernetes",
  "react","vue","angular","svelte","nextjs","nuxt","node","nodejs","deno","bun","npm","yarn","pnpm","git","github",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function computeTopTopics(texts: string[], n = 6): Array<{ topic: string; count: number; color: string }> {
  const freq = new Map<string, number>();
  for (const text of texts) {
    for (const word of tokenize(text)) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }
  const sorted = Array.from(freq.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);

  const TOPIC_COLORS = [
    "var(--v2-acc)", "#F59E0B", "#3AD6C5", "#F472B6", "#FBBF24", "#A78BFA", "#34D399", "#FB923C",
  ];
  return sorted.map(([topic, count], i) => ({
    topic: topic.toUpperCase(),
    count,
    color: TOPIC_COLORS[i % TOPIC_COLORS.length],
  }));
}

type TabId = "hackernews" | "bluesky" | "devto" | "producthunt" | "lobsters";

const TAB_ORDER: TabId[] = [
  "hackernews",
  "bluesky",
  "devto",
  "producthunt",
  "lobsters",
];

const TAB_LABELS: Record<TabId, string> = {
  hackernews: "hackernews",
  bluesky: "bluesky",
  devto: "dev.to",
  producthunt: "producthunt",
  lobsters: "lobsters",
};

function isTabId(value: string | undefined): value is TabId {
  return (
    value === "hackernews" ||
    value === "bluesky" ||
    value === "devto" ||
    value === "producthunt" ||
    value === "lobsters"
  );
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "unknown";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatAgeHours(ageHours: number | null | undefined): string {
  if (ageHours === undefined || ageHours === null || !Number.isFinite(ageHours))
    return "—";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await Promise.all([
    refreshHackernewsTrendingFromStore(),
    refreshHackernewsMentionsFromStore(),
    refreshBlueskyTrendingFromStore(),
    refreshBlueskyMentionsFromStore(),
    refreshDevtoTrendingFromStore(),
    refreshDevtoMentionsFromStore(),
    refreshLobstersTrendingFromStore(),
    refreshLobstersMentionsFromStore(),
    refreshProducthuntLaunchesFromStore(),
  ]);
  const params = await searchParams;
  const activeTab: TabId = isTabId(params.tab) ? params.tab : "hackernews";

  const hnStoriesTop = getHnTopStories(10);
  const bskyPostsTop = getBlueskyTopPosts(10);
  const devtoLeaderboard = getDevtoLeaderboard();
  const phLaunchesTop = getRecentLaunches(7, 10);
  const lobstersStoriesTop = getLobstersTopStories(10);

  const tabCounts: Record<TabId, number> = {
    hackernews: hnStoriesTop.length,
    bluesky: bskyPostsTop.length,
    devto: Math.min(devtoLeaderboard.length, 10),
    producthunt: phLaunchesTop.length,
    lobsters: lobstersStoriesTop.length,
  };

  // --- Cross-source stats for unified hero ---
  const hnFile = getHnTrendingFile();
  const bskyFile = getBlueskyTrendingFile();
  const devtoFile = getDevtoFile();
  const phFile = getPhFile();
  const lobstersFile = getLobstersTrendingFile();

  const allHnStories = hnFile.stories ?? [];
  const allBskyPosts = bskyFile.posts ?? [];
  const allLobstersStories = lobstersFile.stories ?? [];
  const allPhLaunches = phFile.launches ?? [];

  const sourceVolumes = [
    {
      code: SOURCE_META.hackernews.code,
      label: SOURCE_META.hackernews.label,
      color: SOURCE_META.hackernews.color,
      itemCount: allHnStories.length,
      totalScore: allHnStories.reduce((s, x) => s + (x.score ?? 0), 0),
    },
    {
      code: SOURCE_META.bluesky.code,
      label: SOURCE_META.bluesky.label,
      color: SOURCE_META.bluesky.color,
      itemCount: allBskyPosts.length,
      totalScore: allBskyPosts.reduce((s, x) => s + (x.likeCount ?? 0), 0),
    },
    {
      code: SOURCE_META.devto.code,
      label: SOURCE_META.devto.label,
      color: SOURCE_META.devto.color,
      itemCount: devtoFile.scannedArticles ?? devtoLeaderboard.length,
      totalScore: devtoLeaderboard.reduce((s, x) => s + (x.reactionsSum7d ?? 0), 0),
    },
    {
      code: SOURCE_META.producthunt.code,
      label: SOURCE_META.producthunt.label,
      color: SOURCE_META.producthunt.color,
      itemCount: allPhLaunches.length,
      totalScore: allPhLaunches.reduce((s, x) => s + (x.votesCount ?? 0), 0),
    },
    {
      code: SOURCE_META.lobsters.code,
      label: SOURCE_META.lobsters.label,
      color: SOURCE_META.lobsters.color,
      itemCount: allLobstersStories.length,
      totalScore: allLobstersStories.reduce((s, x) => s + (x.score ?? 0), 0),
    },
  ];

  const totalItems = sourceVolumes.reduce((s, x) => s + x.itemCount, 0);
  const totalScore = sourceVolumes.reduce((s, x) => s + x.totalScore, 0);

  // Find top-scoring item across all sources
  let topItem: { title: string; score: number; sourceLabel: string } | null = null;
  for (const s of allHnStories) {
    if (!topItem || (s.score ?? 0) > topItem.score) topItem = { title: s.title, score: s.score ?? 0, sourceLabel: "HN" };
  }
  for (const p of allBskyPosts) {
    if (!topItem || (p.likeCount ?? 0) > topItem.score) topItem = { title: p.text.slice(0, 60), score: p.likeCount ?? 0, sourceLabel: "BS" };
  }
  for (const l of allPhLaunches) {
    if (!topItem || (l.votesCount ?? 0) > topItem.score) topItem = { title: l.name, score: l.votesCount ?? 0, sourceLabel: "PH" };
  }
  for (const s of allLobstersStories) {
    if (!topItem || (s.score ?? 0) > topItem.score) topItem = { title: s.title, score: s.score ?? 0, sourceLabel: "LZ" };
  }

  // Topics from all titles / texts
  const allTexts: string[] = [];
  allHnStories.forEach((s) => allTexts.push(s.title));
  allBskyPosts.forEach((p) => allTexts.push(p.text));
  devtoLeaderboard.forEach((e) => {
    const art = devtoFile.mentions[e.fullName]?.topArticle;
    if (art) allTexts.push(art.title);
  });
  allPhLaunches.forEach((l) => allTexts.push(`${l.name} ${l.tagline || ""}`));
  allLobstersStories.forEach((s) => allTexts.push(s.title));

  const topTopics = computeTopTopics(allTexts, 6);

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {/* V2 terminal chrome */}
        <div className="v2-frame overflow-hidden">
          <TerminalBar
            label={`// NEWS · ${activeTab.toUpperCase()}`}
            status={`${Object.values(tabCounts).reduce((a, b) => a + b, 0)} SIGNALS · LIVE`}
            live
          />
          <BarcodeTicker count={120} height={12} seed={tabCounts[activeTab] || 33} />
        </div>

        {/* Header */}
        <header className="mb-6 border-b border-[var(--v2-line-std)] pb-6 space-y-3">
          <MonoLabel
            index="02"
            name="NEWS"
            hint="DEV MEDIA FIREHOSE"
            tone="muted"
          />
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              NEWS / DEV MEDIA FIREHOSE
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// where developers post, share, and launch"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-3xl">
            One terminal for the dev-media surface: HackerNews, Bluesky,
            dev.to, ProductHunt, and Lobsters in a single tabbed overview,
            scored by engagement. Each tab links out to its full dedicated
            view when one exists — this page is the morning glance.
          </p>
        </header>

        {/* Cross-source hero */}
        <NewsHero
          totalItems={totalItems}
          totalScore={totalScore}
          sourceVolumes={sourceVolumes}
          topTopics={topTopics}
          topItem={topItem}
        />

        {/* Tab strip */}
        <nav
          className="mb-6 flex items-center gap-1 flex-nowrap md:flex-wrap overflow-x-auto md:overflow-visible scrollbar-hide border-b border-[var(--v2-line-std)]"
        >
          {TAB_ORDER.map((tab) => {
            const isActive = tab === activeTab;
            const href = tab === "hackernews" ? "/news" : `/news?tab=${tab}`;
            const labelClass = isActive
              ? "text-[color:var(--v2-acc)]"
              : "text-text-tertiary hover:text-text-secondary";
            const borderClass = isActive
              ? "border-b-2 border-[color:var(--v2-acc)]"
              : "border-b-2 border-transparent";
            return (
              <Link
                key={tab}
                href={href}
                className={`inline-flex items-center gap-2 px-3 min-h-[40px] text-xs uppercase tracking-wider transition-colors shrink-0 ${labelClass} ${borderClass}`}
              >
                <span>{TAB_LABELS[tab]}</span>
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] tabular-nums bg-bg-secondary border border-border-primary text-text-tertiary">
                  {tabCounts[tab]}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Active tab body */}
        {activeTab === "hackernews" ? (
          <HackerNewsTabBody stories={hnStoriesTop} />
        ) : null}
        {activeTab === "bluesky" ? (
          <BlueskyTabBody posts={bskyPostsTop} />
        ) : null}
        {activeTab === "devto" ? <DevtoTabBody /> : null}
        {activeTab === "producthunt" ? (
          <ProductHuntTabBody launches={phLaunchesTop} />
        ) : null}
        {activeTab === "lobsters" ? (
          <LobstersTabBody stories={lobstersStoriesTop} />
        ) : null}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// News Hero — 3-card cross-source stats (Snapshot + Volume + Topics)
// ---------------------------------------------------------------------------

function NewsHero({
  totalItems,
  totalScore,
  sourceVolumes,
  topTopics,
  topItem,
}: {
  totalItems: number;
  totalScore: number;
  sourceVolumes: Array<{ code: string; label: string; color: string; itemCount: number; totalScore: number }>;
  topTopics: Array<{ topic: string; count: number; color: string }>;
  topItem: { title: string; score: number; sourceLabel: string } | null;
}) {
  const sourceMax = Math.max(...sourceVolumes.map((s) => s.itemCount), 1);
  const topicMax = Math.max(...topTopics.map((t) => t.count), 1);

  return (
    <section className="mb-6">
      <h1
        className="v2-mono mb-4 inline-flex items-center gap-2"
        style={{ color: "var(--v2-ink-100)", fontSize: 12, letterSpacing: "0.20em" }}
      >
        <span aria-hidden>{"// "}</span>
        MARKET SIGNALS · CROSS-SOURCE
        <span
          aria-hidden
          className="inline-block ml-1"
          style={{ width: 6, height: 6, background: "var(--v2-acc)", borderRadius: 1, boxShadow: "0 0 6px var(--v2-acc-glow)" }}
        />
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_1fr] gap-3">
        {/* SNAPSHOT — real totals */}
        <div className="v2-card v2-bracket relative overflow-hidden">
          <BracketMarkers>
            <TerminalBar
              label="// SNAPSHOT · NOW"
              status={`${totalItems} ITEMS`}
            />
            <div className="p-4 flex flex-col gap-3">
              <div>
                <span className="v2-mono" style={{ color: "var(--v2-ink-300)" }}>
                  ITEMS TRACKED
                </span>
                <div
                  className="mt-1 tabular-nums"
                  style={{
                    fontFamily: "var(--font-geist), Inter, sans-serif",
                    fontWeight: 300,
                    fontSize: "clamp(32px, 4.5vw, 48px)",
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                    color: "var(--v2-ink-000)",
                  }}
                >
                  {totalItems.toLocaleString("en-US")}
                </div>
                <div className="mt-1 v2-mono" style={{ color: "var(--v2-ink-400)" }}>
                  ACROSS {sourceVolumes.length} SOURCES
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1">
                <div
                  className="flex items-center justify-between v2-mono"
                  style={{ borderTop: "1px dashed var(--v2-line-200)", paddingTop: 4 }}
                >
                  <span style={{ color: "var(--v2-ink-300)" }}>TOTAL SCORE</span>
                  <span className="tabular-nums" style={{ color: "var(--v2-ink-100)" }}>
                    {totalScore.toLocaleString("en-US")}
                  </span>
                </div>
                {topItem ? (
                  <div
                    className="flex items-center justify-between v2-mono"
                    style={{ borderTop: "1px dashed var(--v2-line-200)", paddingTop: 4 }}
                  >
                    <span style={{ color: "var(--v2-ink-300)" }}>TOP SCORE</span>
                    <span className="tabular-nums" style={{ color: "var(--v2-acc)" }}>
                      {topItem.score.toLocaleString("en-US")}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </BracketMarkers>
        </div>

        {/* VOLUME PER SOURCE */}
        <div className="v2-card overflow-hidden">
          <TerminalBar
            label="// VOLUME · PER SOURCE"
            status={`${sourceVolumes.length} ${sourceVolumes.length === 1 ? "CHANNEL" : "CHANNELS"}`}
          />
          <div className="p-3 space-y-1.5">
            {sourceVolumes.map((s) => (
              <div key={s.code} className="flex items-center gap-2" style={{ minHeight: 22 }}>
                <span className="v2-mono shrink-0 w-12" style={{ color: "var(--v2-ink-200)", fontSize: 10 }}>
                  {s.code}
                </span>
                <div className="flex-1 relative" style={{ height: 14, background: "var(--v2-bg-100)", borderRadius: 1 }}>
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: `${(s.itemCount / sourceMax) * 100}%`,
                      background: s.color,
                      borderRadius: 1,
                      minWidth: s.itemCount > 0 ? 2 : 0,
                    }}
                  />
                </div>
                <span className="v2-mono tabular-nums shrink-0 w-14 text-right" style={{ color: "var(--v2-ink-100)", fontSize: 10 }}>
                  {s.itemCount}
                </span>
                <span className="v2-mono tabular-nums shrink-0 w-16 text-right" style={{ color: "var(--v2-ink-400)", fontSize: 9 }}>
                  {s.totalScore.toLocaleString("en-US")}
                </span>
              </div>
            ))}
            {sourceVolumes.length === 0 ? (
              <div className="v2-mono py-6 text-center" style={{ color: "var(--v2-ink-500)" }}>
                <span aria-hidden>{"// "}</span>
                NO SOURCES IN SNAPSHOT
              </div>
            ) : null}
          </div>
        </div>

        {/* TOP TOPICS */}
        <div className="v2-card overflow-hidden">
          <TerminalBar
            label="// TOPICS · MENTIONED MOST"
            status={`TOP ${topTopics.length}`}
          />
          <div className="p-3 space-y-1.5">
            {topTopics.map((t) => (
              <div key={t.topic} className="flex items-center gap-2" style={{ minHeight: 22 }}>
                <span
                  className="v2-mono shrink-0 w-32 truncate"
                  style={{ color: "var(--v2-ink-200)", fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}
                  title={t.topic}
                >
                  {t.topic}
                </span>
                <div className="flex-1 relative" style={{ height: 14, background: "var(--v2-bg-100)", borderRadius: 1 }}>
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: `${(t.count / topicMax) * 100}%`,
                      background: t.color,
                      borderRadius: 1,
                      minWidth: t.count > 0 ? 2 : 0,
                    }}
                  />
                </div>
                <span className="v2-mono tabular-nums shrink-0 w-10 text-right" style={{ color: "var(--v2-ink-100)", fontSize: 10 }}>
                  {t.count}
                </span>
              </div>
            ))}
            {topTopics.length === 0 ? (
              <div className="v2-mono py-6 text-center" style={{ color: "var(--v2-ink-500)" }}>
                <span aria-hidden>{"// "}</span>
                NO TOPICS YET
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces — v2-styled
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-md px-4 py-3"
      style={{
        background: "var(--v2-bg-050)",
        border: "1px solid var(--v2-line-200)",
      }}
    >
      <div
        className="v2-mono text-[10px] uppercase tracking-wider"
        style={{ color: "var(--v2-ink-400)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-xl font-bold truncate tabular-nums"
        style={{ color: "var(--v2-ink-100)" }}
      >
        {value}
      </div>
      {hint ? (
        <div
          className="mt-0.5 text-[11px] truncate"
          style={{ color: "var(--v2-ink-400)" }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ListShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="rounded-md overflow-hidden"
      style={{
        background: "var(--v2-bg-050)",
        border: "1px solid var(--v2-line-200)",
      }}
    >
      {children}
    </section>
  );
}

function FullViewLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-4 text-right">
      <Link
        href={href}
        className="text-xs text-[color:var(--v2-acc)] hover:underline uppercase tracking-wider"
      >
        {label} →
      </Link>
    </div>
  );
}

function ComingSoonNote({ message }: { message: string }) {
  return (
    <div
      className="mt-4 text-right text-xs"
      style={{ color: "var(--v2-ink-400)" }}
    >
      {`// ${message}`}
    </div>
  );
}

function ColdCard({
  title,
  body,
  accent,
}: {
  title: string;
  body: React.ReactNode;
  accent?: string;
}) {
  return (
    <section
      className="rounded-md p-8"
      style={{
        background: "var(--v2-bg-050)",
        border: "1px dashed var(--v2-line-300)",
      }}
    >
      <h2
        className="text-lg font-bold uppercase tracking-wider"
        style={{ color: accent || "var(--v2-sig-green)" }}
      >
        {title}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">{body}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// HackerNews tab
// ---------------------------------------------------------------------------

function HackerNewsTabBody({ stories }: { stories: HnStory[] }) {
  const trendingFile = getHnTrendingFile();
  const allStories = trendingFile.stories;
  const frontPageCount = allStories.filter((s) => s.everHitFrontPage).length;
  const reposLinked = getHnLeaderboard().length;
  const cold = allStories.length === 0;

  if (cold) {
    return (
      <ColdCard
        title="// hackernews cold"
        body={
          <>
            The Hacker News scraper hasn&apos;t run yet. Run{" "}
            <code className="text-text-primary">npm run scrape:hn</code>{" "}
            locally to populate{" "}
            <code className="text-text-primary">
              data/hackernews-trending.json
            </code>
            , then refresh.
          </>
        }
      />
    );
  }

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(trendingFile.fetchedAt)}
          hint="hackernews"
        />
        <StatTile
          label="STORIES TRACKED"
          value={allStories.length.toLocaleString("en-US")}
          hint={`${trendingFile.windowHours}h window`}
        />
        <StatTile
          label="FRONT PAGE"
          value={frontPageCount.toLocaleString("en-US")}
          hint="ever hit top 30"
        />
        <StatTile
          label="REPOS LINKED"
          value={reposLinked.toLocaleString("en-US")}
          hint="github mentions 7d"
        />
      </section>

      <ListShell>
        <div className="hidden sm:grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b text-[10px] uppercase tracking-wider"
          style={{ borderColor: "var(--v2-line-100)", color: "var(--v2-ink-400)" }}
        >
          <div>#</div>
          <div>TITLE</div>
          <div className="text-right">FP</div>
          <div className="text-right">SCORE</div>
          <div className="text-right">CMTS</div>
          <div className="text-right">AGE</div>
        </div>
        <ul className="divide-y" style={{ borderColor: "var(--v2-line-100)" }}>
          {stories.map((s, i) => {
            const isHigh = s.score >= 100;
            return (
              <li
                key={s.id}
                className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 min-h-[44px] sm:h-10 py-2 sm:py-0 hover:bg-bg-card-hover transition-colors"
              >
                <div style={{ color: "var(--v2-ink-400)" }} className="text-xs tabular-nums">
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <a
                    href={hnItemHref(s.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-text-primary hover:text-[color:var(--v2-acc)] truncate block"
                    title={s.title}
                  >
                    {s.title}
                  </a>
                  <div className="sm:hidden mt-0.5 flex items-center gap-2 text-[10px] tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                    <span>{s.descendants.toLocaleString("en-US")} cmts</span>
                    <span>·</span>
                    <span>{formatAgeHours(s.ageHours)}</span>
                  </div>
                </div>
                <div className="hidden sm:block text-right">
                  {s.everHitFrontPage ? (
                    <span
                      className="inline-flex items-center justify-center text-[8px] font-bold w-3.5 h-3.5 rounded-sm text-white"
                      style={{ backgroundColor: HN_ORANGE }}
                      title="Hit the HN front page"
                    >
                      Y
                    </span>
                  ) : (
                    <span className="text-text-tertiary text-[10px]">—</span>
                  )}
                </div>
                <div
                  className="text-right text-xs tabular-nums"
                  style={isHigh ? { color: HN_ORANGE } : undefined}
                >
                  {s.score.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums text-text-secondary">
                  {s.descendants.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                  {formatAgeHours(s.ageHours)}
                </div>
              </li>
            );
          })}
        </ul>
      </ListShell>

      <FullViewLink href="/hackernews/trending" label="View full" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Bluesky tab
// ---------------------------------------------------------------------------

function BlueskyTabBody({ posts }: { posts: BskyPost[] }) {
  const trendingFile = getBlueskyTrendingFile();
  const reposLinked = getBlueskyLeaderboard().length;
  const familyCount =
    trendingFile.queryFamilies?.length ?? trendingFile.keywords.length;
  const queryCount = trendingFile.queries?.length ?? trendingFile.keywords.length;
  const cold = blueskyCold || trendingFile.posts.length === 0;

  if (cold) {
    return (
      <ColdCard
        title="// bluesky cold"
        body={
          <>
            No Bluesky data yet — run{" "}
            <code className="text-text-primary">npm run scrape:bsky</code>{" "}
            locally (with{" "}
            <code className="text-text-primary">BLUESKY_HANDLE</code> +{" "}
            <code className="text-text-primary">BLUESKY_APP_PASSWORD</code>{" "}
            in env) to populate{" "}
            <code className="text-text-primary">
              data/bluesky-trending.json
            </code>
            .
          </>
        }
        accent={BSKY_BLUE}
      />
    );
  }

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(trendingFile.fetchedAt)}
          hint="bluesky"
        />
        <StatTile
          label="POSTS TRACKED"
          value={trendingFile.posts.length.toLocaleString("en-US")}
          hint={`${queryCount} queries / ${familyCount} families`}
        />
        <StatTile
          label="REPOS LINKED"
          value={reposLinked.toLocaleString("en-US")}
          hint="github mentions 7d"
        />
        <StatTile
          label="TOPIC FAMILIES"
          value={familyCount.toLocaleString("en-US")}
          hint={trendingFile.keywords.slice(0, 3).join(" · ")}
        />
      </section>

      <ListShell>
        <div className="hidden sm:grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b text-[10px] uppercase tracking-wider"
          style={{ borderColor: "var(--v2-line-100)", color: "var(--v2-ink-400)" }}
        >
          <div>#</div>
          <div>POST · AUTHOR</div>
          <div className="text-right">♥</div>
          <div className="text-right">⟲</div>
          <div className="text-right">CMTS</div>
          <div className="text-right">AGE</div>
        </div>
        <ul className="divide-y" style={{ borderColor: "var(--v2-line-100)" }}>
          {posts.map((p, i) => {
            const snippet = truncate(p.text, 80);
            const isHigh = p.likeCount >= 50 || p.repostCount >= 5;
            return (
              <li
                key={p.uri}
                className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 min-h-[44px] sm:h-10 py-2 sm:py-0 hover:bg-bg-card-hover transition-colors"
              >
                <div style={{ color: "var(--v2-ink-400)" }} className="text-xs tabular-nums">
                  {i + 1}
                </div>
                <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-y-0.5 sm:gap-x-2">
                  <a
                    href={bskyPostHref(p.uri, p.author.handle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-text-primary hover:text-[color:var(--v2-acc)] truncate"
                    title={p.text}
                  >
                    {snippet}
                  </a>
                  <span
                    className="shrink-0 text-[10px] truncate"
                    style={{ color: "var(--v2-ink-400)" }}
                    title={
                      p.author.displayName
                        ? `${p.author.displayName} (@${p.author.handle})`
                        : `@${p.author.handle}`
                    }
                  >
                    @{p.author.handle}
                    <span className="sm:hidden">{` · ${p.repostCount.toLocaleString("en-US")} ⟲ · ${p.replyCount.toLocaleString("en-US")} cmts · ${formatAgeHours(p.ageHours)}`}</span>
                  </span>
                </div>
                <div
                  className="text-right text-xs tabular-nums"
                  style={isHigh ? { color: BSKY_BLUE } : undefined}
                >
                  {p.likeCount.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums text-text-secondary">
                  {p.repostCount.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums text-text-secondary">
                  {p.replyCount.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                  {formatAgeHours(p.ageHours)}
                </div>
              </li>
            );
          })}
        </ul>
      </ListShell>

      <FullViewLink href="/bluesky/trending" label="View full" />
    </>
  );
}

// ---------------------------------------------------------------------------
// dev.to tab
// ---------------------------------------------------------------------------

function DevtoTabBody() {
  const file = getDevtoFile();
  const leaderboard = getDevtoLeaderboard();
  const sliceCount = file.discoverySlices?.length ?? 0;
  const tagCount = file.priorityTags?.length ?? 0;

  const rows: { repo: string; article: DevtoTopArticleRef }[] = [];
  for (const entry of leaderboard) {
    const mention = file.mentions[entry.fullName];
    if (mention?.topArticle) {
      rows.push({ repo: entry.fullName, article: mention.topArticle });
    }
    if (rows.length >= 10) break;
  }

  const articlesScanned = file.scannedArticles;
  const reposLinked = leaderboard.length;

  if (devtoCold) {
    return (
      <ColdCard
        title="// dev.to cold"
        body={
          <>
            No dev.to data yet. Run{" "}
            <code className="text-text-primary">npm run scrape:devto</code>{" "}
            locally to populate{" "}
            <code className="text-text-primary">data/devto-mentions.json</code>
            .
          </>
        }
      />
    );
  }

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(file.fetchedAt)}
          hint="dev.to"
        />
        <StatTile
          label="ARTICLES SCANNED"
          value={articlesScanned.toLocaleString("en-US")}
          hint={`${file.windowDays}d window`}
        />
        <StatTile
          label="REPOS LINKED"
          value={reposLinked.toLocaleString("en-US")}
          hint="github mentions 7d"
        />
        <StatTile
          label="DISCOVERY"
          value={sliceCount.toLocaleString("en-US")}
          hint={
            sliceCount > 0
              ? `${tagCount} tags + rising/fresh`
              : "registry-driven slices"
          }
        />
      </section>

      <ListShell>
        <div className="hidden sm:grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b text-[10px] uppercase tracking-wider"
          style={{ borderColor: "var(--v2-line-100)", color: "var(--v2-ink-400)" }}
        >
          <div>#</div>
          <div>TITLE · AUTHOR</div>
          <div className="text-right">REACT</div>
          <div className="text-right">CMTS</div>
          <div className="text-right">READ</div>
          <div className="text-right">AGE</div>
        </div>
        <ul className="divide-y" style={{ borderColor: "var(--v2-line-100)" }}>
          {rows.map(({ repo, article }, i) => (
            <li
              key={`${repo}-${article.id}`}
              className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 min-h-[44px] sm:h-10 py-2 sm:py-0 hover:bg-bg-card-hover transition-colors"
            >
              <div style={{ color: "var(--v2-ink-400)" }} className="text-xs tabular-nums">
                {i + 1}
              </div>
              <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-y-0.5 sm:gap-x-2">
                <a
                  href={devtoArticleHref(article.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-text-primary hover:text-[color:var(--v2-acc)] truncate"
                  title={article.title}
                >
                  {article.title}
                </a>
                <span
                  className="shrink-0 text-[10px] truncate"
                  style={{ color: "var(--v2-ink-400)" }}
                  title={article.author}
                >
                  @{article.author}
                  <span className="sm:hidden">{` · ${article.comments.toLocaleString("en-US")} cmts · ${article.readingTime}m · ${formatAgeHours(article.hoursSincePosted)}`}</span>
                </span>
              </div>
              <div className="text-right text-xs tabular-nums text-text-secondary">
                {article.reactions.toLocaleString("en-US")}
              </div>
              <div className="hidden sm:block text-right text-xs tabular-nums text-text-secondary">
                {article.comments.toLocaleString("en-US")}
              </div>
              <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                {`${article.readingTime}m`}
              </div>
              <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                {formatAgeHours(article.hoursSincePosted)}
              </div>
            </li>
          ))}
        </ul>
      </ListShell>

      <ComingSoonNote message="dedicated /devto page coming soon" />
    </>
  );
}

// ---------------------------------------------------------------------------
// ProductHunt tab
// ---------------------------------------------------------------------------

function ProductHuntTabBody({ launches }: { launches: Launch[] }) {
  const file = getPhFile();
  const allLaunches = file.launches ?? [];
  const cold = !file.lastFetchedAt || !Array.isArray(file.launches);

  if (cold) {
    return (
      <ColdCard
        title="// producthunt cold"
        body={
          <>
            No ProductHunt launches loaded. Run{" "}
            <code className="text-text-primary">npm run scrape:ph</code>{" "}
            locally to populate{" "}
            <code className="text-text-primary">
              data/producthunt-launches.json
            </code>
            .
          </>
        }
        accent={PH_RED}
      />
    );
  }

  const totalVotes = allLaunches.reduce((acc, l) => acc + (l.votesCount ?? 0), 0);
  const linkedRepos = allLaunches.filter((l) => l.linkedRepo).length;

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(file.lastFetchedAt)}
          hint="producthunt"
        />
        <StatTile
          label="LAUNCHES TRACKED"
          value={allLaunches.length.toLocaleString("en-US")}
          hint={`${file.windowDays}d window`}
        />
        <StatTile
          label="TOTAL VOTES"
          value={totalVotes.toLocaleString("en-US")}
          hint="across all launches"
        />
        <StatTile
          label="REPOS LINKED"
          value={linkedRepos.toLocaleString("en-US")}
          hint="github links resolved"
        />
      </section>

      {launches.length > 0 ? (
        <ListShell>
          <div className="hidden sm:grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b text-[10px] uppercase tracking-wider"
            style={{ borderColor: "var(--v2-line-100)", color: "var(--v2-ink-400)" }}
          >
            <div>#</div>
            <div>NAME · TAGLINE</div>
            <div className="text-right">VOTES</div>
            <div className="text-right">CMTS</div>
            <div className="text-right">DAYS</div>
            <div className="text-right">DATE</div>
          </div>
          <ul className="divide-y" style={{ borderColor: "var(--v2-line-100)" }}>
            {launches.map((l, i) => {
              const isHigh = l.votesCount >= 200;
              const t = new Date(l.createdAt).getTime();
              const launchDate = Number.isFinite(t)
                ? new Date(l.createdAt).toISOString().slice(5, 10)
                : "—";
              return (
                <li
                  key={l.id}
                  className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 min-h-[44px] sm:h-10 py-2 sm:py-0 hover:bg-bg-card-hover transition-colors"
                >
                  <div style={{ color: "var(--v2-ink-400)" }} className="text-xs tabular-nums">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-y-0.5 sm:gap-x-2">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-text-primary hover:text-[color:var(--v2-acc)] truncate"
                      title={`${l.name} — ${l.tagline}`}
                    >
                      <span className="font-semibold">{l.name}</span>
                      {l.tagline ? (
                        <span className="text-text-tertiary"> · {l.tagline}</span>
                      ) : null}
                    </a>
                    <LaunchLinkIcons launch={l} />
                    <span className="sm:hidden text-[10px] tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                      {`${l.commentsCount.toLocaleString("en-US")} cmts · ${l.daysSinceLaunch}d · ${launchDate}`}
                    </span>
                  </div>
                  <div
                    className="text-right text-xs tabular-nums"
                    style={isHigh ? { color: PH_RED } : undefined}
                  >
                    {l.votesCount.toLocaleString("en-US")}
                  </div>
                  <div className="hidden sm:block text-right text-xs tabular-nums text-text-secondary">
                    {l.commentsCount.toLocaleString("en-US")}
                  </div>
                  <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                    {`${l.daysSinceLaunch}d`}
                  </div>
                  <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                    {launchDate}
                  </div>
                </li>
              );
            })}
          </ul>
        </ListShell>
      ) : (
        <ColdCard
          title="// no producthunt matches"
          body={
            <>
              The ProductHunt scrape completed, but no launches matched the
              current AI-adjacent 7-day filter.
            </>
          }
          accent={PH_RED}
        />
      )}

      <FullViewLink href="/producthunt" label="View full" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Lobsters tab
// ---------------------------------------------------------------------------

function LobstersTabBody({ stories }: { stories: LobstersStory[] }) {
  const file = getLobstersTrendingFile();
  const allStories = file.stories ?? [];
  const linkedStories = allStories.filter(
    (story) => (story.linkedRepos?.length ?? 0) > 0,
  ).length;
  const reposLinked = getLobstersLeaderboard().length;
  const cold = allStories.length === 0;

  if (cold) {
    return (
      <ColdCard
        title="// lobsters cold"
        body={
          <>
            No Lobsters data yet. Run{" "}
            <code className="text-text-primary">npm run scrape:lobsters</code>{" "}
            locally to populate{" "}
            <code className="text-text-primary">
              data/lobsters-trending.json
            </code>
            .
          </>
        }
        accent="#ac130d"
      />
    );
  }

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(file.fetchedAt)}
          hint="lobsters"
        />
        <StatTile
          label="STORIES TRACKED"
          value={allStories.length.toLocaleString("en-US")}
          hint={`${file.windowHours}h window`}
        />
        <StatTile
          label="GITHUB STORIES"
          value={linkedStories.toLocaleString("en-US")}
          hint="tracked repo links"
        />
        <StatTile
          label="REPOS LINKED"
          value={reposLinked.toLocaleString("en-US")}
          hint="mentions 7d"
        />
      </section>

      <ListShell>
        <div className="hidden sm:grid grid-cols-[40px_1fr_60px_60px_80px] gap-3 items-center px-3 h-9 border-b text-[10px] uppercase tracking-wider"
          style={{ borderColor: "var(--v2-line-100)", color: "var(--v2-ink-400)" }}
        >
          <div>#</div>
          <div>TITLE</div>
          <div className="text-right">SCORE</div>
          <div className="text-right">CMTS</div>
          <div className="text-right">AGE</div>
        </div>
        <ul className="divide-y" style={{ borderColor: "var(--v2-line-100)" }}>
          {stories.map((s, i) => {
            const linkedRepo = s.linkedRepos?.[0]?.fullName;
            const href = s.commentsUrl || lobstersStoryHref(s.shortId);
            const isHigh = s.score >= 25;
            return (
              <li
                key={s.shortId}
                className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[40px_1fr_60px_60px_80px] gap-3 items-center px-3 min-h-[44px] sm:h-10 py-2 sm:py-0 hover:bg-bg-card-hover transition-colors"
              >
                <div style={{ color: "var(--v2-ink-400)" }} className="text-xs tabular-nums">
                  {i + 1}
                </div>
                <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-y-0.5 sm:gap-x-2">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-text-primary hover:text-[color:var(--v2-acc)] truncate"
                    title={s.title}
                  >
                    {s.title}
                  </a>
                  {linkedRepo ? (
                    <Link
                      href={repoFullNameToHref(linkedRepo)}
                      className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-border-primary text-text-tertiary hover:text-[color:var(--v2-acc)] hover:border-[color:var(--v2-acc)]/50 transition-colors"
                      title={`Linked repo: ${linkedRepo}`}
                    >
                      {linkedRepo}
                    </Link>
                  ) : null}
                  <span className="sm:hidden text-[10px] tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                    {`${s.commentCount.toLocaleString("en-US")} cmts · ${formatAgeHours(s.ageHours)}`}
                  </span>
                </div>
                <div
                  className="text-right text-xs tabular-nums"
                  style={isHigh ? { color: "#ac130d" } : undefined}
                >
                  {s.score.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums text-text-secondary">
                  {s.commentCount.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                  {formatAgeHours(s.ageHours)}
                </div>
              </li>
            );
          })}
        </ul>
      </ListShell>

      <FullViewLink href="/lobsters" label="View full" />
    </>
  );
}
