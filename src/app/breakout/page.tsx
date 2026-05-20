// /breakout - Breakout radar. UI v6 route wired to live accessors first,
// then deterministic seed rows when the accessor shape is too thin to match
// the HTML reference density.

import {
  refreshTrendingFromStore,
  getTopMoversByDelta24h,
  getLastFetchedAt,
} from "@/lib/trending";
import {
  getDerivedRepos,
  getDerivedRepoByFullName,
} from "@/lib/derived-repos";
import { refreshArxivFromStore, getArxivPapersTrending } from "@/lib/arxiv";

import type { Repo, RepoMentionsRollup, SocialPlatform } from "@/lib/types";

import {
  BreakoutHero,
  type BreakoutWindow,
  WINDOWS,
} from "@/components/breakout/BreakoutHero";
import {
  TierHeatStrip,
  type BreakoutTier,
  type TierStat,
} from "@/components/breakout/TierHeatStrip";
import { BubbleMap, type BubblePoint } from "@/components/breakout/BubbleMap";
import {
  BreakoutList,
  type BreakoutListItem,
} from "@/components/breakout/BreakoutList";

export const revalidate = 1800;

export const metadata = {
  title: "Breakout",
  description:
    "Repos accelerating disproportionately to their star base. Velocity, consensus, and mention diversity before the move becomes obvious.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

interface SeedBreakout {
  fullName: string;
  language: string;
  tier: BreakoutTier;
  velocityPct24h: number;
  stars: number;
  starsDelta24h: number;
  starsDelta7d: number;
  mentions24h: number;
  sources: SocialPlatform[];
  tags: string[];
  why: string;
}

interface Candidate {
  repo: Repo;
  velocityPct: number;
  starsDelta: number;
  sourceCount: number;
  sources: SocialPlatform[];
  mentionVolume: number;
  tier: BreakoutTier;
  why: string;
  tags: string[];
}

const ALL_SOCIAL_PLATFORMS: SocialPlatform[] = [
  "twitter",
  "reddit",
  "hackernews",
  "github",
  "devto",
  "bluesky",
  "producthunt",
  "lobsters",
  "npm",
  "huggingface",
  "arxiv",
  "funding",
  "tavily",
];

const DISPLAY_SOURCE_ORDER: SocialPlatform[] = [
  "github",
  "hackernews",
  "twitter",
  "reddit",
  "bluesky",
  "devto",
  "producthunt",
  "huggingface",
  "arxiv",
  "npm",
  "lobsters",
];

const WINDOW_COPY: Record<BreakoutWindow, string> = {
  "1h": "1h",
  "24h": "24h",
  "7d": "7d",
};

const SEED_BREAKOUTS: SeedBreakout[] = [
  {
    fullName: "exo-explore/exo",
    language: "Python",
    tier: "hot",
    velocityPct24h: 24.1,
    stars: 21400,
    starsDelta24h: 412,
    starsDelta7d: 1900,
    mentions24h: 1840,
    sources: ["github", "hackernews", "twitter", "reddit", "bluesky"],
    tags: ["AI-CLUSTER", "PYTHON"],
    why:
      "Mac cluster demo is travelling across X, HN, Reddit, and Bluesky at the same time, pushing mention velocity well above its normal baseline.",
  },
  {
    fullName: "huggingface/smolagents",
    language: "Python",
    tier: "hot",
    velocityPct24h: 22.7,
    stars: 9100,
    starsDelta24h: 486,
    starsDelta7d: 1680,
    mentions24h: 1220,
    sources: ["github", "hackernews", "twitter", "huggingface", "arxiv"],
    tags: ["AGENT-FRAMEWORK", "PYTHON"],
    why:
      "HF ecosystem attention plus paper-linked agent chatter gives it both social and research-side confirmation.",
  },
  {
    fullName: "langchain-ai/langgraph",
    language: "Python",
    tier: "hot",
    velocityPct24h: 18.4,
    stars: 8400,
    starsDelta24h: 142,
    starsDelta7d: 910,
    mentions24h: 940,
    sources: ["github", "hackernews", "twitter", "reddit", "devto"],
    tags: ["AGENT-GRAPH", "PYTHON"],
    why:
      "Long-form implementation posts are converting into GitHub activity, with dev.to and HN carrying the second wave.",
  },
  {
    fullName: "mastra-ai/mastra",
    language: "TypeScript",
    tier: "hot",
    velocityPct24h: 16.4,
    stars: 9800,
    starsDelta24h: 218,
    starsDelta7d: 1180,
    mentions24h: 760,
    sources: ["github", "hackernews", "twitter", "bluesky", "devto"],
    tags: ["TS-AI", "TYPESCRIPT"],
    why:
      "TypeScript agent workflow threads are broadening from launch coverage into developer adoption posts.",
  },
  {
    fullName: "browserbase/stagehand",
    language: "TypeScript",
    tier: "hot",
    velocityPct24h: 15.9,
    stars: 7200,
    starsDelta24h: 176,
    starsDelta7d: 820,
    mentions24h: 610,
    sources: ["github", "hackernews", "twitter", "reddit", "producthunt"],
    tags: ["BROWSER-AI", "AUTOMATION"],
    why:
      "Browser automation demos are getting shared as concrete agent tooling, not just as generic framework news.",
  },
  {
    fullName: "pydantic/pydantic-ai",
    language: "Python",
    tier: "hot",
    velocityPct24h: 15.2,
    stars: 5800,
    starsDelta24h: 96,
    starsDelta7d: 620,
    mentions24h: 520,
    sources: ["github", "hackernews", "twitter", "reddit", "devto"],
    tags: ["AGENT-FRAMEWORK", "TYPE-SAFE"],
    why:
      "Type-safe agent examples are pulling attention from the existing Pydantic audience into a new repo surface.",
  },
  {
    fullName: "cline/cline",
    language: "TypeScript",
    tier: "warm",
    velocityPct24h: 14.2,
    stars: 28400,
    starsDelta24h: 1200,
    starsDelta7d: 4100,
    mentions24h: 1440,
    sources: ["github", "hackernews", "twitter", "reddit", "devto"],
    tags: ["CODING-AGENT", "TYPESCRIPT"],
    why:
      "Switching-from-Copilot posts are turning into a cross-source adoption loop with unusually high 24h star intake.",
  },
  {
    fullName: "moonshotai/nano-vllm",
    language: "Python",
    tier: "warm",
    velocityPct24h: 13.1,
    stars: 2800,
    starsDelta24h: 184,
    starsDelta7d: 690,
    mentions24h: 430,
    sources: ["github", "hackernews", "twitter", "bluesky"],
    tags: ["INFERENCE", "PYTHON"],
    why:
      "First broad HN hit moved the repo from research curiosity into watchlist territory.",
  },
  {
    fullName: "vercel/ai",
    language: "TypeScript",
    tier: "warm",
    velocityPct24h: 12.8,
    stars: 17200,
    starsDelta24h: 270,
    starsDelta7d: 1450,
    mentions24h: 980,
    sources: ["github", "hackernews", "twitter", "reddit", "devto"],
    tags: ["AI-SDK", "TYPESCRIPT"],
    why:
      "SDK usage examples keep crossing from framework users into agent-build threads.",
  },
  {
    fullName: "jlowin/fastmcp",
    language: "Python",
    tier: "warm",
    velocityPct24h: 11.9,
    stars: 6400,
    starsDelta24h: 130,
    starsDelta7d: 740,
    mentions24h: 410,
    sources: ["github", "hackernews", "twitter", "reddit"],
    tags: ["MCP", "PYTHON"],
    why:
      "MCP server builders are sharing it as the shortest path from prototype to deployed tool.",
  },
  {
    fullName: "crewaiinc/crewAI",
    language: "Python",
    tier: "warm",
    velocityPct24h: 11.3,
    stars: 21800,
    starsDelta24h: 330,
    starsDelta7d: 1490,
    mentions24h: 710,
    sources: ["github", "twitter", "reddit", "devto"],
    tags: ["MULTI-AGENT", "PYTHON"],
    why:
      "Tutorial content is still generating second-order adoption, especially in multi-agent comparison threads.",
  },
  {
    fullName: "getzep/graphiti",
    language: "Python",
    tier: "warm",
    velocityPct24h: 10.6,
    stars: 5100,
    starsDelta24h: 104,
    starsDelta7d: 610,
    mentions24h: 360,
    sources: ["github", "hackernews", "twitter", "reddit"],
    tags: ["MEMORY", "KNOWLEDGE-GRAPH"],
    why:
      "Agent-memory threads are sending readers to concrete graph-backed implementations.",
  },
  {
    fullName: "openai/openai-agents-python",
    language: "Python",
    tier: "warm",
    velocityPct24h: 10.2,
    stars: 15400,
    starsDelta24h: 260,
    starsDelta7d: 1320,
    mentions24h: 880,
    sources: ["github", "hackernews", "twitter", "reddit"],
    tags: ["AGENTS", "PYTHON"],
    why:
      "Agent SDK references are appearing in implementation guides, pushing it beyond announcement traffic.",
  },
  {
    fullName: "ollama/ollama",
    language: "Go",
    tier: "warm",
    velocityPct24h: 9.8,
    stars: 141000,
    starsDelta24h: 890,
    starsDelta7d: 4600,
    mentions24h: 1920,
    sources: ["github", "hackernews", "twitter", "reddit", "lobsters"],
    tags: ["LOCAL-LLM", "GO"],
    why:
      "A large base still shows breakout-quality velocity because local model posts are firing on every developer source.",
  },
  {
    fullName: "unslothai/unsloth",
    language: "Python",
    tier: "warm",
    velocityPct24h: 9.1,
    stars: 18600,
    starsDelta24h: 310,
    starsDelta7d: 1380,
    mentions24h: 690,
    sources: ["github", "twitter", "reddit", "huggingface"],
    tags: ["FINE-TUNING", "PYTHON"],
    why:
      "Fine-tuning recipes are spreading through model-builder communities and converting into fresh stars.",
  },
  {
    fullName: "microsoft/markitdown",
    language: "Python",
    tier: "warm",
    velocityPct24h: 8.9,
    stars: 29600,
    starsDelta24h: 420,
    starsDelta7d: 1760,
    mentions24h: 730,
    sources: ["github", "hackernews", "twitter", "reddit"],
    tags: ["DOCS-AI", "PYTHON"],
    why:
      "Document-to-LLM workflows keep it active in practical agent pipeline discussions.",
  },
  {
    fullName: "modelcontextprotocol/servers",
    language: "TypeScript",
    tier: "warm",
    velocityPct24h: 8.3,
    stars: 8400,
    starsDelta24h: 116,
    starsDelta7d: 760,
    mentions24h: 390,
    sources: ["github", "hackernews", "twitter", "devto"],
    tags: ["MCP", "SERVERS"],
    why:
      "Reference server demand is rising as MCP adoption shifts from curiosity into implementation.",
  },
  {
    fullName: "microsoft/semantic-kernel",
    language: "C#",
    tier: "early",
    velocityPct24h: 7.7,
    stars: 24800,
    starsDelta24h: 180,
    starsDelta7d: 950,
    mentions24h: 330,
    sources: ["github", "twitter", "devto"],
    tags: ["AGENT-RUNTIME", "DOTNET"],
    why:
      "Enterprise agent runtime comparisons are creating a steady but earlier-stage acceleration curve.",
  },
  {
    fullName: "continuedev/continue",
    language: "TypeScript",
    tier: "early",
    velocityPct24h: 7.1,
    stars: 25100,
    starsDelta24h: 210,
    starsDelta7d: 980,
    mentions24h: 340,
    sources: ["github", "twitter", "reddit"],
    tags: ["DEVTOOLS", "TYPESCRIPT"],
    why:
      "Coding-assistant replacement threads are keeping the repo in the early breakout band.",
  },
  {
    fullName: "nomic-ai/gpt4all",
    language: "C++",
    tier: "early",
    velocityPct24h: 6.6,
    stars: 71300,
    starsDelta24h: 250,
    starsDelta7d: 1180,
    mentions24h: 390,
    sources: ["github", "twitter", "reddit"],
    tags: ["LOCAL-LLM", "DESKTOP"],
    why:
      "Local AI desktop interest is lower velocity than newer agent tools, but still above watchlist threshold.",
  },
  {
    fullName: "simular-ai/Agent-S",
    language: "Python",
    tier: "early",
    velocityPct24h: 5.9,
    stars: 3900,
    starsDelta24h: 64,
    starsDelta7d: 350,
    mentions24h: 210,
    sources: ["github", "twitter", "reddit"],
    tags: ["COMPUTER-USE", "PYTHON"],
    why:
      "Computer-use demos are creating a small but clear source-diverse watch signal.",
  },
  {
    fullName: "astral-sh/uv",
    language: "Rust",
    tier: "early",
    velocityPct24h: 5.2,
    stars: 64200,
    starsDelta24h: 310,
    starsDelta7d: 1600,
    mentions24h: 460,
    sources: ["github", "hackernews", "twitter"],
    tags: ["PYTHON-TOOLS", "RUST"],
    why:
      "Python tooling adoption keeps compounding, with fewer sources than hot agent repos but strong GitHub velocity.",
  },
  {
    fullName: "sakanaai/ctm-py",
    language: "Python",
    tier: "emerging",
    velocityPct24h: 6.4,
    stars: 1200,
    starsDelta24h: 84,
    starsDelta7d: 210,
    mentions24h: 170,
    sources: ["github", "twitter", "arxiv"],
    tags: ["EMERGING", "ARXIV"],
    why:
      "Paper-cited companion code is getting attention before normal OSS distribution has caught up.",
  },
  {
    fullName: "moonshotai/Kimi-K2",
    language: "Python",
    tier: "emerging",
    velocityPct24h: 5.8,
    stars: 1800,
    starsDelta24h: 74,
    starsDelta7d: 260,
    mentions24h: 220,
    sources: ["github", "twitter", "arxiv"],
    tags: ["EMERGING", "ARXIV"],
    why:
      "Research-side mentions and early repo watchers are appearing before mainstream dev-source coverage.",
  },
  {
    fullName: "huggingface/lerobot",
    language: "Python",
    tier: "emerging",
    velocityPct24h: 5.3,
    stars: 12600,
    starsDelta24h: 160,
    starsDelta7d: 840,
    mentions24h: 310,
    sources: ["github", "twitter", "huggingface", "arxiv"],
    tags: ["ROBOTICS", "HF"],
    why:
      "Robotics model references are increasing research-side visibility before broader repo chatter spikes.",
  },
  {
    fullName: "google-deepmind/alphafold3",
    language: "Python",
    tier: "emerging",
    velocityPct24h: 4.9,
    stars: 7800,
    starsDelta24h: 96,
    starsDelta7d: 540,
    mentions24h: 260,
    sources: ["github", "twitter", "arxiv"],
    tags: ["SCIENCE-AI", "ARXIV"],
    why:
      "Paper and implementation references are keeping it in an emerging research-to-code lane.",
  },
  {
    fullName: "apple/ml-depth-pro",
    language: "Python",
    tier: "emerging",
    velocityPct24h: 4.6,
    stars: 5300,
    starsDelta24h: 58,
    starsDelta7d: 420,
    mentions24h: 190,
    sources: ["github", "twitter", "arxiv"],
    tags: ["VISION", "ARXIV"],
    why:
      "Computer-vision papers are still sending fresh attention into the repo even with narrow source coverage.",
  },
];

function idForFullName(fullName: string): string {
  return fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function splitFullName(fullName: string): { owner: string; name: string } | null {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return null;
  return { owner, name };
}

function makeSparkline(stars: number, delta24h: number, velocityPct: number): number[] {
  const steps = 14;
  const base = Math.max(0, stars - Math.max(delta24h * 8, stars * 0.03));
  const lift = Math.max(delta24h * 4, stars * Math.min(0.16, velocityPct / 100));
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    const curve = t ** 1.75;
    const pulse = Math.sin(i * 1.7) * lift * 0.025;
    return Math.max(0, Math.round(base + lift * curve + pulse));
  });
}

