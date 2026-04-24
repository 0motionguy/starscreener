// /demo — visual showcase for the Idea + Prediction layer.
//
// Dense, opinionated design preview: hero conviction card, rank list
// with color-coded scores, reaction distribution bars, SVG forecast
// sparklines with confidence bands. Mock data only; this page is the
// "what could this look like" answer, not the production component.

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
} from "lucide-react";

import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: `Demo — ideas + predictions · ${SITE_NAME}`,
  description:
    "Visual showcase for the new idea cards and repo trajectory forecasts. Dense terminal aesthetic.",
  alternates: { canonical: absoluteUrl("/demo") },
  robots: { index: false, follow: false },
};

export const dynamic = "force-static";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

type ReactionKey = "build" | "use" | "buy" | "invest";

interface IdeaMock {
  id: string;
  authorHandle: string;
  authorAccent: string; // avatar gradient
  rank: number;
  title: string;
  pitch: string;
  buildStatus: "exploring" | "scoping" | "building" | "shipped" | "abandoned";
  category: string;
  tags: string[];
  targetRepos: Array<{ fullName: string; stars: number }>;
  createdHoursAgo: number;
  reactions: Record<ReactionKey, number>;
  reactions24h: Record<ReactionKey, number>; // delta in last 24h
  shippedRepoUrl?: string | null;
}

const IDEAS: IdeaMock[] = [
  {
    id: "mcpgithub",
    rank: 1,
    authorHandle: "starbuilder",
    authorAccent: "from-[#F56E0F] to-[#FBBF24]",
    title: "One-liner MCP wrapper for any GitHub repo",
    pitch:
      "Scaffolds an MCP server from a repo in one command. Agents get list/search/get over the repo's docs + code, zero config.",
    buildStatus: "building",
    category: "Agent infra",
    tags: ["mcp", "agents", "scaffolding"],
    targetRepos: [
      { fullName: "anthropics/claude-code", stars: 128_412 },
      { fullName: "modelcontextprotocol/servers", stars: 12_830 },
    ],
    createdHoursAgo: 96,
    reactions: { build: 67, use: 122, buy: 18, invest: 4 },
    reactions24h: { build: 8, use: 21, buy: 3, invest: 1 },
  },
  {
    id: "bounty",
    rank: 2,
    authorHandle: "founder",
    authorAccent: "from-[#22C55E] to-[#F56E0F]",
    title: "Pay-per-issue bounty board for OSS maintainers",
    pitch:
      "Submit an issue, set a bounty in USDC. Maintainer ships a fix, escrow releases. Cuts existing platform fees by half.",
    buildStatus: "scoping",
    category: "Dev infra",
    tags: ["bounty", "payments", "stripe-connect"],
    targetRepos: [],
    createdHoursAgo: 20,
    reactions: { build: 23, use: 8, buy: 41, invest: 19 },
    reactions24h: { build: 11, use: 3, buy: 18, invest: 8 },
  },
  {
    id: "compareforecast",
    rank: 3,
    authorHandle: "mirko",
    authorAccent: "from-[#3B82F6] to-[#8B5CF6]",
    title: "Cross-repo compare with 30-day forecast overlay",
    pitch:
      "Pick 2-4 repos, see stars + momentum + forecast bands on one chart. The shared x-axis makes \"who's decelerating\" obvious.",
    buildStatus: "scoping",
    category: "Analytics",
    tags: ["charts", "compare", "forecasting"],
    targetRepos: [{ fullName: "vercel/next.js", stars: 128_412 }],
    createdHoursAgo: 28,
    reactions: { build: 14, use: 3, buy: 0, invest: 0 },
    reactions24h: { build: 4, use: 1, buy: 0, invest: 0 },
  },
  {
    id: "rss",
    rank: 4,
    authorHandle: "shipper",
    authorAccent: "from-[#22C55E] to-[#3B82F6]",
    title: "Trending-repo RSS with per-language filters",
    pitch:
      "Atom + RSS feeds of every breakout repo filtered by language. Drop-in for Feedly or any reader; no account needed.",
    buildStatus: "shipped",
    category: "Distribution",
    tags: ["rss", "atom", "feeds"],
    targetRepos: [],
    createdHoursAgo: 336,
    reactions: { build: 31, use: 84, buy: 12, invest: 2 },
    reactions24h: { build: 2, use: 7, buy: 0, invest: 0 },
    shippedRepoUrl: "https://github.com/shipper/trending-rss",
  },
  {
    id: "tgdigest",
    rank: 5,
    authorHandle: "newauthor",
    authorAccent: "from-[#F56E0F] to-[#EF4444]",
    title: "Paste any repo URL, get a Telegram daily-diff bot",
    pitch:
      "A one-line wrapper that turns any repo into a daily diff digest delivered to TG. For forkers who want breakfast news.",
    buildStatus: "exploring",
    category: "Notifications",
    tags: ["bot", "telegram", "digests"],
    targetRepos: [],
    createdHoursAgo: 6,
    reactions: { build: 19, use: 5, buy: 2, invest: 0 },
    reactions24h: { build: 19, use: 5, buy: 2, invest: 0 },
  },
];

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

