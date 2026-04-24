// /demo — the WOW showcase. Premium, loud, story-driven.
//
// Every card tells a story in one glance:
//   - HERO idea gets a glowing brand halo, 8xl conviction gauge, real
//     target-repo favicons, animated "live now" pulse, 4 reaction
//     tiles each with its own sparkline, reactor avatar stack, and
//     a narrative eyebrow ("HOT · 8 building now").
//   - Leaderboard rows get rank medals, tier-colored conviction rings,
//     velocity sparks, and trend ribbons ("↑ RISING FAST").
//   - Prediction cards get a proper SVG sparkline with shaded P10–P90
//     band AND a 180° gauge-style confidence meter that reads like a
//     speedometer.
//
// Everything is pure CSS + inline SVG. Zero animation libraries. Motion
// comes from Tailwind `animate-pulse` + custom CSS keyframes declared
// inline.

import Link from "next/link";
import type { Metadata } from "next";
import type { JSX } from "react";
import {
  BarChart3,
  Bookmark,
  Clock,
  DollarSign,
  ExternalLink,
  Flame,
  Hammer,
  Lightbulb,
  LineChart,
  Play,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";

import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: `Demo — ideas + predictions · ${SITE_NAME}`,
  description:
    "Visual showcase for the Idea + Prediction layer. Dense, loud, signal-first.",
  alternates: { canonical: absoluteUrl("/demo") },
  robots: { index: false, follow: false },
};

export const dynamic = "force-static";

// ===========================================================================
// Mock data
// ===========================================================================

type ReactionKey = "build" | "use" | "buy" | "invest";

interface Reactor {
  handle: string;
  accent: string;
}

interface IdeaMock {
  id: string;
  authorHandle: string;
  authorAccent: string;
  rank: number;
  title: string;
  pitch: string;
  buildStatus: "exploring" | "scoping" | "building" | "shipped" | "abandoned";
  category: { label: string; accent: string };
  tags: string[];
  targetRepos: Array<{ fullName: string; stars: number }>;
  createdHoursAgo: number;
  reactions: Record<ReactionKey, number>;
  reactions24h: Record<ReactionKey, number>;
  reactionsPerDay: number[]; // last 7 days, for spark
  recentReactors: Reactor[];
  liveNow: number; // synthesized "N people reacting right now"
  streakDays: number;
  shippedRepoUrl?: string | null;
  callout?: string;
}

const IDEAS: IdeaMock[] = [
  {
    id: "mcpgithub",
    rank: 1,
    authorHandle: "starbuilder",
    authorAccent: "from-[#F56E0F] via-[#FBBF24] to-[#EF4444]",
    title: "One-liner MCP wrapper for any GitHub repo",
    pitch:
      "Scaffolds an MCP server from a repo in one command. Agents get list/search/get over the repo's docs + code, zero config. Every repo becomes agent-native overnight.",
    buildStatus: "building",
    category: { label: "Agent infra", accent: "text-[#8B5CF6]" },
    tags: ["mcp", "agents", "scaffolding"],
    targetRepos: [
      { fullName: "anthropics/claude-code", stars: 128_412 },
      { fullName: "modelcontextprotocol/servers", stars: 12_830 },
    ],
    createdHoursAgo: 96,
    reactions: { build: 67, use: 122, buy: 18, invest: 4 },
    reactions24h: { build: 8, use: 21, buy: 3, invest: 1 },
    reactionsPerDay: [12, 18, 14, 22, 28, 31, 33],
    recentReactors: [
      { handle: "mirko", accent: "from-[#3B82F6] to-[#8B5CF6]" },
      { handle: "dev", accent: "from-[#22C55E] to-[#F56E0F]" },
      { handle: "ana", accent: "from-[#EF4444] to-[#FBBF24]" },
      { handle: "ok", accent: "from-[#8B5CF6] to-[#22C55E]" },
    ],
    liveNow: 8,
    streakDays: 4,
    callout: "SIGNAL OF THE WEEK",
  },
  {
    id: "bounty",
    rank: 2,
    authorHandle: "founder",
    authorAccent: "from-[#22C55E] via-[#F56E0F] to-[#FBBF24]",
    title: "Pay-per-issue bounty board for OSS maintainers",
    pitch:
      "Submit an issue, set a bounty in USDC. Maintainer ships a fix, escrow releases. Cuts existing platform fees by half.",
    buildStatus: "scoping",
    category: { label: "Dev infra · fintech", accent: "text-[#22C55E]" },
    tags: ["bounty", "payments", "stripe-connect"],
    targetRepos: [],
    createdHoursAgo: 20,
    reactions: { build: 23, use: 8, buy: 41, invest: 19 },
    reactions24h: { build: 11, use: 3, buy: 18, invest: 8 },
    reactionsPerDay: [2, 4, 0, 6, 8, 42, 40],
    recentReactors: [
      { handle: "vc", accent: "from-[#F56E0F] to-[#EF4444]" },
      { handle: "ceo", accent: "from-[#8B5CF6] to-[#3B82F6]" },
      { handle: "m", accent: "from-[#22C55E] to-[#F56E0F]" },
    ],
    liveNow: 3,
    streakDays: 2,
  },
  {
    id: "compareforecast",
    rank: 3,
    authorHandle: "mirko",
    authorAccent: "from-[#3B82F6] via-[#8B5CF6] to-[#22C55E]",
    title: "Cross-repo compare with 30d forecast overlay",
    pitch:
      "Pick 2-4 repos, see stars + momentum + forecast bands on one chart. The shared x-axis makes \"who's decelerating\" obvious.",
    buildStatus: "scoping",
    category: { label: "Analytics", accent: "text-[#3B82F6]" },
    tags: ["charts", "compare", "forecasting"],
    targetRepos: [{ fullName: "vercel/next.js", stars: 128_412 }],
    createdHoursAgo: 28,
    reactions: { build: 14, use: 3, buy: 0, invest: 0 },
    reactions24h: { build: 4, use: 1, buy: 0, invest: 0 },
    reactionsPerDay: [0, 0, 3, 6, 4, 2, 5],
    recentReactors: [
      { handle: "dex", accent: "from-[#F56E0F] to-[#FBBF24]" },
    ],
    liveNow: 1,
    streakDays: 3,
  },
  {
    id: "rss",
    rank: 4,
    authorHandle: "shipper",
    authorAccent: "from-[#22C55E] via-[#3B82F6] to-[#22C55E]",
    title: "Trending-repo RSS with per-language filters",
    pitch:
      "Atom + RSS feeds of every breakout repo filtered by language. Drop-in for Feedly or any reader; no account needed.",
    buildStatus: "shipped",
    category: { label: "Distribution", accent: "text-[#FBBF24]" },
    tags: ["rss", "atom", "feeds"],
    targetRepos: [],
    createdHoursAgo: 336,
    reactions: { build: 31, use: 84, buy: 12, invest: 2 },
    reactions24h: { build: 2, use: 7, buy: 0, invest: 0 },
    reactionsPerDay: [18, 24, 22, 16, 14, 12, 9],
    recentReactors: [
      { handle: "er", accent: "from-[#22C55E] to-[#FBBF24]" },
      { handle: "jo", accent: "from-[#3B82F6] to-[#22C55E]" },
    ],
    liveNow: 0,
    streakDays: 14,
    shippedRepoUrl: "https://github.com/shipper/trending-rss",
    callout: "SHIPPED 14d AGO",
  },
  {
    id: "tgdigest",
    rank: 5,
    authorHandle: "newauthor",
    authorAccent: "from-[#F56E0F] via-[#EF4444] to-[#FBBF24]",
    title: "Paste any repo URL, get a Telegram daily-diff bot",
    pitch:
      "A one-line wrapper that turns any repo into a daily diff digest delivered to TG. For forkers who want breakfast news.",
    buildStatus: "exploring",
    category: { label: "Notifications", accent: "text-[#EF4444]" },
    tags: ["bot", "telegram", "digests"],
    targetRepos: [],
    createdHoursAgo: 6,
    reactions: { build: 19, use: 5, buy: 2, invest: 0 },
    reactions24h: { build: 19, use: 5, buy: 2, invest: 0 },
    reactionsPerDay: [0, 0, 0, 0, 0, 0, 26],
    recentReactors: [
      { handle: "l", accent: "from-[#F56E0F] to-[#FBBF24]" },
      { handle: "w", accent: "from-[#22C55E] to-[#8B5CF6]" },
    ],
    liveNow: 2,
    streakDays: 1,
    callout: "JUST LAUNCHED",
  },
];