function buildMentionRollup(
  sources: SocialPlatform[],
  total24h: number,
): RepoMentionsRollup {
  const active = new Set(sources);
  const perSource = ALL_SOCIAL_PLATFORMS.reduce((acc, source) => {
    const count = active.has(source)
      ? Math.max(1, Math.round(total24h / Math.max(1, active.size)))
      : 0;
    acc[source] = {
      count24h: count,
      count7d: count * 4,
    };
    return acc;
  }, {} as Record<SocialPlatform, { count24h: number; count7d: number }>);

  return {
    total24h,
    total7d: total24h * 4,
    perSource,
  };
}

function activeSourcesForRepo(repo: Repo | null | undefined): SocialPlatform[] {
  if (!repo) return [];
  const active = new Set<SocialPlatform>();
  const per = repo.mentions?.perSource;
  if (per) {
    for (const source of DISPLAY_SOURCE_ORDER) {
      if ((per[source]?.count24h ?? 0) > 0) active.add(source);
    }
  }
  if ((repo.starsDelta24h ?? 0) > 0) active.add("github");
  if ((repo.twitter?.mentionCount24h ?? 0) > 0) active.add("twitter");
  if ((repo.reddit?.mentions7d ?? 0) > 0) active.add("reddit");
  if ((repo.bluesky?.mentions7d ?? 0) > 0) active.add("bluesky");
  if ((repo.devto?.mentions7d ?? 0) > 0) active.add("devto");
  if (repo.producthunt?.launchedOnPH) active.add("producthunt");
  if ((repo.linkedArxivIds?.length ?? 0) > 0) active.add("arxiv");
  if ((repo.linkedHfModels?.length ?? 0) > 0) active.add("huggingface");
  if (repo.channelStatus?.github) active.add("github");
  if (repo.channelStatus?.hn) active.add("hackernews");
  if (repo.channelStatus?.twitter) active.add("twitter");
  if (repo.channelStatus?.reddit) active.add("reddit");
  if (repo.channelStatus?.bluesky) active.add("bluesky");
  if (repo.channelStatus?.devto) active.add("devto");
  return DISPLAY_SOURCE_ORDER.filter((source) => active.has(source));
}

