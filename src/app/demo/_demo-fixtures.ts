// /demo fixtures — extracted from page.tsx (APP-04). Mock data, math
// helpers, and the synthesized forecasts that drive the WOW showcase. Pure
// data + pure functions — zero React imports — so the page stays focused
// on rendering and tree-shakers can drop unused fixtures from build output.

// ===========================================================================
// Mock data
// ===========================================================================

export type ReactionKey = "build" | "use" | "buy" | "invest";

export interface Reactor {
  handle: string;
  accent: string;
}

export interface IdeaMock {
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

export const IDEAS: IdeaMock[] = [
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

export const WEIGHTS: Record<ReactionKey, number> = {
  build: 3,
  use: 1,
  buy: 5,
  invest: 8,
};

export function weightedScore(r: Record<ReactionKey, number>): number {
  return (
    r.build * WEIGHTS.build +
    r.use * WEIGHTS.use +
    r.buy * WEIGHTS.buy +
    r.invest * WEIGHTS.invest
  );
}

export function conviction(idea: IdeaMock): number {
  const raw = weightedScore(idea.reactions);
  const decay = Math.exp(-idea.createdHoursAgo / 48);
  return Math.min(100, Math.round(Math.log1p(raw * decay) * 18));
}

export function totalReactions(r: Record<ReactionKey, number>): number {
  return r.build + r.use + r.buy + r.invest;
}

export function fmtStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export function fmtAge(h: number): string {
  if (h < 1) return "just now";
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "1d ago" : `${d}d ago`;
}

// ===========================================================================
// Prediction mock
// ===========================================================================

export interface ForecastDemo {
  horizonDays: 7 | 30 | 90;
  currentStars: number;
  pointEstimate: number;
  lowP10: number;
  highP90: number;
  past: number[];
  confidence: number; // 0-100
  drivers: {
    label: string;
    detail: string;
    tone: "positive" | "negative" | "neutral";
  }[];
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

export const FORECASTS: ForecastDemo[] = [
  buildForecast(7, 128_412, 180, 22),
  buildForecast(30, 128_412, 180, 22),
  buildForecast(90, 128_412, 180, 22),
];