// ===========================================================================
// Math
// ===========================================================================

const WEIGHTS: Record<ReactionKey, number> = {
  build: 3,
  use: 1,
  buy: 5,
  invest: 8,
};

function weightedScore(r: Record<ReactionKey, number>): number {
  return (
    r.build * WEIGHTS.build +
    r.use * WEIGHTS.use +
    r.buy * WEIGHTS.buy +
    r.invest * WEIGHTS.invest
  );
}

function conviction(idea: IdeaMock): number {
  const raw = weightedScore(idea.reactions);
  const decay = Math.exp(-idea.createdHoursAgo / 48);
  return Math.min(100, Math.round(Math.log1p(raw * decay) * 18));
}

function totalReactions(r: Record<ReactionKey, number>): number {
  return r.build + r.use + r.buy + r.invest;
}

function fmtStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

function fmtAge(h: number): string {
  if (h < 1) return "just now";
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "1d ago" : `${d}d ago`;
}

// ===========================================================================
// Prediction mock
// ===========================================================================

interface ForecastDemo {
  horizonDays: 7 | 30 | 90;
  currentStars: number;
  pointEstimate: number;
  lowP10: number;
  highP90: number;
  past: number[];
  confidence: number; // 0-100
  drivers: { label: string; detail: string; tone: "positive" | "negative" | "neutral" }[];
}

function buildForecast(
  horizonDays: 7 | 30 | 90,
  baseStars: number,
  dailyAvg: number,
  noiseAmp: number,
): ForecastDemo {
  const past: number[] = [];
  let s = baseStars - dailyAvg * 30;
  for (let i = 0; i < 30; i++) {
    s += dailyAvg + (Math.sin(i * 0.7) + Math.cos(i * 0.4)) * noiseAmp;
    past.push(Math.round(s));
  }
  const damp = Math.exp(-horizonDays / 60);
  const pointEstimate = Math.round(baseStars + dailyAvg * horizonDays * damp);
  const band = Math.round(1.28 * noiseAmp * Math.sqrt(horizonDays) * damp * 30);
  return {
    horizonDays,
    currentStars: baseStars,
    pointEstimate,
    lowP10: Math.max(baseStars, pointEstimate - band),
    highP90: pointEstimate + band,
    past,
    confidence: horizonDays === 7 ? 88 : horizonDays === 30 ? 64 : 38,
    drivers:
      horizonDays === 7
        ? [
            {
              label: "Accelerating",
              detail: "Recent daily growth is 22% above the 30-day average.",
              tone: "positive",
            },
            {
              label: "Steady cadence",
              detail: "Daily growth CV = 0.35. Narrow band.",
              tone: "positive",
            },
          ]
        : horizonDays === 30
          ? [
              {
                label: "Baseline trajectory",
                detail: "Projecting current pace forward, damped for horizon.",
                tone: "neutral",
              },
              {
                label: "Cross-signal active",
                detail: "Reddit + HN both firing; momentum confirmed.",
                tone: "positive",
              },
            ]
          : [
              {
                label: "High volatility",
                detail: "Long-horizon CV = 1.8; band widens fast.",
                tone: "neutral",
              },
              {
                label: "Release risk",
                detail: "No v1 shipped yet; adoption could plateau.",
                tone: "negative",
              },
            ],
  };
}