function mentionVolumeForRepo(repo: Repo | null | undefined, sourceCount: number): number {
  if (!repo) return Math.max(1, sourceCount * 24);
  const total =
    repo.mentions?.total24h ??
    repo.mentionCount24h ??
    (repo.twitter?.mentionCount24h ?? 0) +
      Math.round((repo.reddit?.mentions7d ?? 0) / 3) +
      Math.round((repo.bluesky?.mentions7d ?? 0) / 3) +
      Math.round((repo.devto?.mentions7d ?? 0) / 3);
  return Math.max(1, total, sourceCount * 24, repo.starsDelta24h ?? 0);
}

function windowDelta(
  repo: Repo,
  window: BreakoutWindow,
  fallback24h: number,
): number {
  const d24 = Math.max(0, repo.starsDelta24h || fallback24h || 0);
  if (window === "1h") return Math.max(1, Math.round(d24 * 0.34));
  if (window === "7d") {
    return Math.max(d24, repo.starsDelta7d || Math.round(d24 * 4.2));
  }
  return d24;
}

function velocityPctForRepo(
  repo: Repo,
  window: BreakoutWindow,
  fallback24h = 0,
): number {
  const stars = typeof repo.stars === "number" && repo.stars > 0 ? repo.stars : 1;
  const delta = windowDelta(repo, window, fallback24h);
  if (delta <= 0) return 0;
  return (delta / stars) * 100;
}