const WEIGHTS: Record<ReactionKey, number> = {
  build: 3,
  use: 1,
  buy: 5,
  invest: 8,
};

function weightedScore(r: Record<ReactionKey, number>): number {
  return r.build * WEIGHTS.build + r.use * WEIGHTS.use + r.buy * WEIGHTS.buy + r.invest * WEIGHTS.invest;
}

// Conviction = weighted reaction sum, decayed by age. Mimics the real
// hotScore() math but clipped to a 0-100 range for a readable headline.
function conviction(idea: IdeaMock): number {
  const raw = weightedScore(idea.reactions);
  const decay = Math.exp(-idea.createdHoursAgo / 48);
  const scaled = raw * decay;
  // Soft curve — log so a hot post doesn't hit 100 on day one.
  return Math.min(100, Math.round(Math.log1p(scaled) * 18));
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

// ---------------------------------------------------------------------------
// Prediction mock — 30 days past + 30 days forecast
// ---------------------------------------------------------------------------

interface ForecastDemo {
  fullName: string;
  currentStars: number;
  horizonDays: 7 | 30 | 90;
  pointEstimate: number;
  lowP10: number;
  highP90: number;
  past: number[]; // daily stars, length 30
  drivers: { label: string; detail: string; tone: "positive" | "negative" | "neutral" }[];
}

// Synthesize a past-30d + forecast for a hypothetical 128K-star repo.
function buildForecast(horizonDays: 7 | 30 | 90, baseStars: number, dailyAvg: number, noiseAmp: number): ForecastDemo {
  const past: number[] = [];
  let s = baseStars - dailyAvg * 30;
  for (let i = 0; i < 30; i++) {
    s += dailyAvg + (Math.sin(i * 0.7) + Math.cos(i * 0.4)) * noiseAmp;
    past.push(Math.round(s));
  }
  const damp = Math.exp(-horizonDays / 60);
  const delta = dailyAvg * horizonDays * damp;
  const pointEstimate = Math.round(baseStars + delta);
  const band = Math.round(1.28 * noiseAmp * Math.sqrt(horizonDays) * damp * 30);
  return {
    fullName: "vercel/next.js",
    currentStars: baseStars,
    horizonDays,
    pointEstimate,
    lowP10: Math.max(baseStars, pointEstimate - band),
    highP90: pointEstimate + band,
    past,
    drivers:
      horizonDays === 7
        ? [
            { label: "Accelerating", detail: "Recent daily growth (180/day) is 22% above the 30d average.", tone: "positive" },
            { label: "Steady cadence", detail: "Daily growth is consistent (CV=0.35); narrow band.", tone: "positive" },
          ]
        : horizonDays === 30
          ? [
              { label: "Baseline trajectory", detail: "Projecting current pace forward, damped for horizon.", tone: "neutral" },
            ]
          : [
              { label: "High volatility", detail: "Daily growth varies a lot (CV=1.8); band widens fast.", tone: "neutral" },
            ],
  };
}

const FORECASTS: ForecastDemo[] = [
  buildForecast(7, 128_412, 180, 22),
  buildForecast(30, 128_412, 180, 22),
  buildForecast(90, 128_412, 180, 22),
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DemoPage() {
  const ranked = [...IDEAS].sort((a, b) => conviction(b) - conviction(a));
  const hero = ranked[0]!;
  const list = ranked.slice(1);

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10">
        <DemoBanner />

        {/* ================================================================ */}
        {/* IDEAS                                                            */}
        {/* ================================================================ */}

        <section className="space-y-6">
          <SectionHeader
            icon={Lightbulb}
            title="Builder ideas"
            subtitle="Signal-weighted. Invest > Buy > Build > Use. Decayed by recency."
          />

          {/* HERO idea — full width, dense metrics */}
          <HeroIdeaCard idea={hero} />

          {/* RANK LIST — 2-col grid of compact leaderboard cards */}
          <div>
            <RowHeading label="LIVE CONVICTION LEADERBOARD" right="Last 7d" />
            <ul className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
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
            title="Forecasts · vercel/next.js"
            subtitle="Live velocity extrapolation with confidence band. Damped by horizon."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FORECASTS.map((f) => (
              <ForecastCard key={f.horizonDays} forecast={f} />
            ))}
          </div>
        </section>

        {/* ================================================================ */}
        {/* FOOTER                                                           */}
        {/* ================================================================ */}

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

// ---------------------------------------------------------------------------
// Section scaffolding
// ---------------------------------------------------------------------------

function DemoBanner() {
  return (
    <div className="rounded-card border border-warning/60 bg-warning/5 px-4 py-3 text-xs text-warning inline-flex items-center gap-2">
      <Flame className="size-3.5" aria-hidden />
      <span className="uppercase tracking-wider font-semibold">Design preview</span>
      <span className="text-text-tertiary normal-case tracking-normal">
        · mock data · intentionally loud
      </span>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Flame;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="border-b border-border-primary pb-4">
      <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2">
        <Icon className="size-5 text-brand" aria-hidden />
        {title}
      </h2>
      <p className="mt-1 text-[11px] text-text-tertiary font-mono">{subtitle}</p>
    </header>
  );
}

function RowHeading({ label, right }: { label: string; right?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-primary/50 pb-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
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

// ---------------------------------------------------------------------------
// HERO idea card — the top idea gets the biggest real estate
// ---------------------------------------------------------------------------

function HeroIdeaCard({ idea }: { idea: IdeaMock }): JSX.Element {
  const c = conviction(idea);
  const total = totalReactions(idea.reactions);
  const total24h = totalReactions(idea.reactions24h);

  return (
    <article
      className="rounded-card border border-brand/40 bg-gradient-to-br from-brand/5 via-bg-card to-bg-card p-5 shadow-card relative overflow-hidden"
      aria-label={`Top idea: ${idea.title}`}
    >
      {/* Rank badge */}
      <div className="absolute top-5 right-5 flex items-center gap-1.5 rounded-full border border-brand/50 bg-brand/15 px-3 py-1">
        <Trophy className="size-3.5 text-brand" aria-hidden />
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-brand">
          Rank #{idea.rank}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6">
        {/* LEFT — content */}
        <div className="space-y-4">
          {/* Author + meta row */}
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <AuthorAvatar handle={idea.authorHandle} accent={idea.authorAccent} size={24} />
            <span className="text-text-primary font-semibold">@{idea.authorHandle}</span>
            <span className="text-text-muted">·</span>
            <Clock className="size-3 text-text-tertiary" aria-hidden />
            <span className="text-text-tertiary">{fmtAge(idea.createdHoursAgo)}</span>
            <span className="text-text-muted">·</span>
            <BuildStatusPill status={idea.buildStatus} />
            <span className="text-text-muted">·</span>
            <span className="text-text-tertiary">{idea.category}</span>
          </div>

          {/* Title */}
          <h3 className="text-2xl md:text-3xl font-bold leading-tight text-text-primary font-mono">
            {idea.title}
          </h3>

          {/* Pitch */}
          <p className="text-base text-text-secondary leading-relaxed max-w-[60ch]">
            {idea.pitch}
          </p>

          {/* Target repos */}
          {idea.targetRepos.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {idea.targetRepos.map((r) => (
                <div
                  key={r.fullName}
                  className="inline-flex items-center gap-2 rounded-button border border-border-primary bg-bg-muted/50 px-2.5 py-1"
                >
                  <span className="font-mono text-[11px] text-text-primary">{r.fullName}</span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-text-tertiary">
                    <Sparkles className="size-2.5" aria-hidden />
                    {fmtStars(r.stars)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {idea.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-border-primary bg-bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-text-tertiary"
              >
                #{t}
              </span>
            ))}
          </div>

          {/* CTA reaction row */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <ReactionCTA
              icon={Hammer}
              label="Build it"
              count={idea.reactions.build}
              delta={idea.reactions24h.build}
            />
            <ReactionCTA
              icon={Play}
              label="Use it"
              count={idea.reactions.use}
              delta={idea.reactions24h.use}
            />
            <ReactionCTA
              icon={ShoppingCart}
              label="Buy it"
              count={idea.reactions.buy}
              delta={idea.reactions24h.buy}
              high
            />
            <ReactionCTA
              icon={DollarSign}
              label="Invest"
              count={idea.reactions.invest}
              delta={idea.reactions24h.invest}
              high
            />
          </div>
        </div>

        {/* RIGHT — metrics panel */}
        <aside className="rounded-card border border-border-primary bg-bg-primary/40 p-4 space-y-4">
          {/* Conviction */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                Conviction
              </span>
              <ConvictionDelta delta={total24h} />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-5xl font-bold tabular-nums text-brand leading-none">
                {c}
              </span>
              <span className="font-mono text-sm text-text-tertiary">/100</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-border-primary overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand via-brand to-warning"
                style={{ width: `${c}%` }}
              />
            </div>
          </div>

          {/* Reaction distribution */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                Reactions · {total}
              </span>
              <span className="font-mono text-[10px] text-up">
                +{total24h} 24h
              </span>
            </div>
            <ReactionBar reactions={idea.reactions} />
            <div className="mt-2 grid grid-cols-4 gap-1 text-center">
              <ReactionMiniStat icon={Hammer} count={idea.reactions.build} color="text-[#60A5FA]" />
              <ReactionMiniStat icon={Play} count={idea.reactions.use} color="text-text-secondary" />
              <ReactionMiniStat icon={ShoppingCart} count={idea.reactions.buy} color="text-[#FBBF24]" />
              <ReactionMiniStat icon={DollarSign} count={idea.reactions.invest} color="text-up" />
            </div>
          </div>

          {/* Momentum */}
          <div className="pt-2 border-t border-border-primary">
            <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-1">
              24h Momentum
            </div>
            <MomentumSpark reactions24h={idea.reactions24h} />
          </div>
        </aside>
      </div>
    </article>
  );
}

function ConvictionDelta({ delta }: { delta: number }): JSX.Element {
  if (delta <= 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-text-muted">
        <TrendingDown className="size-3" aria-hidden />
        flat
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-up font-semibold">
      <TrendingUp className="size-3" aria-hidden />
      +{delta} today
    </span>
  );
}

function ReactionBar({ reactions }: { reactions: Record<ReactionKey, number> }): JSX.Element {
  const total = totalReactions(reactions) || 1;
  const segs: Array<{ key: ReactionKey; color: string; width: number }> = [
    { key: "build", color: "bg-[#60A5FA]", width: (reactions.build / total) * 100 },
    { key: "use", color: "bg-text-secondary", width: (reactions.use / total) * 100 },
    { key: "buy", color: "bg-[#FBBF24]", width: (reactions.buy / total) * 100 },
    { key: "invest", color: "bg-up", width: (reactions.invest / total) * 100 },
  ];
  return (
    <div className="mt-1.5 flex h-2.5 rounded-full overflow-hidden border border-border-primary">
      {segs.map((s) => (
        <div key={s.key} className={s.color} style={{ width: `${s.width}%` }} />
      ))}
    </div>
  );
}

function ReactionMiniStat({
  icon: Icon,
  count,
  color,
}: {
  icon: typeof Hammer;
  count: number;
  color: string;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon className={`size-3 ${color}`} aria-hidden />
      <span className="font-mono text-[11px] font-semibold tabular-nums text-text-primary">
        {count}
      </span>
    </div>
  );
}

function MomentumSpark({
  reactions24h,
}: {
  reactions24h: Record<ReactionKey, number>;
}): JSX.Element {
  const total = totalReactions(reactions24h);
  // Synthesize a 24-point bar chart showing activity distribution across hours.
  const bars = Array.from({ length: 24 }, (_, i) => {
    // Concentrate activity in recent hours (higher bars on right).
    const weight = Math.pow((i + 1) / 24, 2);
    return total * weight * (0.5 + Math.random() * 0.5);
  });
  const max = Math.max(...bars);
  return (
    <div className="flex items-end gap-0.5 h-10">
      {bars.map((b, i) => (
        <div
          key={i}
          className="flex-1 bg-gradient-to-t from-brand/30 to-brand rounded-sm"
          style={{ height: `${Math.max(6, (b / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function ReactionCTA({
  icon: Icon,
  label,
  count,
  delta,
  high,
}: {
  icon: typeof Hammer;
  label: string;
  count: number;
  delta: number;
  high?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      disabled
      className={[
        "inline-flex items-center gap-2 rounded-button border px-3 py-2 font-mono text-xs transition-colors",
        high
          ? "border-brand/40 bg-brand/10 text-brand hover:bg-brand/20"
          : "border-border-primary bg-bg-card text-text-primary hover:bg-bg-card-hover",
      ].join(" ")}
      aria-label={`${label} ${count}`}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="font-semibold">{label}</span>
      <span className="tabular-nums">{count}</span>
      {delta > 0 ? (
        <span className="text-[10px] text-up tabular-nums">+{delta}</span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Rank list card — compact dense row
// ---------------------------------------------------------------------------

function RankIdeaCard({ idea }: { idea: IdeaMock }): JSX.Element {
  const c = conviction(idea);
  const total = totalReactions(idea.reactions);
  const total24h = totalReactions(idea.reactions24h);
  const tier =
    c >= 60 ? "high" : c >= 30 ? "mid" : "low";
  const convictionColor =
    tier === "high" ? "text-up" : tier === "mid" ? "text-warning" : "text-text-tertiary";
  const convictionRingColor =
    tier === "high" ? "border-up/40" : tier === "mid" ? "border-warning/40" : "border-border-primary";

  return (
    <article
      className={`rounded-card border ${convictionRingColor} bg-bg-card p-4 shadow-card space-y-3 hover:border-brand/40 transition-colors`}
    >
      {/* Top row: rank + conviction + meta */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <RankBadge rank={idea.rank} />
          <AuthorAvatar handle={idea.authorHandle} accent={idea.authorAccent} size={20} />
          <div className="font-mono text-[11px]">
            <span className="text-text-primary font-semibold">
              @{idea.authorHandle}
            </span>
            <span className="text-text-muted"> · </span>
            <span className="text-text-tertiary">{fmtAge(idea.createdHoursAgo)}</span>
          </div>
        </div>
        <BuildStatusPill status={idea.buildStatus} compact />
      </header>

      {/* Title */}
      <h4 className="font-mono font-semibold text-sm leading-snug text-text-primary">
        {idea.title}
      </h4>

      {/* Pitch — truncated */}
      <p className="font-mono text-[11px] text-text-secondary leading-relaxed line-clamp-2">
        {idea.pitch}
      </p>

      {/* Conviction + reaction strip */}
      <div className="grid grid-cols-[auto_1fr] gap-3 items-center pt-2 border-t border-border-primary/50">
        <div className="flex flex-col items-center justify-center min-w-[58px]">
          <div className={`font-mono text-2xl font-bold tabular-nums leading-none ${convictionColor}`}>
            {c}
          </div>
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-text-muted">
            CONVICTION
          </div>
        </div>
        <div className="space-y-1.5">
          <ReactionBar reactions={idea.reactions} />
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-text-tertiary tabular-nums">
              <Hammer className="inline size-2.5 mr-0.5 text-[#60A5FA]" aria-hidden />
              {idea.reactions.build}{" "}
              <Play className="inline size-2.5 mr-0.5 ml-1.5 text-text-secondary" aria-hidden />
              {idea.reactions.use}{" "}
              <ShoppingCart className="inline size-2.5 mr-0.5 ml-1.5 text-[#FBBF24]" aria-hidden />
              {idea.reactions.buy}{" "}
              <DollarSign className="inline size-2.5 mr-0.5 ml-1.5 text-up" aria-hidden />
              {idea.reactions.invest}
            </span>
            {total24h > 0 ? (
              <span className="text-up font-semibold tabular-nums">
                +{total24h} 24h
              </span>
            ) : (
              <span className="text-text-muted">{total} total</span>
            )}
          </div>
        </div>
      </div>

      {/* Shipped footer */}
      {idea.buildStatus === "shipped" && idea.shippedRepoUrl ? (
        <a
          href={idea.shippedRepoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 pt-2 border-t border-border-primary/50 font-mono text-[11px] text-up hover:underline"
        >
          <Sparkles className="size-3" aria-hidden />
          {idea.shippedRepoUrl.replace(/^https?:\/\//, "")}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </article>
  );
}

function RankBadge({ rank }: { rank: number }): JSX.Element {
  const color =
    rank === 1
      ? "bg-brand text-bg-primary"
      : rank === 2
        ? "bg-warning/90 text-bg-primary"
        : rank === 3
          ? "bg-up/90 text-bg-primary"
          : "bg-bg-muted text-text-tertiary";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md w-6 h-6 font-mono text-[11px] font-bold tabular-nums ${color}`}
    >
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
  const meta: Record<IdeaMock["buildStatus"], { label: string; color: string; Icon: typeof Hammer }> = {
    exploring: { label: "Exploring", color: "text-text-tertiary border-border-primary", Icon: Bookmark },
    scoping: { label: "Scoping", color: "text-warning border-warning/40 bg-warning/10", Icon: BarChart3 },
    building: { label: "Building", color: "text-brand border-brand/40 bg-brand/15", Icon: Hammer },
    shipped: { label: "Shipped", color: "text-up border-up/40 bg-up/10", Icon: Sparkles },
    abandoned: { label: "Abandoned", color: "text-down border-down/40 bg-down/5", Icon: TrendingDown },
  };
  const m = meta[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${m.color}`}
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
}: {
  handle: string;
  accent: string;
  size: number;
}): JSX.Element {
  const initial = handle[0]?.toUpperCase() ?? "?";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${accent} font-mono font-bold text-bg-primary`}
      style={{ width: size, height: size, fontSize: size * 0.48 }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Forecast card with SVG sparkline + confidence band
// ---------------------------------------------------------------------------

function ForecastCard({ forecast }: { forecast: ForecastDemo }): JSX.Element {
  const delta = forecast.pointEstimate - forecast.currentStars;
  const deltaPct = forecast.currentStars > 0 ? (delta / forecast.currentStars) * 100 : 0;
  return (
    <article className="rounded-card border border-border-primary bg-bg-card shadow-card overflow-hidden">
      {/* Header strip */}
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <div className="inline-flex items-center gap-2">
          <TrendingUp className="size-4 text-brand" aria-hidden />
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
            +{forecast.horizonDays}d horizon
          </span>
        </div>
        <div className="font-mono text-[10px] text-text-muted tabular-nums">
          band ±{fmtStars(Math.round((forecast.highP90 - forecast.lowP10) / 2))}
        </div>
      </div>

      {/* Big number */}
      <div className="px-4">
        <div className="font-mono text-3xl font-bold tabular-nums text-text-primary leading-none">
          {fmtStars(forecast.pointEstimate)}
        </div>
        <div className="mt-1 font-mono text-[11px] tabular-nums text-text-tertiary">
          from {fmtStars(forecast.currentStars)} ·{" "}
          <span className={delta >= 0 ? "text-up font-semibold" : "text-down font-semibold"}>
            {delta >= 0 ? "+" : ""}
            {fmtStars(delta)} ({deltaPct.toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* SVG SPARKLINE — past 30d actuals + forward band */}
      <div className="px-4 py-3">
        <ForecastSparkline forecast={forecast} />
      </div>

      {/* Confidence range pills */}
      <div className="px-4 pb-2 grid grid-cols-3 gap-1.5">
        <StatPill label="P10" value={fmtStars(forecast.lowP10)} tone="down" />
        <StatPill label="EST" value={fmtStars(forecast.pointEstimate)} tone="brand" />
        <StatPill label="P90" value={fmtStars(forecast.highP90)} tone="up" />
      </div>

      {/* Drivers */}
      <div className="px-4 py-3 border-t border-border-primary space-y-1">
        {forecast.drivers.map((d) => (
          <div key={d.label} className="flex items-start gap-2 text-[11px]">
            <span
              className={`font-mono uppercase tracking-wider font-semibold ${
                d.tone === "positive"
                  ? "text-up"
                  : d.tone === "negative"
                    ? "text-down"
                    : "text-text-tertiary"
              }`}
            >
              {d.label}
            </span>
            <span className="text-text-secondary flex-1 leading-snug">{d.detail}</span>
          </div>
        ))}
      </div>
    </article>
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
    <div className={`rounded-md border ${colorMap[tone]} px-2 py-1.5 text-center`}>
      <div className="font-mono text-[9px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-0.5 font-mono text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ForecastSparkline({ forecast }: { forecast: ForecastDemo }): JSX.Element {
  const W = 260;
  const H = 80;
  const past = forecast.past;
  // Extend x-axis by the forecast horizon.
  const totalPoints = past.length + forecast.horizonDays;
  const pastPoints = past.length;

  // Build forecast path (linear from last past value → pointEstimate).
  const lastPast = past[past.length - 1] ?? forecast.currentStars;
  const forecastPath: Array<{ x: number; mid: number; low: number; high: number }> = [];
  for (let i = 0; i <= forecast.horizonDays; i++) {
    const t = i / forecast.horizonDays;
    const mid = lastPast + (forecast.pointEstimate - lastPast) * t;
    // Band widens with sqrt(t).
    const bandHalf = ((forecast.highP90 - forecast.pointEstimate) / 2) * Math.sqrt(t);
    forecastPath.push({
      x: pastPoints + i,
      mid,
      low: mid - bandHalf,
      high: mid + bandHalf,
    });
  }

  // Compute y range over past + forecast band
  const allYs = [
    ...past,
    ...forecastPath.map((p) => p.low),
    ...forecastPath.map((p) => p.high),
  ];
  const minY = Math.min(...allYs);
  const maxY = Math.max(...allYs);
  const yPad = (maxY - minY) * 0.1;
  const yLo = minY - yPad;
  const yHi = maxY + yPad;

  const toX = (idx: number) => (idx / (totalPoints - 1)) * W;
  const toY = (val: number) => H - ((val - yLo) / (yHi - yLo)) * H;

  // Past line
  const pastD = past
    .map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
    .join(" ");

  // Forecast mid line
  const forecastMidD = forecastPath
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(1)} ${toY(p.mid).toFixed(1)}`)
    .join(" ");

  // Confidence band polygon (high edge forward + low edge backward)
  const bandD = [
    ...forecastPath.map(
      (p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(1)} ${toY(p.high).toFixed(1)}`,
    ),
    ...[...forecastPath]
      .reverse()
      .map((p) => `L ${toX(p.x).toFixed(1)} ${toY(p.low).toFixed(1)}`),
    "Z",
  ].join(" ");

  const splitX = toX(pastPoints - 1);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-20"
      aria-label="Forecast sparkline"
    >
      {/* Band */}
      <path d={bandD} className="fill-brand/15" />
      {/* Past line */}
      <path
        d={pastD}
        className="fill-none stroke-text-secondary"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Forecast mid (dashed) */}
      <path
        d={forecastMidD}
        className="fill-none stroke-brand"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="3 3"
      />
      {/* Split marker */}
      <line
        x1={splitX}
        x2={splitX}
        y1="0"
        y2={H}
        className="stroke-text-muted"
        strokeWidth="0.5"
        strokeDasharray="2 2"
      />
      {/* Current point */}
      <circle
        cx={splitX}
        cy={toY(lastPast)}
        r="2.5"
        className="fill-brand stroke-bg-card"
        strokeWidth="1.5"
      />
    </svg>
  );
}