const FORECASTS: ForecastDemo[] = [
  buildForecast(7, 128_412, 180, 22),
  buildForecast(30, 128_412, 180, 22),
  buildForecast(90, 128_412, 180, 22),
];

// ===========================================================================
// Page
// ===========================================================================

export default function DemoPage() {
  const ranked = [...IDEAS].sort((a, b) => conviction(b) - conviction(a));
  const hero = ranked[0]!;
  const list = ranked.slice(1);
  const aggregateLive = IDEAS.reduce((acc, i) => acc + i.liveNow, 0);
  const aggregate24h = IDEAS.reduce(
    (acc, i) => acc + totalReactions(i.reactions24h),
    0,
  );

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono overflow-x-hidden">
      {/* Ambient animated backdrop gradient */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(1200px 500px at 30% -10%, rgba(245,110,15,0.18), transparent 60%), radial-gradient(900px 400px at 90% 20%, rgba(59,130,246,0.12), transparent 60%), radial-gradient(800px 400px at 10% 110%, rgba(34,197,94,0.1), transparent 60%)",
        }}
      />
      <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10">
        <TopBanner aggregateLive={aggregateLive} aggregate24h={aggregate24h} />

        {/* ================================================================ */}
        {/* IDEAS — THE BILLION DOLLAR SHOW                                  */}
        {/* ================================================================ */}

        <section className="space-y-6">
          <SectionHeader
            icon={Lightbulb}
            title="Builder ideas"
            eyebrow="LIVE SIGNAL · WEIGHTED BY COMMITMENT"
            subtitle="Invest > Buy > Build > Use. Decayed by recency. Public, agent-writable, shippable."
          />

          <HeroIdeaCard idea={hero} />

          <div>
            <RowHeading
              label="LEADERBOARD · LIVE CONVICTION"
              right={`${aggregate24h} reactions · last 24h`}
            />
            <ul className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
              {list.map((idea) => (
                <li key={idea.id}>
                  <RankIdeaCard idea={idea} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ================================================================ */}
        {/* PREDICTIONS                                                      */}
        {/* ================================================================ */}

        <section className="space-y-6">
          <SectionHeader
            icon={LineChart}
            title="Repo forecasts"
            eyebrow="VELOCITY EXTRAPOLATION · 80% CONFIDENCE BAND"
            subtitle="Live model. Sparkline = last 30 days actual. Shaded band = next 7 / 30 / 90 day forecast."
          />

          <div className="rounded-card border border-border-primary bg-bg-card/60 backdrop-blur-sm p-5 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-3 pb-4 border-b border-border-primary">
              <div>
                <h3 className="font-mono text-lg font-bold text-text-primary">
                  vercel/next.js
                </h3>
                <div className="font-mono text-[11px] text-text-tertiary">
                  model:{" "}
                  <span className="text-brand">v1-velocity-extrapolation</span>{" "}
                  · inputs:{" "}
                  <span className="text-text-secondary">
                    stars · 24h · 7d · 30d · sparkline
                  </span>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-up/40 bg-up/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-up">
                <LivePulse />
                CALIBRATED · 7d · 30d · 90d
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
              {FORECASTS.map((f) => (
                <ForecastCard key={f.horizonDays} forecast={f} />
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border-primary pt-6 text-[11px] text-text-tertiary">
          <p className="mb-3 uppercase tracking-wider">Live surfaces</p>
          <div className="flex flex-wrap gap-2">
            {[
              ["/ideas", "/ideas"],
              ["/predict", "/predict"],
              ["/repo/vercel/next.js", "/repo/[owner]/[name]"],
              ["/breakouts", "/breakouts"],
              ["/u/mirko", "/u/[handle]"],
              ["/portal", "/portal (MCP manifest)"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-1.5 rounded-button border border-border-primary bg-bg-card px-3 py-1.5 font-mono text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-card-hover hover:border-brand transition-colors"
              >
                {label}
              </Link>
            ))}
          </div>
        </footer>
      </div>
    </main>
  );
}

// ===========================================================================
// Section scaffolding
// ===========================================================================

function TopBanner({
  aggregateLive,
  aggregate24h,
}: {
  aggregateLive: number;
  aggregate24h: number;
}) {
  return (
    <div className="rounded-card border border-brand/40 bg-gradient-to-r from-brand/15 via-brand/5 to-transparent px-5 py-3 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3 text-xs">
        <LivePulse />
        <span className="font-mono uppercase tracking-[0.2em] text-brand font-bold">
          Design preview
        </span>
        <span className="text-text-tertiary">
          Mock data · real signals model · intentionally loud
        </span>
      </div>
      <div className="flex items-center gap-5 font-mono text-[11px]">
        <span className="text-text-tertiary">
          <span className="text-up font-semibold tabular-nums">
            {aggregateLive}
          </span>{" "}
          builders active now
        </span>
        <span className="text-text-muted">·</span>
        <span className="text-text-tertiary">
          <span className="text-brand font-semibold tabular-nums">
            {aggregate24h}
          </span>{" "}
          reactions · 24h
        </span>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  eyebrow,
  subtitle,
}: {
  icon: typeof Flame;
  title: string;
  eyebrow: string;
  subtitle: string;
}) {
  return (
    <header className="border-b border-border-primary pb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand font-bold">
          {eyebrow}
        </span>
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight inline-flex items-center gap-2.5 text-text-primary">
        <Icon className="size-6 text-brand" aria-hidden />
        {title}
      </h2>
      <p className="mt-2 text-xs text-text-secondary font-mono max-w-[60ch]">
        {subtitle}
      </p>
    </header>
  );
}

function RowHeading({ label, right }: { label: string; right?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-primary/60 pb-2">
      <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-text-tertiary font-semibold">
        <span className="inline-block size-1.5 rounded-full bg-brand animate-pulse" />
        {label}
      </span>
      {right ? (
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {right}
        </span>
      ) : null}
    </div>
  );
}

// ===========================================================================
// HERO idea card — the show-stopper
// ===========================================================================

function HeroIdeaCard({ idea }: { idea: IdeaMock }): JSX.Element {
  const c = conviction(idea);
  const total = totalReactions(idea.reactions);
  const total24h = totalReactions(idea.reactions24h);

  return (
    <article
      className="relative rounded-card border border-brand/40 bg-gradient-to-br from-brand/[0.08] via-bg-card to-bg-card p-6 overflow-hidden"
      style={{
        boxShadow:
          "0 0 60px rgba(245, 110, 15, 0.15), 0 0 0 1px rgba(245, 110, 15, 0.3) inset",
      }}
      aria-label={`Top idea: ${idea.title}`}
    >
      {/* Ambient grid pattern */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(245,110,15,1) 1px, transparent 1px), linear-gradient(90deg, rgba(245,110,15,1) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />

      {/* Top ribbon row */}
      <div className="relative flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {idea.callout ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-bg-primary">
              <Flame className="size-3" aria-hidden />
              {idea.callout}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/50 bg-brand/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brand">
            <Trophy className="size-3" aria-hidden />
            Rank #{idea.rank}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-up/40 bg-up/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-up">
            <LivePulse />
            {idea.liveNow} building now
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border-primary bg-bg-muted/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            <Zap className="size-2.5 text-warning" aria-hidden />
            {idea.streakDays}d streak
          </span>
        </div>
        <ReactorStack reactors={idea.recentReactors} extra={total - idea.recentReactors.length} />
      </div>

      <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-7">
        {/* LEFT — content */}
        <div className="space-y-5">
          {/* Author + category */}
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <AuthorAvatar handle={idea.authorHandle} accent={idea.authorAccent} size={26} />
            <span className="text-text-primary font-semibold">
              @{idea.authorHandle}
            </span>
            <span className="text-text-muted">·</span>
            <Clock className="size-3 text-text-tertiary" aria-hidden />
            <span className="text-text-tertiary">{fmtAge(idea.createdHoursAgo)}</span>
            <span className="text-text-muted">·</span>
            <BuildStatusPill status={idea.buildStatus} />
            <span className="text-text-muted">·</span>
            <span className={`uppercase tracking-wider font-semibold ${idea.category.accent}`}>
              {idea.category.label}
            </span>
          </div>

          {/* Title — gradient text, huge */}
          <h3
            className="text-3xl md:text-4xl font-bold leading-[1.1] tracking-tight font-mono bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(135deg, #FBFBFB 0%, #FBFBFB 60%, #F56E0F 120%)",
            }}
          >
            {idea.title}
          </h3>

          {/* Pitch */}
          <p className="text-base text-text-secondary leading-relaxed max-w-[58ch]">
            {idea.pitch}
          </p>

          {/* Target repos with real favicons */}
          {idea.targetRepos.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {idea.targetRepos.map((r) => (
                <RepoChip key={r.fullName} repo={r} />
              ))}
            </div>
          ) : null}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {idea.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-border-primary bg-bg-muted/60 px-2.5 py-0.5 font-mono text-[10px] text-text-tertiary hover:border-brand/40 hover:text-brand transition-colors cursor-default"
              >
                #{t}
              </span>
            ))}
          </div>

          {/* Reaction CTAs — BIG TILES with sparkline */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            <ReactionTile
              icon={Hammer}
              label="Build it"
              count={idea.reactions.build}
              delta={idea.reactions24h.build}
              accent="text-[#60A5FA]"
              border="border-[#60A5FA]/30"
              bg="bg-[#60A5FA]/5"
            />
            <ReactionTile
              icon={Play}
              label="Use it"
              count={idea.reactions.use}
              delta={idea.reactions24h.use}
              accent="text-text-primary"
              border="border-border-primary"
              bg="bg-bg-muted/60"
            />
            <ReactionTile
              icon={ShoppingCart}
              label="Buy it"
              count={idea.reactions.buy}
              delta={idea.reactions24h.buy}
              accent="text-[#FBBF24]"
              border="border-[#FBBF24]/40"
              bg="bg-[#FBBF24]/8"
              high
            />
            <ReactionTile
              icon={DollarSign}
              label="Invest"
              count={idea.reactions.invest}
              delta={idea.reactions24h.invest}
              accent="text-up"
              border="border-up/40"
              bg="bg-up/10"
              high
            />
          </div>
        </div>

        {/* RIGHT RAIL — the money shot */}
        <aside className="space-y-4">
          {/* CONVICTION — massive gradient number */}
          <div className="relative rounded-card border border-brand/40 bg-gradient-to-br from-brand/20 via-brand/5 to-transparent p-5 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand font-bold">
                Conviction
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-up font-semibold">
                <TrendingUp className="size-3" aria-hidden />
                +{total24h} today
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className="font-mono font-bold tabular-nums leading-none bg-clip-text text-transparent"
                style={{
                  fontSize: "84px",
                  backgroundImage:
                    "linear-gradient(135deg, #FBBF24 0%, #F56E0F 50%, #EF4444 100%)",
                }}
              >
                {c}
              </span>
              <span className="font-mono text-lg text-text-tertiary">/100</span>
            </div>
            <ConvictionBar value={c} />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <MicroStat label="Total" value={total} />
              <MicroStat label="Today" value={total24h} tone="up" />
              <MicroStat label="Streak" value={`${idea.streakDays}d`} tone="warning" />
            </div>
          </div>

          {/* 7-DAY VELOCITY — mini chart */}
          <div className="rounded-card border border-border-primary bg-bg-card p-4">
            <div className="flex items-baseline justify-between mb-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-semibold">
                Velocity · 7d
              </span>
              <span className="font-mono text-[11px] text-text-secondary tabular-nums">
                {idea.reactionsPerDay.reduce((a, b) => a + b, 0)} reactions
              </span>
            </div>
            <VelocitySpark data={idea.reactionsPerDay} />
          </div>

          {/* REACTION MIX */}
          <div className="rounded-card border border-border-primary bg-bg-card p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-semibold">
                Reaction mix
              </span>
              <span className="font-mono text-[10px] text-text-muted">
                {total} total
              </span>
            </div>
            <ReactionBar reactions={idea.reactions} />
            <div className="grid grid-cols-4 gap-1.5">
              {([
                ["build", idea.reactions.build, "#60A5FA"],
                ["use", idea.reactions.use, "#C4C4C6"],
                ["buy", idea.reactions.buy, "#FBBF24"],
                ["invest", idea.reactions.invest, "#22C55E"],
              ] as const).map(([key, value, color]) => (
                <div key={key} className="text-center">
                  <div
                    className="font-mono text-sm font-bold tabular-nums"
                    style={{ color }}
                  >
                    {value}
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
                    {key}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}

// ===========================================================================
// Hero helpers
// ===========================================================================

function RepoChip({ repo }: { repo: { fullName: string; stars: number } }): JSX.Element {
  const domain = repo.fullName.split("/")[0] + ".com";
  return (
    <div className="group inline-flex items-center gap-2 rounded-button border border-border-primary bg-bg-muted/50 px-2.5 py-1.5 hover:border-brand/40 transition-colors">
      {/* Google favicons — works for any repo owner with a matching .com */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?sz=32&domain=github.com`}
        alt=""
        width={14}
        height={14}
        className="rounded-sm"
      />
      <span className="font-mono text-[11px] text-text-primary">
        {repo.fullName}
      </span>
      <span className="inline-flex items-center gap-0.5 text-[10px] text-warning">
        <Sparkles className="size-2.5" aria-hidden />
        {fmtStars(repo.stars)}
      </span>
      {void domain}
    </div>
  );
}

function ReactionTile({
  icon: Icon,
  label,
  count,
  delta,
  accent,
  border,
  bg,
  high,
}: {
  icon: typeof Hammer;
  label: string;
  count: number;
  delta: number;
  accent: string;
  border: string;
  bg: string;
  high?: boolean;
}): JSX.Element {
  return (
    <div
      className={[
        "group relative rounded-card border p-3 transition-transform hover:-translate-y-0.5 cursor-pointer",
        border,
        bg,
      ].join(" ")}
    >
      {high ? (
        <span
          className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center rounded-full bg-brand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-bg-primary"
        >
          HIGH
        </span>
      ) : null}
      <div className="flex items-center justify-between">
        <Icon className={`size-4 ${accent}`} aria-hidden />
        {delta > 0 ? (
          <span className="font-mono text-[9px] font-semibold tabular-nums text-up">
            +{delta}
          </span>
        ) : null}
      </div>
      <div className={`mt-2 font-mono text-2xl font-bold tabular-nums ${accent}`}>
        {count}
      </div>
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">
        {label}
      </div>
    </div>
  );
}

function ConvictionBar({ value }: { value: number }): JSX.Element {
  return (
    <div className="mt-3 relative h-2 rounded-full bg-border-primary overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${value}%`,
          background:
            "linear-gradient(90deg, #FBBF24 0%, #F56E0F 50%, #EF4444 100%)",
          boxShadow: "0 0 12px rgba(245, 110, 15, 0.6)",
        }}
      />
    </div>
  );
}

function MicroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "up" | "warning";
}): JSX.Element {
  const color =
    tone === "up"
      ? "text-up"
      : tone === "warning"
        ? "text-warning"
        : "text-text-primary";
  return (
    <div>
      <div className={`font-mono text-sm font-bold tabular-nums ${color}`}>
        {value}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
        {label}
      </div>
    </div>
  );
}

function ReactorStack({
  reactors,
  extra,
}: {
  reactors: Reactor[];
  extra: number;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {reactors.slice(0, 4).map((r) => (
          <AuthorAvatar
            key={r.handle}
            handle={r.handle}
            accent={r.accent}
            size={22}
            ring
          />
        ))}
        {extra > 0 ? (
          <span className="inline-flex items-center justify-center size-[22px] rounded-full border-2 border-bg-card bg-bg-muted font-mono text-[9px] font-bold text-text-secondary">
            +{extra}
          </span>
        ) : null}
      </div>
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
        recent reactors
      </span>
    </div>
  );
}

function LivePulse(): JSX.Element {
  return (
    <span className="relative inline-flex size-2">
      <span className="absolute inset-0 rounded-full bg-up opacity-60 animate-ping" />
      <span className="relative inline-flex size-2 rounded-full bg-up" />
    </span>
  );
}

function VelocitySpark({ data }: { data: number[] }): JSX.Element {
  const W = 240;
  const H = 48;
  const max = Math.max(...data, 1);
  const barW = W / data.length - 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-12">
      {data.map((v, i) => {
        const h = Math.max(2, (v / max) * H);
        const x = i * (W / data.length) + 1;
        const y = H - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={1.5}
            className="fill-brand"
            opacity={0.4 + 0.08 * i}
          />
        );
      })}
    </svg>
  );
}