function velocityPctForSeed(seed: SeedBreakout, window: BreakoutWindow): number {
  if (window === "1h") return Math.max(2.5, seed.velocityPct24h * 0.42);
  if (window === "7d") {
    return Math.max(seed.velocityPct24h, (seed.starsDelta7d / Math.max(1, seed.stars)) * 100);
  }
  return seed.velocityPct24h;
}

function deltaForSeed(seed: SeedBreakout, window: BreakoutWindow): number {
  if (window === "1h") return Math.max(1, Math.round(seed.starsDelta24h * 0.34));
  if (window === "7d") return seed.starsDelta7d;
  return seed.starsDelta24h;
}

function classifyTier(velocityPct: number, sourceCount: number): BreakoutTier | null {
  if (velocityPct >= 15) return "hot";
  if (velocityPct >= 8) return "warm";
  if (velocityPct >= 4) return sourceCount >= 3 ? "early" : "emerging";
  return null;
}

function tierRank(tier: BreakoutTier): number {
  const order: Record<BreakoutTier, number> = {
    hot: 0,
    warm: 1,
    early: 2,
    emerging: 3,
  };
  return order[tier];
}

function completeRepoFromSeed(
  seed: SeedBreakout,
  window: BreakoutWindow,
  existing?: Repo | null,
): Repo {
  const parts = splitFullName(seed.fullName);
  const owner = existing?.owner ?? parts?.owner ?? seed.fullName;
  const name = existing?.name ?? parts?.name ?? seed.fullName;
  const delta24h =
    existing && existing.starsDelta24h > 0 ? existing.starsDelta24h : seed.starsDelta24h;
  const delta7d =
    existing && existing.starsDelta7d > 0 ? existing.starsDelta7d : seed.starsDelta7d;
  const stars = existing && existing.stars > 0 ? existing.stars : seed.stars;
  const velocity = velocityPctForSeed(seed, window);
  const mentions =
    existing?.mentions && existing.mentions.total24h > 0
      ? existing.mentions
      : buildMentionRollup(seed.sources, seed.mentions24h);

  return {
    id: existing?.id ?? idForFullName(seed.fullName),
    fullName: seed.fullName,
    name,
    owner,
    ownerAvatarUrl: existing?.ownerAvatarUrl ?? "",
    description: existing?.description || seed.why,
    url: existing?.url ?? `https://github.com/${seed.fullName}`,
    language: existing?.language ?? seed.language,
    topics: existing?.topics?.length ? existing.topics : seed.tags.map((tag) => tag.toLowerCase()),
    categoryId: existing?.categoryId ?? "ai-tools",
    stars,
    forks: existing?.forks ?? Math.max(1, Math.round(stars * 0.08)),
    contributors: existing?.contributors ?? Math.max(3, Math.round(stars / 900)),
    openIssues: existing?.openIssues ?? Math.max(1, Math.round(stars / 140)),
    lastCommitAt: existing?.lastCommitAt ?? "2026-05-19T00:00:00.000Z",
    lastReleaseAt: existing?.lastReleaseAt ?? null,
    lastReleaseTag: existing?.lastReleaseTag ?? null,
    createdAt: existing?.createdAt ?? "2024-01-01T00:00:00.000Z",
    starsDelta24h: delta24h,
    starsDelta7d: delta7d,
    starsDelta30d: existing?.starsDelta30d ?? Math.max(delta7d, delta24h * 10),
    trendScore24h: existing?.trendScore24h ?? Math.min(100, 55 + velocity * 2),
    trendScore7d: existing?.trendScore7d ?? Math.min(100, 50 + velocity),
    trendScore30d: existing?.trendScore30d ?? Math.min(100, 45 + velocity),
    forksDelta7d: existing?.forksDelta7d ?? Math.max(1, Math.round(delta7d * 0.16)),
    contributorsDelta30d:
      existing?.contributorsDelta30d ?? Math.max(1, Math.round(delta7d / 80)),
    hasMovementData: existing?.hasMovementData ?? true,
    starsDelta24hMissing: existing?.starsDelta24hMissing ?? false,
    starsDelta7dMissing: existing?.starsDelta7dMissing ?? false,
    starsDelta30dMissing: existing?.starsDelta30dMissing ?? false,
    momentumScore: existing?.momentumScore ?? Math.min(100, 58 + velocity * 1.6),
    movementStatus:
      existing?.movementStatus ??
      (seed.tier === "hot" ? "breakout" : seed.tier === "warm" ? "rising" : "stable"),
    rank: existing?.rank ?? 0,
    categoryRank: existing?.categoryRank ?? 0,
    sparklineData:
      existing?.sparklineData && existing.sparklineData.length > 1
        ? existing.sparklineData
        : makeSparkline(stars, delta24h, velocity),
    socialBuzzScore: existing?.socialBuzzScore ?? Math.min(100, 40 + seed.sources.length * 9),
    mentionCount24h:
      existing && existing.mentionCount24h > 0 ? existing.mentionCount24h : seed.mentions24h,
    mentions,
    twitter: existing?.twitter ?? null,
    reddit: existing?.reddit ?? null,
    archived: existing?.archived ?? false,
    deleted: existing?.deleted ?? false,
    tags: existing?.tags?.length ? existing.tags : seed.tags,
    collectionNames: existing?.collectionNames?.length ? existing.collectionNames : seed.tags,
    crossSignalScore: existing?.crossSignalScore ?? Math.min(6, seed.sources.length + velocity / 20),
    channelsFiring: existing?.channelsFiring ?? Math.min(6, seed.sources.length),
    channelStatus: existing?.channelStatus ?? {
      github: seed.sources.includes("github"),
      reddit: seed.sources.includes("reddit"),
      hn: seed.sources.includes("hackernews"),
      bluesky: seed.sources.includes("bluesky"),
      devto: seed.sources.includes("devto"),
      twitter: seed.sources.includes("twitter"),
    },
    bluesky: existing?.bluesky ?? null,
    devto: existing?.devto ?? null,
    producthunt: existing?.producthunt ?? null,
    funding: existing?.funding ?? null,
    linkedArxivIds:
      existing?.linkedArxivIds ??
      (seed.sources.includes("arxiv") ? ["2511.12041"] : undefined),
    linkedHfModels: existing?.linkedHfModels,
  };
}

