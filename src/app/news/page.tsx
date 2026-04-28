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
  refreshHackernewsMentionsFromStore,
} from "@/lib/hackernews";
import {
  getBlueskyTopPosts,
  getBlueskyTrendingFile,
  refreshBlueskyTrendingFromStore,
} from "@/lib/bluesky-trending";
import {
  getBlueskyLeaderboard,
  refreshBlueskyMentionsFromStore,
} from "@/lib/bluesky";
import {
  getDevtoFile,
  getDevtoLeaderboard,
  refreshDevtoMentionsFromStore,
} from "@/lib/devto";
import { refreshDevtoTrendingFromStore } from "@/lib/devto-trending";
import {
  getRecentLaunches,
  getPhFile,
  refreshProducthuntLaunchesFromStore,
} from "@/lib/producthunt";
import {
  getLobstersTopStories,
  getLobstersTrendingFile,
  refreshLobstersTrendingFromStore,
} from "@/lib/lobsters-trending";
import {
  getLobstersLeaderboard,
  refreshLobstersMentionsFromStore,
} from "@/lib/lobsters";
import { TerminalBar, MonoLabel, BarcodeTicker, BracketMarkers } from "@/components/v2";

import { HackerNewsTabBody } from "./_tabs/hackernews";
import { BlueskyTabBody } from "./_tabs/bluesky";
import { DevtoTabBody } from "./_tabs/devto";
import { ProductHuntTabBody } from "./_tabs/producthunt";
import { LobstersTabBody } from "./_tabs/lobsters";

import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import {
  buildHackerNewsHeader,
  buildBlueskyHeader,
  buildDevtoHeader,
  buildProductHuntHeader,
  buildLobstersHeader,
} from "@/components/news/newsTopMetrics";

export const dynamic = "force-dynamic";

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

        {/* Per-tab V3 header — 3 metric chart cards + 3 hero feature
            cards. Accent flips with the active source so the page chrome
            visually matches whichever firehose you're reading. Sits
            between the tab strip and the long list so the morning-glance
            answer is always above the fold. */}
        {activeTab === "hackernews"
          ? renderTabHeader(
              "hackernews",
              buildHackerNewsHeader(hnFile, hnStoriesTop),
              SOURCE_META.hackernews,
            )
          : null}
        {activeTab === "bluesky"
          ? renderTabHeader(
              "bluesky",
              buildBlueskyHeader(bskyFile, bskyPostsTop),
              SOURCE_META.bluesky,
            )
          : null}
        {activeTab === "devto"
          ? renderTabHeader(
              "devto",
              buildDevtoHeader(devtoFile, devtoLeaderboard),
              SOURCE_META.devto,
            )
          : null}
        {activeTab === "producthunt"
          ? renderTabHeader(
              "producthunt",
              buildProductHuntHeader(phFile, phLaunchesTop),
              SOURCE_META.producthunt,
            )
          : null}
        {activeTab === "lobsters"
          ? renderTabHeader(
              "lobsters",
              buildLobstersHeader(lobstersFile, lobstersStoriesTop),
              SOURCE_META.lobsters,
            )
          : null}

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
// Tab header renderer — wraps NewsTopHeaderV3 with eyebrow + accent so each
// of the 5 tabs gets the same shape with source-specific colouring.
// ---------------------------------------------------------------------------

function renderTabHeader(
  tabId: TabId,
  data: ReturnType<typeof buildHackerNewsHeader>,
  source: { code: string; color: string; label: string },
) {
  // Pull the headline number out of the snapshot card for the
  // breadcrumb meta — keeps the chrome readable above the fold.
  const snapshot = data.cards[0];
  const itemCount =
    snapshot.variant === "snapshot" ? snapshot.value : "0";
  return (
    <div className="my-4">
      <NewsTopHeaderV3
        routeTitle={`${source.label} · TRENDING`}
        liveLabel="LIVE · 24H"
        eyebrow={`// ${source.label} · LIVE FIREHOSE`}
        meta={[
          { label: "TRACKED", value: itemCount },
          { label: "TAB", value: tabId.toUpperCase() },
        ]}
        cards={data.cards}
        topStories={data.topStories}
        accent={source.color}
        caption={[
          "// LAYOUT compact-v1",
          "· 3-COL · 320 / 1FR / 1FR",
          "· DATA UNCHANGED",
        ]}
      />
    </div>
  );
}