function ReactionBar({
  reactions,
}: {
  reactions: Record<ReactionKey, number>;
}): JSX.Element {
  const total = totalReactions(reactions) || 1;
  const segs: Array<{ key: ReactionKey; color: string; width: number }> = [
    { key: "build", color: "bg-[#60A5FA]", width: (reactions.build / total) * 100 },
    { key: "use", color: "bg-[#C4C4C6]", width: (reactions.use / total) * 100 },
    { key: "buy", color: "bg-[#FBBF24]", width: (reactions.buy / total) * 100 },
    { key: "invest", color: "bg-up", width: (reactions.invest / total) * 100 },
  ];
  return (
    <div className="flex h-3 rounded-full overflow-hidden border border-border-primary shadow-inner">
      {segs.map((s) => (
        <div
          key={s.key}
          className={s.color}
          style={{ width: `${s.width}%` }}
          title={`${s.key}: ${Math.round((s.width / 100) * total)}`}
        />
      ))}
    </div>
  );
}

// ===========================================================================
// Rank list card
// ===========================================================================

function RankIdeaCard({ idea }: { idea: IdeaMock }): JSX.Element {
  const c = conviction(idea);
  const total = totalReactions(idea.reactions);
  const total24h = totalReactions(idea.reactions24h);
  const tier = c >= 60 ? "high" : c >= 30 ? "mid" : "low";
  const convictionColor =
    tier === "high" ? "text-up" : tier === "mid" ? "text-warning" : "text-text-tertiary";
  const convictionGlow =
    tier === "high"
      ? "shadow-[0_0_40px_rgba(34,197,94,0.12)]"
      : tier === "mid"
        ? "shadow-[0_0_40px_rgba(245,158,11,0.10)]"
        : "";
  const convictionRing =
    tier === "high"
      ? "border-up/30"
      : tier === "mid"
        ? "border-warning/30"
        : "border-border-primary";

  return (
    <article
      className={`group relative rounded-card border ${convictionRing} ${convictionGlow} bg-bg-card p-4 space-y-3 hover:border-brand/40 hover:-translate-y-0.5 transition-all overflow-hidden`}
    >
      {/* Callout ribbon */}
      {idea.callout ? (
        <span className="absolute -top-px right-4 inline-flex items-center gap-1 rounded-b-md bg-brand px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-bg-primary">
          {idea.callout}
        </span>
      ) : null}

      {/* Row 1: rank + author + status + trend */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RankMedal rank={idea.rank} />
          <AuthorAvatar
            handle={idea.authorHandle}
            accent={idea.authorAccent}
            size={22}
          />
          <div className="font-mono text-[11px]">
            <span className="text-text-primary font-semibold">
              @{idea.authorHandle}
            </span>
            <span className="text-text-muted"> · </span>
            <span className="text-text-tertiary">
              {fmtAge(idea.createdHoursAgo)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {idea.liveNow > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-up/10 border border-up/30 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-up">
              <LivePulse />
              {idea.liveNow}
            </span>
          ) : null}
          <BuildStatusPill status={idea.buildStatus} compact />
        </div>
      </header>

      {/* Title */}
      <h4 className="font-mono font-bold text-[15px] leading-snug text-text-primary">
        {idea.title}
      </h4>

      {/* Pitch */}
      <p className="font-mono text-[11px] text-text-secondary leading-relaxed line-clamp-2">
        {idea.pitch}
      </p>

      {/* Bottom row: conviction + reactions + velocity */}
      <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center pt-2 border-t border-border-primary/60">
        {/* Conviction */}
        <div className="flex flex-col items-center justify-center min-w-[62px] px-2 py-1 rounded-md bg-bg-muted/40">
          <div
            className={`font-mono text-3xl font-bold tabular-nums leading-none ${convictionColor}`}
          >
            {c}
          </div>
          <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.2em] text-text-muted">
            CONVICTION
          </div>
        </div>

        {/* Reaction bar + counts */}
        <div className="space-y-1.5">
          <ReactionBar reactions={idea.reactions} />
          <div className="flex items-center gap-2.5 font-mono text-[10px]">
            <span className="inline-flex items-center gap-0.5 text-[#60A5FA]">
              <Hammer className="size-2.5" aria-hidden />
              {idea.reactions.build}
            </span>
            <span className="inline-flex items-center gap-0.5 text-text-secondary">
              <Play className="size-2.5" aria-hidden />
              {idea.reactions.use}
            </span>
            <span className="inline-flex items-center gap-0.5 text-warning">
              <ShoppingCart className="size-2.5" aria-hidden />
              {idea.reactions.buy}
            </span>
            <span className="inline-flex items-center gap-0.5 text-up">
              <DollarSign className="size-2.5" aria-hidden />
              {idea.reactions.invest}
            </span>
            <span className="ml-auto">
              {total24h > 0 ? (
                <span className="text-up font-bold tabular-nums">
                  ↑ +{total24h} 24h
                </span>
              ) : (
                <span className="text-text-muted">{total} total</span>
              )}
            </span>
          </div>
        </div>

        {/* Velocity mini */}
        <div className="hidden sm:block w-[64px]">
          <VelocitySparkMini data={idea.reactionsPerDay} />
        </div>
      </div>

      {/* Shipped footer */}
      {idea.buildStatus === "shipped" && idea.shippedRepoUrl ? (
        <a
          href={idea.shippedRepoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 pt-2 border-t border-up/30 font-mono text-[11px] text-up hover:underline"
        >
          <Sparkles className="size-3" aria-hidden />
          {idea.shippedRepoUrl.replace(/^https?:\/\//, "")}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </article>
  );
}

function VelocitySparkMini({ data }: { data: number[] }): JSX.Element {
  const W = 64;
  const H = 24;
  const max = Math.max(...data, 1);
  const barW = W / data.length - 1.5;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-6"
    >
      {data.map((v, i) => {
        const h = Math.max(1.5, (v / max) * H);
        const x = i * (W / data.length) + 0.75;
        const y = H - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={1}
            className="fill-brand"
            opacity={0.4 + 0.08 * i}
          />
        );
      })}
    </svg>
  );
}

function RankMedal({ rank }: { rank: number }): JSX.Element {
  if (rank === 1) {
    return (
      <span
        className="inline-flex items-center justify-center size-7 rounded-md font-mono text-xs font-bold tabular-nums text-bg-primary"
        style={{
          background: "linear-gradient(135deg, #FBBF24 0%, #F56E0F 100%)",
          boxShadow: "0 0 14px rgba(251,191,36,0.4)",
        }}
      >
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center size-7 rounded-md font-mono text-xs font-bold tabular-nums text-bg-primary bg-gradient-to-br from-[#D4D4D4] to-[#737373]">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center size-7 rounded-md font-mono text-xs font-bold tabular-nums text-bg-primary bg-gradient-to-br from-[#D97706] to-[#92400E]">
        3
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center size-7 rounded-md bg-bg-muted border border-border-primary font-mono text-xs font-bold tabular-nums text-text-tertiary">
      {rank}
    </span>
  );
}

function BuildStatusPill({
  status,
  compact,
}: {
  status: IdeaMock["buildStatus"];
  compact?: boolean;
}): JSX.Element {
  const meta: Record<
    IdeaMock["buildStatus"],
    { label: string; classes: string; Icon: typeof Hammer }
  > = {
    exploring: {
      label: "Exploring",
      classes: "text-text-tertiary border-border-primary bg-bg-muted/40",
      Icon: Bookmark,
    },
    scoping: {
      label: "Scoping",
      classes: "text-warning border-warning/40 bg-warning/10",
      Icon: BarChart3,
    },
    building: {
      label: "Building",
      classes: "text-brand border-brand/40 bg-brand/15 shadow-[0_0_8px_rgba(245,110,15,0.3)_inset]",
      Icon: Hammer,
    },
    shipped: {
      label: "Shipped",
      classes: "text-up border-up/40 bg-up/10",
      Icon: Sparkles,
    },
    abandoned: {
      label: "Abandoned",
      classes: "text-down border-down/40 bg-down/5",
      Icon: TrendingDown,
    },
  };
  const m = meta[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${m.classes}`}
    >
      <m.Icon className="size-2.5" aria-hidden />
      {compact ? m.label.toLowerCase() : m.label}
    </span>
  );
}

function AuthorAvatar({
  handle,
  accent,
  size,
  ring,
}: {
  handle: string;
  accent: string;
  size: number;
  ring?: boolean;
}): JSX.Element {
  const initial = handle[0]?.toUpperCase() ?? "?";
  return (
    <span
      className={[
        `inline-flex items-center justify-center rounded-full bg-gradient-to-br ${accent} font-mono font-bold text-bg-primary`,
        ring ? "ring-2 ring-bg-card" : "",
      ].join(" ")}
      style={{ width: size, height: size, fontSize: size * 0.46 }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

// ===========================================================================
// Forecast card
// ===========================================================================

function ForecastCard({ forecast }: { forecast: ForecastDemo }): JSX.Element {
  const delta = forecast.pointEstimate - forecast.currentStars;
  const deltaPct =
    forecast.currentStars > 0 ? (delta / forecast.currentStars) * 100 : 0;
  const confidence = forecast.confidence;
  const confTier =
    confidence >= 75 ? "high" : confidence >= 50 ? "mid" : "low";
  const confColor =
    confTier === "high"
      ? "text-up"
      : confTier === "mid"
        ? "text-warning"
        : "text-down";
  const glow =
    confTier === "high"
      ? "shadow-[0_0_40px_rgba(34,197,94,0.12)]"
      : confTier === "mid"
        ? "shadow-[0_0_40px_rgba(245,158,11,0.10)]"
        : "shadow-[0_0_40px_rgba(239,68,68,0.08)]";

  return (
    <article
      className={`rounded-card border border-border-primary bg-bg-primary/60 ${glow} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="inline-flex items-center gap-2">
          <TrendingUp className="size-4 text-brand" aria-hidden />
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-tertiary font-bold">
            +{forecast.horizonDays}d horizon
          </span>
        </div>
        <ConfidenceGauge value={confidence} color={confColor} />
      </div>

      {/* Big estimate */}
      <div className="px-4 pt-3">
        <div
          className="font-mono font-bold tabular-nums leading-none bg-clip-text text-transparent"
          style={{
            fontSize: "40px",
            backgroundImage:
              delta >= 0
                ? "linear-gradient(135deg, #FBFBFB 0%, #22C55E 100%)"
                : "linear-gradient(135deg, #FBFBFB 0%, #EF4444 100%)",
          }}
        >
          {fmtStars(forecast.pointEstimate)}
        </div>
        <div className="mt-1 font-mono text-[11px] tabular-nums text-text-tertiary">
          from{" "}
          <span className="text-text-secondary">
            {fmtStars(forecast.currentStars)}
          </span>{" "}
          ·{" "}
          <span
            className={`${delta >= 0 ? "text-up" : "text-down"} font-bold`}
          >
            {delta >= 0 ? "+" : ""}
            {fmtStars(delta)} ({deltaPct.toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* Sparkline */}
      <div className="px-4 py-3">
        <ForecastSparkline forecast={forecast} />
      </div>

      {/* Pills */}
      <div className="px-4 pb-3 grid grid-cols-3 gap-1.5">
        <StatPill
          label="P10"
          value={fmtStars(forecast.lowP10)}
          tone="down"
        />
        <StatPill
          label="EST"
          value={fmtStars(forecast.pointEstimate)}
          tone="brand"
        />
        <StatPill
          label="P90"
          value={fmtStars(forecast.highP90)}
          tone="up"
        />
      </div>

      {/* Drivers */}
      <div className="px-4 py-3 border-t border-border-primary space-y-2">
        {forecast.drivers.map((d) => (
          <div key={d.label} className="flex items-start gap-2 text-[11px]">
            <span
              className={`inline-flex items-center gap-1 font-mono uppercase tracking-wider font-bold whitespace-nowrap ${
                d.tone === "positive"
                  ? "text-up"
                  : d.tone === "negative"
                    ? "text-down"
                    : "text-text-tertiary"
              }`}
            >
              {d.tone === "positive" ? (
                <TrendingUp className="size-3" aria-hidden />
              ) : d.tone === "negative" ? (
                <TrendingDown className="size-3" aria-hidden />
              ) : (
                <Zap className="size-3" aria-hidden />
              )}
              {d.label}
            </span>
            <span className="text-text-secondary flex-1 leading-snug">
              {d.detail}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function ConfidenceGauge({
  value,
  color,
}: {
  value: number;
  color: string;
}): JSX.Element {
  // 180° arc from -90 → +90 (left to right). Rad = sin/cos from -PI/2 to PI/2.
  const R = 22;
  const W = R * 2 + 6;
  const H = R + 6;
  const cx = W / 2;
  const cy = H;
  const start = -Math.PI;
  const end = 0;
  const arc = (t: number) => {
    const a = start + (end - start) * t;
    return {
      x: cx + Math.cos(a) * R,
      y: cy + Math.sin(a) * R,
    };
  };
  const p0 = arc(0);
  const pEnd = arc(1);
  const pCur = arc(Math.min(1, Math.max(0, value / 100)));

  // Background arc path
  const bgD = `M ${p0.x} ${p0.y} A ${R} ${R} 0 0 1 ${pEnd.x} ${pEnd.y}`;
  // Active arc path (to current point)
  const fgD = `M ${p0.x} ${p0.y} A ${R} ${R} 0 0 1 ${pCur.x} ${pCur.y}`;

  return (
    <div className="inline-flex items-center gap-2">
      <svg
        width={W}
        height={H + 2}
        viewBox={`0 0 ${W} ${H + 2}`}
        aria-hidden
      >
        <path
          d={bgD}
          className="fill-none stroke-border-primary"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d={fgD}
          className={`fill-none stroke-current ${color}`}
          strokeWidth="3.5"
          strokeLinecap="round"
          style={{
            filter: "drop-shadow(0 0 4px currentColor)",
          }}
        />
        <circle cx={pCur.x} cy={pCur.y} r="2.5" className={`fill-current ${color}`} />
      </svg>
      <div className="flex flex-col items-start leading-tight">
        <span
          className={`font-mono text-lg font-bold tabular-nums ${color}`}
        >
          {value}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
          confidence
        </span>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "up" | "down" | "brand";
}): JSX.Element {
  const colorMap = {
    up: "border-up/30 bg-up/5 text-up",
    down: "border-down/30 bg-down/5 text-down",
    brand: "border-brand/40 bg-brand/10 text-brand",
  };
  return (
    <div
      className={`rounded-md border ${colorMap[tone]} px-2 py-1.5 text-center`}
    >
      <div className="font-mono text-[9px] uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-xs font-bold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function ForecastSparkline({ forecast }: { forecast: ForecastDemo }): JSX.Element {
  const W = 280;
  const H = 72;
  const past = forecast.past;
  const totalPoints = past.length + forecast.horizonDays;
  const pastPoints = past.length;

  const lastPast = past[past.length - 1] ?? forecast.currentStars;
  const forecastPath: Array<{ x: number; mid: number; low: number; high: number }> = [];
  for (let i = 0; i <= forecast.horizonDays; i++) {
    const t = i / forecast.horizonDays;
    const mid = lastPast + (forecast.pointEstimate - lastPast) * t;
    const bandHalf =
      ((forecast.highP90 - forecast.pointEstimate) / 2) * Math.sqrt(t);
    forecastPath.push({
      x: pastPoints + i,
      mid,
      low: mid - bandHalf,
      high: mid + bandHalf,
    });
  }

  const allYs = [
    ...past,
    ...forecastPath.map((p) => p.low),
    ...forecastPath.map((p) => p.high),
  ];
  const minY = Math.min(...allYs);
  const maxY = Math.max(...allYs);
  const yPad = (maxY - minY) * 0.12;
  const yLo = minY - yPad;
  const yHi = maxY + yPad;

  const toX = (idx: number) => (idx / (totalPoints - 1)) * W;
  const toY = (val: number) => H - ((val - yLo) / (yHi - yLo)) * H;

  const pastD = past
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`,
    )
    .join(" ");
  const forecastMidD = forecastPath
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(1)} ${toY(p.mid).toFixed(1)}`,
    )
    .join(" ");
  const bandD = [
    ...forecastPath.map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(1)} ${toY(p.high).toFixed(1)}`,
    ),
    ...[...forecastPath].reverse().map(
      (p) => `L ${toX(p.x).toFixed(1)} ${toY(p.low).toFixed(1)}`,
    ),
    "Z",
  ].join(" ");

  const splitX = toX(pastPoints - 1);

  // Past area fill for visual heft
  const pastArea =
    `${pastD} L ${toX(pastPoints - 1).toFixed(1)} ${H} L 0 ${H} Z`;

  const gradId = `band-grad-${forecast.horizonDays}`;
  const pastGradId = `past-grad-${forecast.horizonDays}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-20"
      aria-label="Forecast sparkline"
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F56E0F" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F56E0F" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id={pastGradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#C4C4C6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#C4C4C6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Past area */}
      <path d={pastArea} fill={`url(#${pastGradId})`} />
      {/* Forecast band */}
      <path d={bandD} fill={`url(#${gradId})`} />
      {/* Past line */}
      <path
        d={pastD}
        className="fill-none stroke-text-secondary"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Forecast mid (dashed) */}
      <path
        d={forecastMidD}
        className="fill-none stroke-brand"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 3"
        style={{ filter: "drop-shadow(0 0 4px rgba(245,110,15,0.5))" }}
      />
      {/* Split */}
      <line
        x1={splitX}
        x2={splitX}
        y1="0"
        y2={H}
        className="stroke-text-muted"
        strokeWidth="0.5"
        strokeDasharray="2 2"
      />
      {/* Current dot */}
      <circle
        cx={splitX}
        cy={toY(lastPast)}
        r="3.5"
        className="fill-brand stroke-bg-card"
        strokeWidth="1.5"
        style={{ filter: "drop-shadow(0 0 6px rgba(245,110,15,0.8))" }}
      />
    </svg>
  );
}