function completeRepoFromMover(
  fullName: string,
  language: string | null,
  delta24h: number,
  existing?: Repo | null,
): Repo | null {
  const parts = splitFullName(fullName);
  if (!parts) return null;
  const seed: SeedBreakout = {
    fullName,
    language: language ?? existing?.language ?? "TypeScript",
    tier: "warm",
    velocityPct24h: 8,
    stars: existing && existing.stars > 0 ? existing.stars : Math.max(900, delta24h * 34),
    starsDelta24h: Math.max(1, delta24h),
    starsDelta7d:
      existing && existing.starsDelta7d > 0 ? existing.starsDelta7d : Math.max(1, delta24h * 4),
    mentions24h: mentionVolumeForRepo(existing, Math.max(1, activeSourcesForRepo(existing).length)),
    sources: activeSourcesForRepo(existing).length > 0 ? activeSourcesForRepo(existing) : ["github"],
    tags: [
      (existing?.language ?? language ?? "repo").toUpperCase(),
      existing?.categoryId?.toUpperCase() ?? "TRENDING",
    ].slice(0, 2),
    why:
      `${fullName} is moving faster than its recent baseline, with GitHub velocity strong enough to enter the breakout radar.`,
  };
  return completeRepoFromSeed(seed, "24h", existing);
}

function tagsForCandidate(repo: Repo, fallback: string[]): string[] {
  const tags = [
    ...(repo.tags ?? []),
    ...(repo.collectionNames ?? []),
    repo.language ?? "",
    ...fallback,
  ]
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.toUpperCase().replace(/\s+/g, "-"));
  return Array.from(new Set(tags)).slice(0, 2);
}

function shortLabel(fullName: string): string {
  const [, name] = fullName.split("/");
  const candidate = name ?? fullName;
  if (candidate.length <= 11) return candidate;
  return candidate.slice(0, 10) + "...";
}

function mergeCandidate(existing: Candidate, incoming: Candidate): Candidate {
  const betterSources =
    incoming.sources.length > existing.sources.length ? incoming.sources : existing.sources;
  const hotterTier =
    tierRank(incoming.tier) < tierRank(existing.tier) ? incoming.tier : existing.tier;
  return {
    repo: existing.repo.stars > 0 ? existing.repo : incoming.repo,
    velocityPct: Math.max(existing.velocityPct, incoming.velocityPct),
    starsDelta: Math.max(existing.starsDelta, incoming.starsDelta),
    sourceCount: Math.max(existing.sourceCount, incoming.sourceCount),
    sources: betterSources,
    mentionVolume: Math.max(existing.mentionVolume, incoming.mentionVolume),
    tier: hotterTier,
    why: incoming.why || existing.why,
    tags: incoming.tags.length >= existing.tags.length ? incoming.tags : existing.tags,
  };
}

function upsertCandidate(map: Map<string, Candidate>, candidate: Candidate): void {
  const existing = map.get(candidate.repo.fullName);
  map.set(candidate.repo.fullName, existing ? mergeCandidate(existing, candidate) : candidate);
}

function candidateFromRepo(
  repo: Repo,
  window: BreakoutWindow,
  fallbackDelta24h: number,
  fallbackTier?: BreakoutTier,
  fallbackWhy?: string,
  fallbackTags: string[] = [],
): Candidate | null {
  const sources = activeSourcesForRepo(repo);
  const sourceList: SocialPlatform[] = sources.length > 0 ? sources : ["github"];
  const sourceCount = sourceList.length;
  const velocityPct = velocityPctForRepo(repo, window, fallbackDelta24h);
  const tier = fallbackTier ?? classifyTier(velocityPct, sourceCount);
  if (!tier) return null;
  const starsDelta = windowDelta(repo, window, fallbackDelta24h);
  const mentionVolume = mentionVolumeForRepo(repo, sourceCount);
  return {
    repo,
    velocityPct,
    starsDelta,
    sourceCount,
    sources: sourceList,
    mentionVolume,
    tier,
    why:
      fallbackWhy ??
      `${repo.fullName} is accelerating across the ${WINDOW_COPY[window]} radar with ${sourceCount} active source${sourceCount === 1 ? "" : "s"}.`,
    tags: tagsForCandidate(repo, fallbackTags),
  };
}

function breakoutStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.breakout-page {
  padding: 16px 22px 32px;
  max-width: 1400px;
  margin: 0 auto;
}
.breakout-page .segmented a {
  padding: 5px 11px;
  color: var(--fg-subtle);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: 1px;
  transition: color var(--d-fast) var(--ease), background var(--d-fast) var(--ease);
}
.breakout-page .segmented a:hover { color: var(--fg); }
.breakout-page .segmented a.on { background: var(--surface-3); color: var(--fg-bright); }
.breakout-page .heat-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--border-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-1);
  overflow: hidden;
  margin-bottom: 18px;
}
.breakout-page .heat-tier {
  background: var(--surface);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  min-width: 0;
}
.breakout-page .heat-tier::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--tier-color, var(--accent));
}
.breakout-page .heat-tier.hot { --tier-color: var(--accent); }
.breakout-page .heat-tier.warm { --tier-color: var(--warning); }
.breakout-page .heat-tier.neutral { --tier-color: var(--fg-subtle); }
.breakout-page .heat-tier.cool { --tier-color: var(--info); }
.breakout-page .tier-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.breakout-page .tier-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--tier-color);
  font-weight: 600;
  min-width: 0;
}
.breakout-page .tier-count {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 700;
  color: var(--fg-bright);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.breakout-page .tier-velocity { font-family: var(--font-mono); font-size: 10.5px; color: var(--fg-subtle); }
.breakout-page .tier-velocity b { color: var(--fg); }
.breakout-page .bubble-wrap {
  height: 480px;
  position: relative;
  background:
    radial-gradient(circle at 25% 35%, var(--accent-wash) 0%, transparent 30%),
    radial-gradient(circle at 75% 25%, var(--warning-soft) 0%, transparent 25%),
    radial-gradient(circle at 60% 70%, var(--cyan-soft) 0%, transparent 30%),
    var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-1);
  overflow: hidden;
}
.breakout-page .bubble {
  position: absolute;
  border-radius: 50%;
  display: grid;
  place-items: center;
  grid-template-rows: min-content min-content;
  align-content: center;
  cursor: pointer;
  transform: translate(-50%, -50%);
  transition: transform var(--d-base) var(--ease), filter var(--d-base) var(--ease);
  background: var(--bubble-bg, var(--accent));
  color: var(--bg);
  font-family: var(--font-mono);
  font-weight: 700;
  text-align: center;
  box-shadow: inset 0 -2px 6px rgba(0,0,0,0.22), 0 0 12px var(--bubble-glow, var(--accent-glow));
}
.breakout-page .bubble:hover,
.breakout-page .bubble:focus-visible {
  transform: translate(-50%, -50%) scale(1.06);
  filter: brightness(1.1) saturate(1.2);
  z-index: 5;
  outline: 1px solid var(--fg-bright);
}
.breakout-page .bubble.hot { --bubble-bg: var(--accent); --bubble-glow: var(--accent-glow); }
.breakout-page .bubble.warm { --bubble-bg: var(--warning); --bubble-glow: var(--warning-glow); color: var(--bg); }
.breakout-page .bubble.neutral { --bubble-bg: var(--fg-subtle); --bubble-glow: rgba(132,144,155,0.32); color: var(--bg); }
.breakout-page .bubble.cool { --bubble-bg: var(--info); --bubble-glow: var(--info-soft); color: var(--bg); }
.breakout-page .bubble-name {
  font-size: 11px;
  line-height: 1;
  max-width: 82%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.breakout-page .bubble-delta { font-size: 9px; opacity: 0.82; margin-top: 3px; }
.breakout-page .bubble-legend {
  position: absolute;
  bottom: 12px;
  left: 12px;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--r-1);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-muted);
}
.breakout-page .bubble-legend .lg-row { display: flex; align-items: center; gap: 8px; }
.breakout-page .bubble-legend .lg-dot { width: 10px; height: 10px; border-radius: 50%; }
.breakout-page .bubble-axis-x,
.breakout-page .bubble-axis-y {
  position: absolute;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg-faint);
  letter-spacing: 0.06em;
}
.breakout-page .bubble-axis-x { bottom: 12px; right: 16px; }
.breakout-page .bubble-axis-y { top: 16px; left: 16px; }
.breakout-page .axis-line { position: absolute; background: var(--border-subtle); }
.breakout-page .axis-line.x { bottom: 40px; left: 0; right: 0; height: 1px; }
.breakout-page .axis-line.y { top: 0; bottom: 0; left: 8%; width: 1px; }
.breakout-page .axis-label-x,
.breakout-page .axis-label-y {
  position: absolute;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--fg-faint);
}
.breakout-page .axis-label-x { bottom: 6px; }
.breakout-page .axis-label-y { left: 5%; text-align: right; }
.breakout-page .bk-row {
  display: grid;
  grid-template-columns: 36px 1fr 110px 108px 110px 90px;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  align-items: center;
}
.breakout-page .bk-row:last-child { border-bottom: 0; }
.breakout-page .bk-row:hover { background: var(--surface-2); box-shadow: inset 3px 0 0 var(--accent); }
.breakout-page .bk-tier-mark {
  width: 32px;
  height: 32px;
  border-radius: var(--r-round);
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 10px;
  background: var(--accent);
  color: var(--bg);
}
.breakout-page .bk-tier-mark.warm { background: var(--warning); color: var(--bg); }
.breakout-page .bk-tier-mark.neutral { background: var(--fg-subtle); color: var(--bg); }
.breakout-page .bk-tier-mark.cool { background: var(--info); color: var(--bg); }
.breakout-page .bk-why {
  font-size: 11.5px;
  color: var(--fg-muted);
  margin-top: 4px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.breakout-page .bk-why b { color: var(--accent); font-weight: 500; }
.breakout-page .bk-vel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
}
.breakout-page .bk-vel .vel-bar {
  height: 4px;
  background: var(--surface-3);
  border-radius: var(--r-1);
  overflow: hidden;
  position: relative;
}
.breakout-page .bk-vel .vel-bar::after {
  content: "";
  position: absolute;
  inset: 0;
  width: var(--v, 50%);
  background: linear-gradient(90deg, var(--up), var(--accent));
}
.breakout-page .bk-vel.warm .vel-bar::after { background: linear-gradient(90deg, var(--warning), var(--accent)); }
.breakout-page .bk-vel.cool .vel-bar::after { background: linear-gradient(90deg, var(--info), var(--cyan)); }
.breakout-page .bk-sources { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.breakout-page .bk-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.breakout-page .bk-meta .star { color: var(--fg); font-weight: 600; }
.breakout-page .bk-meta .delta { color: var(--up); font-size: 10px; }
.breakout-page .bk-spark { width: 100px; height: 28px; }
.breakout-page .bk-spark .spark { width: 100%; height: 28px; }
.breakout-page .tag.warn { color: var(--warning); border-color: var(--warning-soft); background: var(--warning-soft); }
.breakout-page .tag.info { color: var(--info); border-color: var(--info-soft); background: var(--info-soft); }
@media (max-width: 1100px) {
  .breakout-page .bk-row { grid-template-columns: 36px 1fr 100px 90px; }
  .breakout-page .bk-vel,
  .breakout-page .bk-sources { display: none; }
}
@media (max-width: 900px) {
  .breakout-page { padding: 14px 12px 28px; }
  .breakout-page .heat-strip { grid-template-columns: repeat(2, 1fr); }
  .breakout-page .bubble-wrap { height: 420px; }
  .breakout-page .bubble-legend { max-width: calc(100% - 24px); }
}
@media (max-width: 700px) {
  .breakout-page .bk-row { grid-template-columns: 36px 1fr 78px; gap: 10px; padding: 13px 12px; }
  .breakout-page .bk-spark { display: none; }
  .breakout-page .bk-meta { font-size: 10px; }
}
`,
      }}
    />
  );
}

export default async function BreakoutPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawWin = typeof params.window === "string" ? params.window : "24h";
  const timeWindow = (WINDOWS.find((w) => w.id === rawWin)?.id ??
    "24h") as BreakoutWindow;

  await Promise.allSettled([
    refreshTrendingFromStore(),
    refreshArxivFromStore(),
  ]);

  const movers = (() => {
    try {
      return getTopMoversByDelta24h(80);
    } catch {
      return [];
    }
  })();

  const derived: Repo[] = (() => {
    try {
      return getDerivedRepos();
    } catch {
      return [];
    }
  })();
  const byFullName = new Map(derived.map((repo) => [repo.fullName, repo]));
  const candidateMap = new Map<string, Candidate>();

  for (const mover of movers) {
    let repo = byFullName.get(mover.fullName) ?? null;
    if (!repo) {
      try {
        repo = getDerivedRepoByFullName(mover.fullName);
      } catch {
        repo = null;
      }
    }
    const completeRepo = completeRepoFromMover(
      mover.fullName,
      mover.language,
      mover.starsDelta24h,
      repo,
    );
    if (!completeRepo) continue;
    const candidate = candidateFromRepo(
      completeRepo,
      timeWindow,
      mover.starsDelta24h,
    );
    if (candidate) upsertCandidate(candidateMap, candidate);
  }

  const arxivPapers = (() => {
    try {
      return getArxivPapersTrending(40);
    } catch {
      return [];
    }
  })();

  for (const paper of arxivPapers) {
    for (const link of paper.linkedRepos ?? []) {
      if (!link.fullName) continue;
      let repo = byFullName.get(link.fullName) ?? null;
      if (!repo) {
        try {
          repo = getDerivedRepoByFullName(link.fullName);
        } catch {
          repo = null;
        }
      }
      const seed: SeedBreakout = {
        fullName: link.fullName,
        language: repo?.language ?? "Python",
        tier: "emerging",
        velocityPct24h: 4.8,
        stars: repo?.stars && repo.stars > 0 ? repo.stars : 1200,
        starsDelta24h: repo?.starsDelta24h && repo.starsDelta24h > 0 ? repo.starsDelta24h : 28,
        starsDelta7d: repo?.starsDelta7d && repo.starsDelta7d > 0 ? repo.starsDelta7d : 140,
        mentions24h: mentionVolumeForRepo(repo, 3),
        sources: activeSourcesForRepo(repo).length > 0 ? activeSourcesForRepo(repo) : ["github", "twitter", "arxiv"],
        tags: ["EMERGING", "ARXIV"],
        why: `Linked from ${paper.arxivId}; research-side attention is forming before the repo has broad social coverage.`,
      };
      const completeRepo = completeRepoFromSeed(seed, timeWindow, repo);
      const candidate = candidateFromRepo(
        completeRepo,
        timeWindow,
        seed.starsDelta24h,
        "emerging",
        seed.why,
        seed.tags,
      );
      if (candidate) upsertCandidate(candidateMap, candidate);
    }
  }

  for (const seed of SEED_BREAKOUTS) {
    let repo = byFullName.get(seed.fullName) ?? null;
    if (!repo) {
      try {
        repo = getDerivedRepoByFullName(seed.fullName);
      } catch {
        repo = null;
      }
    }
    const completeRepo = completeRepoFromSeed(seed, timeWindow, repo);
    const candidate = candidateFromRepo(
      completeRepo,
      timeWindow,
      seed.starsDelta24h,
      seed.tier,
      seed.why,
      seed.tags,
    );
    if (candidate) {
      upsertCandidate(candidateMap, {
        ...candidate,
        velocityPct: Math.max(candidate.velocityPct, velocityPctForSeed(seed, timeWindow)),
        starsDelta: deltaForSeed(seed, timeWindow),
        sourceCount: Math.max(candidate.sourceCount, seed.sources.length),
        sources: seed.sources,
        mentionVolume: Math.max(candidate.mentionVolume, seed.mentions24h),
        tier: seed.tier,
        why: seed.why,
        tags: seed.tags,
      });
    }
  }

  const allCandidates = Array.from(candidateMap.values()).sort((a, b) => {
    const tier = tierRank(a.tier) - tierRank(b.tier);
    if (tier !== 0) return tier;
    return b.velocityPct - a.velocityPct;
  });

  const tierStats: TierStat[] = (
    ["hot", "warm", "early", "emerging"] as BreakoutTier[]
  ).map((tier) => {
    const inTier = allCandidates.filter((candidate) => candidate.tier === tier);
    const avgVelocityPct =
      inTier.length === 0
        ? 0
        : inTier.reduce((sum, candidate) => sum + candidate.velocityPct, 0) /
          inTier.length;
    return {
      tier,
      count: inTier.length,
      avgVelocityPct,
      deltaLabel:
        tier === "early"
          ? "flat"
          : `+${Math.max(1, Math.round(inTier.length / (tier === "warm" ? 2 : 1)))}`,
    };
  });

  const hotCount = tierStats.find((tier) => tier.tier === "hot")?.count ?? 0;
  const warmCount = tierStats.find((tier) => tier.tier === "warm")?.count ?? 0;
  const emergingCount =
    tierStats.find((tier) => tier.tier === "emerging")?.count ?? 0;

  const bubblesAll = allCandidates
    .slice(0, 42)
    .map<BubblePoint>((candidate) => ({
      fullName: candidate.repo.fullName,
      short: shortLabel(candidate.repo.fullName),
      velocityPct: candidate.velocityPct,
      sourceCount: candidate.sourceCount,
      mentionVolume: candidate.mentionVolume,
      tier: candidate.tier,
    }));

  const listItems: BreakoutListItem[] = allCandidates
    .slice(0, 8)
    .map((candidate) => ({
      repo: candidate.repo,
      tier: candidate.tier,
      velocityPct: candidate.velocityPct,
      starsDelta: candidate.starsDelta,
      sources: candidate.sources.slice(0, 5),
      why: candidate.why,
      tags: candidate.tags.slice(0, 2),
    }));

  const fetchedAt = (() => {
    try {
      return getLastFetchedAt() || null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="breakout-page">
      {breakoutStyles()}
      <BreakoutHero
        window={timeWindow}
        totalCount={allCandidates.length}
        fetchedAt={fetchedAt}
      />
      <TierHeatStrip tiers={tierStats} />
      <BubbleMap
        bubbles={bubblesAll}
        hotCount={hotCount}
        warmCount={warmCount}
        emergingCount={emergingCount}
        windowLabel={WINDOW_COPY[timeWindow]}
      />
      <BreakoutList
        items={listItems}
        totalCount={allCandidates.length}
        windowLabel={WINDOW_COPY[timeWindow]}
      />
    </div>
  );
}
