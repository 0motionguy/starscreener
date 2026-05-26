// Repo intelligence — synthesizers that turn raw spine + community-profile
// data into operator-grade narratives, verdicts, deltas, audience takes, and
// alert presets. Pure functions; safe to call from server components.
//
// Design principle:
//   GitHub shows the repo. TrendingRepo explains the signal.
//
// Every output is deterministic from the input. No LLM calls, no API. The
// narrative reads like a smart analyst's first take — direct, structured,
// founder-native. If we don't have data for a claim, we don't make it.

import type { NormalizedGithubEvent } from "@/lib/github-events";
import type { RepoCommunityProfile } from "@/lib/repo-community-profile";
import type { Repo } from "@/lib/types";

// ---------------------------------------------------------------------------
// Verdict pills — 5 axes, each High / Medium / Low (or special labels).
// ---------------------------------------------------------------------------

export type VerdictLevel = "high" | "medium" | "low" | "experimental";

export interface Verdict {
  label: string;       // "TREND STRENGTH"
  level: VerdictLevel; // determines chip tone
  value: string;       // human-readable: "High", "Medium", "Low", "Experimental"
  reason: string;      // 4-12 words explaining the level
}

export interface VerdictPanel {
  trendStrength: Verdict;
  repoHealth: Verdict;
  founderRelevance: Verdict;
  productionReadiness: Verdict;
  signalConfidence: Verdict;
}

const AI_TOPIC_HINTS = [
  "ai",
  "ai-agent",
  "ai-agents",
  "agent",
  "agents",
  "llm",
  "llms",
  "rag",
  "claude",
  "claude-code",
  "anthropic",
  "openai",
  "chatgpt",
  "gpt",
  "huggingface",
  "transformers",
  "embeddings",
  "vector",
  "mcp",
];

const DEVTOOL_TOPIC_HINTS = [
  "devtool",
  "developer-tools",
  "framework",
  "sdk",
  "cli",
  "compiler",
  "bundler",
  "linter",
  "formatter",
  "typescript",
  "rust",
  "go",
  "python",
  "react",
  "nextjs",
  "vite",
  "deno",
  "bun",
];

const AUTOMATION_HINTS = [
  "automation",
  "workflow",
  "scraper",
  "browser",
  "playwright",
  "automate",
  "rpa",
  "n8n",
  "zapier",
];

function topicMatches(topics: string[] | undefined, hints: string[]): boolean {
  if (!topics?.length) return false;
  const set = new Set(topics.map((t) => t.toLowerCase()));
  return hints.some((h) => set.has(h));
}

function daysSince(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return Infinity;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return Infinity;
  return Math.max(0, Math.floor((nowMs - ts) / 86_400_000));
}

export function computeVerdicts(args: {
  repo: Repo;
  community: RepoCommunityProfile | null;
  events: NormalizedGithubEvent[];
}): VerdictPanel {
  const { repo, community } = args;
  const nowMs = Date.now();
  const lastCommitDays = daysSince(repo.lastCommitAt, nowMs);
  const lastReleaseDays = daysSince(repo.lastReleaseAt, nowMs);
  const ageDays = daysSince(repo.createdAt, nowMs);
  const channels = repo.channelsFiring ?? 0;
  const momentum = repo.momentumScore ?? 0;
  const stars = repo.stars ?? 0;
  const starsDelta7d = repo.starsDelta7d ?? 0;
  const contributors = repo.contributors ?? 0;
  const license = community?.license;
  const health = community?.health ?? null;
  const topics = repo.topics ?? [];

  // ---- TREND STRENGTH
  const trendStrength: Verdict = (() => {
    const star7dPct = stars > 0 ? (starsDelta7d / stars) * 100 : 0;
    if (momentum >= 65 && channels >= 3 && star7dPct >= 1) {
      return {
        label: "TREND STRENGTH",
        level: "high",
        value: "High",
        reason: `${channels} sources firing · +${star7dPct.toFixed(1)}% stars 7d`,
      };
    }
    if (momentum >= 40 || channels >= 2 || star7dPct >= 0.5) {
      return {
        label: "TREND STRENGTH",
        level: "medium",
        value: "Medium",
        reason: `${channels} source${channels === 1 ? "" : "s"} active · momentum ${Math.round(momentum)}`,
      };
    }
    return {
      label: "TREND STRENGTH",
      level: "low",
      value: "Low",
      reason: "no cross-source breakout detected",
    };
  })();

  // ---- REPO HEALTH
  const repoHealth: Verdict = (() => {
    const hasLicense = Boolean(license?.spdxId);
    const healthy = health !== null && health >= 70;
    if (healthy && hasLicense && lastCommitDays < 30) {
      return {
        label: "REPO HEALTH",
        level: "high",
        value: "High",
        reason: `${health}% community health · active commits`,
      };
    }
    if ((health !== null && health >= 40) || (hasLicense && lastCommitDays < 90)) {
      return {
        label: "REPO HEALTH",
        level: "medium",
        value: "Medium",
        reason: hasLicense
          ? `licensed · last commit ${lastCommitDays}d ago`
          : "partial community profile",
      };
    }
    return {
      label: "REPO HEALTH",
      level: "low",
      value: "Low",
      reason: hasLicense ? `last commit ${lastCommitDays}d ago` : "no license file detected",
    };
  })();

  // ---- FOUNDER RELEVANCE
  const founderRelevance: Verdict = (() => {
    const isAi = topicMatches(topics, AI_TOPIC_HINTS);
    const isDev = topicMatches(topics, DEVTOOL_TOPIC_HINTS);
    const isAuto = topicMatches(topics, AUTOMATION_HINTS);
    if (isAi && (isDev || isAuto)) {
      return {
        label: "FOUNDER RELEVANCE",
        level: "high",
        value: "High",
        reason: "AI × devtool intersection · category-hot",
      };
    }
    if (isAi || isDev) {
      return {
        label: "FOUNDER RELEVANCE",
        level: "medium",
        value: "Medium",
        reason: isAi
          ? "AI category but unclear devtool fit"
          : "devtool category · not AI-native",
      };
    }
    if (isAuto) {
      return {
        label: "FOUNDER RELEVANCE",
        level: "medium",
        value: "Medium",
        reason: "automation category · adjacent to AI",
      };
    }
    return {
      label: "FOUNDER RELEVANCE",
      level: "low",
      value: "Low",
      reason: "no AI/devtool topic match",
    };
  })();

  // ---- PRODUCTION READINESS
  const productionReadiness: Verdict = (() => {
    const hasLicense = Boolean(license?.spdxId);
    const hasRelease = Boolean(repo.lastReleaseTag);
    const releaseFresh = lastReleaseDays < 90;
    const mature =
      hasLicense &&
      hasRelease &&
      releaseFresh &&
      (stars >= 1000 || contributors >= 5) &&
      (health === null || health >= 60);
    if (mature) {
      return {
        label: "PROD READY",
        level: "high",
        value: "Ready",
        reason: `${repo.lastReleaseTag} shipped ${lastReleaseDays}d ago`,
      };
    }
    if (hasLicense && hasRelease && lastReleaseDays < 365) {
      return {
        label: "PROD READY",
        level: "medium",
        value: "Early",
        reason: `last release ${lastReleaseDays}d ago · still maturing`,
      };
    }
    return {
      label: "PROD READY",
      level: "experimental",
      value: "Experimental",
      reason: hasRelease
        ? `last release ${lastReleaseDays}d ago · stale`
        : "no tagged release yet",
    };
  })();

  // ---- SIGNAL CONFIDENCE
  const signalConfidence: Verdict = (() => {
    const sources = channels;
    const totalMentions = repo.mentions?.total7d ?? 0;
    if (sources >= 4 && totalMentions >= 10) {
      return {
        label: "SIGNAL CONFIDENCE",
        level: "high",
        value: "High",
        reason: `${sources} sources · ${totalMentions} mentions 7d`,
      };
    }
    if (sources >= 2) {
      return {
        label: "SIGNAL CONFIDENCE",
        level: "medium",
        value: "Medium",
        reason: `${sources} sources active · early spread`,
      };
    }
    if (sources === 1) {
      return {
        label: "SIGNAL CONFIDENCE",
        level: "low",
        value: "Low",
        reason: "single-source signal · could be noise",
      };
    }
    return {
      label: "SIGNAL CONFIDENCE",
      level: "low",
      value: "Low",
      reason: "no cross-source mentions yet",
    };
  })();

  return {
    trendStrength,
    repoHealth,
    founderRelevance,
    productionReadiness,
    signalConfidence,
  };
}

// ---------------------------------------------------------------------------
// Signal summary — the narrative paragraph card directly under the hero.
// ---------------------------------------------------------------------------

export interface SignalSummary {
  whatItIs: string;          // 1 sentence
  whyItMatters: string;      // 1 sentence
  whyMovingNow: string;      // 1 sentence
  whoShouldCare: string;     // 1 sentence
  confidence: VerdictLevel;  // mirrors signalConfidence
}

export function synthesizeSignalSummary(args: {
  repo: Repo;
  community: RepoCommunityProfile | null;
  verdicts: VerdictPanel;
}): SignalSummary {
  const { repo, community, verdicts } = args;
  const stars = repo.stars ?? 0;
  const starsDelta24h = repo.starsDelta24h ?? 0;
  const starsDelta7d = repo.starsDelta7d ?? 0;
  const topics = repo.topics ?? [];
  const language = repo.language;
  const topTopics = topics.slice(0, 3).filter(Boolean);
  const channels = repo.channelsFiring ?? 0;
  const description = repo.description ?? "";

  const isAi = topicMatches(topics, AI_TOPIC_HINTS);
  const isDev = topicMatches(topics, DEVTOOL_TOPIC_HINTS);
  const isAuto = topicMatches(topics, AUTOMATION_HINTS);

  // What it is — based on description if usable, else a topic/language synthesis.
  const whatItIs = (() => {
    if (description && description.length >= 20) {
      return description.replace(/\s+/g, " ").trim();
    }
    if (topTopics.length > 0) {
      return `A ${language ?? "code"} project in the ${topTopics.join(" / ")} space.`;
    }
    return `A ${language ?? "code"} project on GitHub by ${repo.owner}.`;
  })();

  // Why it matters — derived from topics + ecosystem fit.
  const whyItMatters = (() => {
    if (isAi && (isDev || isAuto)) {
      return `Sits at the intersection of AI ${isAuto ? "automation" : "tooling"} and developer infrastructure — where founders ship.`;
    }
    if (isAi) {
      return `Plugs into the AI agent / LLM tooling stack at a moment when the category is repricing.`;
    }
    if (isDev) {
      return `Targets the developer-tools layer where compounding adoption translates directly into infra spend.`;
    }
    if (isAuto) {
      return `Lives in the automation / workflow layer adjacent to where AI-native operators are building.`;
    }
    if (language) {
      return `A ${language} project gaining traction outside the usual mainstream lists.`;
    }
    return "Tracked because cross-source signal is rising even though category fit is unclear.";
  })();

  // Why moving now — based on velocity + channels.
  const whyMovingNow = (() => {
    const pct24 = stars > 0 ? (starsDelta24h / stars) * 100 : 0;
    if (channels >= 3 && pct24 >= 1) {
      return `Hit ${channels} discovery channels in the last week and added ${starsDelta24h.toLocaleString()} stars in 24h (+${pct24.toFixed(1)}%).`;
    }
    if (starsDelta24h > 0 && starsDelta7d > starsDelta24h) {
      return `Star velocity is compounding — ${starsDelta24h.toLocaleString()} in 24h on top of ${starsDelta7d.toLocaleString()} over 7d.`;
    }
    if (channels >= 2) {
      return `Cross-source mentions on ${channels} channels — broader-than-GitHub interest forming.`;
    }
    if (community?.commitsLast52Weeks && community.commitsLast52Weeks.length > 0) {
      const recent4 = community.commitsLast52Weeks.slice(-4);
      const sum = recent4.reduce((s, n) => s + n, 0);
      if (sum > 0) {
        return `Maintainer cadence is up — ${sum} commits in the last 4 weeks.`;
      }
    }
    return "Tracked early — the breakout hasn't fully materialized but signal direction is positive.";
  })();

  // Who should care — based on verdict alignment.
  const whoShouldCare = (() => {
    const relevance = verdicts.founderRelevance.level;
    if (isAi && (isDev || isAuto)) {
      return "AI founders, devtool teams, and operators building agent infra.";
    }
    if (relevance === "high") {
      return "Founders and operators evaluating the AI × devtool stack.";
    }
    if (isDev) {
      return "Developer-tools teams and indie hackers tracking adjacent infra.";
    }
    if (isAi) {
      return "AI builders watching the agent / LLM tooling layer.";
    }
    if (isAuto) {
      return "Operators and indie hackers automating their workflows.";
    }
    return "Investors and scouts mapping emerging-category signal.";
  })();

  return {
    whatItIs,
    whyItMatters,
    whyMovingNow,
    whoShouldCare,
    confidence: verdicts.signalConfidence.level,
  };
}

// ---------------------------------------------------------------------------
// Why it's moving — primary drivers as a bullet list.
// ---------------------------------------------------------------------------

export interface MovingDriver {
  text: string;
  emphasis: "primary" | "secondary";
}

export function synthesizeWhyMoving(args: {
  repo: Repo;
  community: RepoCommunityProfile | null;
  events: NormalizedGithubEvent[];
}): MovingDriver[] {
  const { repo, community, events } = args;
  const out: MovingDriver[] = [];
  const stars = repo.stars ?? 0;
  const starsDelta24h = repo.starsDelta24h ?? 0;
  const starsDelta7d = repo.starsDelta7d ?? 0;
  const channels = repo.channelsFiring ?? 0;
  const topics = repo.topics ?? [];
  const isAi = topicMatches(topics, AI_TOPIC_HINTS);
  const isDev = topicMatches(topics, DEVTOOL_TOPIC_HINTS);

  // Category momentum
  if (isAi) {
    out.push({
      text: "AI / agent category momentum — broader market repricing the stack",
      emphasis: "primary",
    });
  }
  if (isDev && !isAi) {
    out.push({
      text: "Developer-tools tailwind — adjacent infra is compounding too",
      emphasis: "primary",
    });
  }

  // Star velocity
  const pct24 = stars > 0 ? (starsDelta24h / stars) * 100 : 0;
  if (starsDelta24h >= 50 || pct24 >= 2) {
    out.push({
      text: `Fast 24h growth — +${starsDelta24h.toLocaleString()} stars (+${pct24.toFixed(1)}%)`,
      emphasis: "primary",
    });
  } else if (starsDelta7d >= 100) {
    out.push({
      text: `Sustained 7d climb — +${starsDelta7d.toLocaleString()} stars in the last week`,
      emphasis: "secondary",
    });
  }

  // Cross-source spread
  if (channels >= 3) {
    out.push({
      text: `Cross-source spread — ${channels} discovery channels firing in parallel`,
      emphasis: "primary",
    });
  } else if (channels >= 2) {
    out.push({
      text: `Early social / community spread (${channels} channels active)`,
      emphasis: "secondary",
    });
  }

  // Top mention surface
  const detail = repo.mentions?.detail?.perSource;
  if (detail) {
    for (const source of Object.keys(detail)) {
      const top = detail[source as keyof typeof detail]?.top?.[0];
      if (top?.title) {
        out.push({
          text: `Surfaced on ${source.toUpperCase()} — "${top.title.slice(0, 70)}${top.title.length > 70 ? "…" : ""}"`,
          emphasis: "secondary",
        });
        break;
      }
    }
  }

  // Recent release
  const recentRelease = events.find((e) => e.type === "ReleaseEvent");
  if (recentRelease) {
    const tag = (recentRelease.payload as { release?: { tag_name?: string } }).release?.tag_name;
    out.push({
      text: `Recent release shipped${tag ? ` — ${tag}` : ""}`,
      emphasis: "secondary",
    });
  } else if (!repo.lastReleaseTag) {
    out.push({
      text: "No tagged release yet — pre-stable, treat the signal cautiously",
      emphasis: "secondary",
    });
  }

  // Maintainer activity
  if (community?.commitsLast52Weeks && community.commitsLast52Weeks.length >= 4) {
    const recent4 = community.commitsLast52Weeks.slice(-4).reduce((s, n) => s + n, 0);
    const prior4 = community.commitsLast52Weeks.slice(-8, -4).reduce((s, n) => s + n, 0);
    if (recent4 > prior4 * 1.5 && recent4 > 0) {
      out.push({
        text: `Maintainer cadence accelerating — ${recent4} commits in last 4 weeks vs ${prior4} prior`,
        emphasis: "secondary",
      });
    }
  }

  return out.slice(0, 6);
}

// ---------------------------------------------------------------------------
// What changed — 24h / 7d / 30d delta buckets.
// ---------------------------------------------------------------------------

export interface ChangeRow {
  label: string;     // "Stars"
  value: string;     // "+1,347"
  tone: "up" | "down" | "muted";
}

export interface WhatChanged {
  bucket24h: ChangeRow[];
  bucket7d: ChangeRow[];
  bucket30d: ChangeRow[];
}

export function computeWhatChanged(args: {
  repo: Repo;
  community: RepoCommunityProfile | null;
  events: NormalizedGithubEvent[];
}): WhatChanged {
  const { repo, community, events } = args;
  const nowMs = Date.now();
  const day = 86_400_000;

  const eventsIn = (ms: number): NormalizedGithubEvent[] =>
    events.filter((e) => {
      const ts = e.createdAt ? Date.parse(e.createdAt) : NaN;
      return Number.isFinite(ts) && nowMs - ts <= ms;
    });

  const releases24 = eventsIn(day).filter((e) => e.type === "ReleaseEvent").length;
  const releases7 = eventsIn(7 * day).filter((e) => e.type === "ReleaseEvent").length;
  const releases30 = eventsIn(30 * day).filter((e) => e.type === "ReleaseEvent").length;
  const pushes24 = eventsIn(day).filter((e) => e.type === "PushEvent").length;
  const pushes7 = eventsIn(7 * day).filter((e) => e.type === "PushEvent").length;
  const pushes30 = eventsIn(30 * day).filter((e) => e.type === "PushEvent").length;
  const prs7 = eventsIn(7 * day).filter((e) => e.type === "PullRequestEvent").length;
  const prs30 = eventsIn(30 * day).filter((e) => e.type === "PullRequestEvent").length;

  const fmt = (n: number, suffix = ""): string =>
    n > 0 ? `+${n.toLocaleString()}${suffix}` : n.toLocaleString() + suffix;

  const starsDelta24 = repo.starsDelta24h ?? 0;
  const starsDelta7 = repo.starsDelta7d ?? 0;
  const mentions24 = repo.mentions?.total24h ?? 0;
  const mentions7 = repo.mentions?.total7d ?? 0;
  const forksDelta7 = repo.forksDelta7d ?? 0;
  const contribDelta30 = repo.contributorsDelta30d ?? 0;
  // Crude 4-week commit total from the trailing 4 weeks of the 52-week array.
  const commits4w =
    community?.commitsLast52Weeks?.slice(-4).reduce((s, n) => s + n, 0) ?? 0;

  return {
    bucket24h: [
      { label: "Stars", value: fmt(starsDelta24), tone: starsDelta24 > 0 ? "up" : "muted" },
      { label: "Mentions", value: fmt(mentions24), tone: mentions24 > 0 ? "up" : "muted" },
      { label: "Releases", value: fmt(releases24), tone: releases24 > 0 ? "up" : "muted" },
      { label: "Commits", value: fmt(pushes24), tone: pushes24 > 0 ? "up" : "muted" },
    ],
    bucket7d: [
      { label: "Stars", value: fmt(starsDelta7), tone: starsDelta7 > 0 ? "up" : "muted" },
      { label: "Mentions", value: fmt(mentions7), tone: mentions7 > 0 ? "up" : "muted" },
      { label: "Forks", value: fmt(forksDelta7), tone: forksDelta7 > 0 ? "up" : "muted" },
      { label: "Releases", value: fmt(releases7), tone: releases7 > 0 ? "up" : "muted" },
      { label: "PRs", value: fmt(prs7), tone: prs7 > 0 ? "up" : "muted" },
      { label: "Commits", value: fmt(pushes7), tone: pushes7 > 0 ? "up" : "muted" },
    ],
    bucket30d: [
      { label: "Contributors", value: fmt(contribDelta30), tone: contribDelta30 > 0 ? "up" : "muted" },
      { label: "Releases", value: fmt(releases30), tone: releases30 > 0 ? "up" : "muted" },
      { label: "PRs", value: fmt(prs30), tone: prs30 > 0 ? "up" : "muted" },
      { label: "Commits 4w", value: commits4w.toLocaleString(), tone: commits4w > 0 ? "up" : "muted" },
      { label: "Pushes", value: fmt(pushes30), tone: pushes30 > 0 ? "up" : "muted" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Operator take — audience-specific judgment.
// ---------------------------------------------------------------------------

export type TakeStance = "care" | "watch" | "skip";

export interface OperatorTake {
  audience: string;             // "AI founders"
  stance: TakeStance;
  one_liner: string;            // 6-14 words
}

export function synthesizeOperatorTake(args: {
  repo: Repo;
  community: RepoCommunityProfile | null;
  verdicts: VerdictPanel;
}): OperatorTake[] {
  const { repo, community, verdicts } = args;
  const topics = repo.topics ?? [];
  const isAi = topicMatches(topics, AI_TOPIC_HINTS);
  const isDev = topicMatches(topics, DEVTOOL_TOPIC_HINTS);
  const isAuto = topicMatches(topics, AUTOMATION_HINTS);
  const productionReady = verdicts.productionReadiness.level === "high";
  const trendStrong = verdicts.trendStrength.level === "high";
  const stars = repo.stars ?? 0;

  const takes: OperatorTake[] = [];

  // AI founders
  takes.push((() => {
    if (isAi && trendStrong) {
      return {
        audience: "AI founders",
        stance: "care",
        one_liner: "Category-on. Worth a 30-min teardown this week.",
      };
    }
    if (isAi) {
      return {
        audience: "AI founders",
        stance: "watch",
        one_liner: "In the right category but signal is still early.",
      };
    }
    return {
      audience: "AI founders",
      stance: "skip",
      one_liner: "Not directly in the AI agent stack.",
    };
  })());

  // Devtool teams
  takes.push((() => {
    if (isDev && productionReady) {
      return {
        audience: "Devtool teams",
        stance: "care",
        one_liner: "Mature enough to evaluate as a dependency or competitor.",
      };
    }
    if (isDev) {
      return {
        audience: "Devtool teams",
        stance: "watch",
        one_liner: "Developer-tools category — track until v1 ships.",
      };
    }
    return {
      audience: "Devtool teams",
      stance: "skip",
      one_liner: "Not in the devtool surface area.",
    };
  })());

  // Investors / scouts
  takes.push((() => {
    if (trendStrong && (isAi || isDev)) {
      return {
        audience: "Investors / scouts",
        stance: "care",
        one_liner: "Real cross-source signal in a hot category. Worth a meeting.",
      };
    }
    if (trendStrong) {
      return {
        audience: "Investors / scouts",
        stance: "watch",
        one_liner: "Trending hard but category fit unclear.",
      };
    }
    if (stars >= 5000) {
      return {
        audience: "Investors / scouts",
        stance: "watch",
        one_liner: "Mature OSS — track for commercial offshoot.",
      };
    }
    return {
      audience: "Investors / scouts",
      stance: "skip",
      one_liner: "Too early, signal not yet repeatable.",
    };
  })());

  // Indie hackers
  takes.push((() => {
    if (isAuto || (isAi && isDev)) {
      return {
        audience: "Indie hackers",
        stance: "care",
        one_liner: "Build wedge — wrap this into a paid product.",
      };
    }
    if (isAi || isDev) {
      return {
        audience: "Indie hackers",
        stance: "watch",
        one_liner: "Useful primitive — pin it to your inspiration board.",
      };
    }
    return {
      audience: "Indie hackers",
      stance: "skip",
      one_liner: "No obvious monetizable wedge here.",
    };
  })());

  // Enterprise buyers (only when relevant)
  if (productionReady && (isAi || isDev) && community?.license?.spdxId) {
    takes.push({
      audience: "Enterprise buyers",
      stance: "watch",
      one_liner: `Licensed (${community.license.spdxId}), shippable, but volume support unclear.`,
    });
  }

  return takes;
}

// ---------------------------------------------------------------------------
// Suggested alerts — preset row objects + a CTA href.
// ---------------------------------------------------------------------------

export interface AlertPreset {
  id: string;
  label: string;        // human-readable
  rationale: string;    // why this alert makes sense for THIS repo
  recommended: boolean; // we mark the top 2-3 as "recommended"
}

export function suggestAlerts(args: {
  repo: Repo;
  community: RepoCommunityProfile | null;
  verdicts: VerdictPanel;
}): AlertPreset[] {
  const { repo, verdicts } = args;
  const topics = repo.topics ?? [];
  const isAi = topicMatches(topics, AI_TOPIC_HINTS);

  const all: AlertPreset[] = [
    {
      id: "stars-20-24h",
      label: "Stars grow > 20% in 24h",
      rationale: "catches breakout velocity before it shows up in charts",
      recommended: verdicts.trendStrength.level !== "low",
    },
    {
      id: "release",
      label: "A new release ships",
      rationale: repo.lastReleaseTag
        ? `last tag was ${repo.lastReleaseTag} — track when the next ships`
        : "no release yet — first tag is a major maturity signal",
      recommended: !repo.lastReleaseTag || verdicts.productionReadiness.level !== "high",
    },
    {
      id: "hn-reddit-spike",
      label: "HN or Reddit mentions spike",
      rationale: "external validation arriving outside GitHub",
      recommended: (repo.channelsFiring ?? 0) < 4,
    },
    {
      id: "similar-trending",
      label: "Similar repos start trending",
      rationale: "category-level move — bigger than this single repo",
      recommended: isAi,
    },
    {
      id: "maintainer-burst",
      label: "Maintainer commit cadence jumps",
      rationale: "signal that the team is shipping toward a milestone",
      recommended: verdicts.repoHealth.level === "medium",
    },
    {
      id: "funding",
      label: "Funding signal detected for the org",
      rationale: "commercial offshoot likely — early access window",
      recommended: false,
    },
  ];

  // Bring recommended to the top, preserving relative order otherwise.
  return all.sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

// ---------------------------------------------------------------------------
// Repo health card — grouped real metrics with clear "production ready vs hype"
// readout.
// ---------------------------------------------------------------------------

export interface HealthMetric {
  label: string;
  value: string;
  level: "up" | "warn" | "down" | "muted";
  detail?: string;
}

export interface RepoHealthGroup {
  verdict: Verdict;            // re-uses the verdicts.repoHealth label
  productionLine: string;      // 1-sentence "is this production ready?"
  metrics: HealthMetric[];
}

export function computeRepoHealth(args: {
  repo: Repo;
  community: RepoCommunityProfile | null;
  events: NormalizedGithubEvent[];
  verdicts: VerdictPanel;
}): RepoHealthGroup {
  const { repo, community, events, verdicts } = args;
  const nowMs = Date.now();
  const lastCommitDays = daysSince(repo.lastCommitAt, nowMs);
  const lastReleaseDays = daysSince(repo.lastReleaseAt, nowMs);
  const contributors = repo.contributors ?? 0;
  const openIssues = repo.openIssues ?? 0;
  const openPulls = community?.openPullsCount ?? 0;
  const license = community?.license;
  const health = community?.health ?? null;
  const readmePresent =
    Boolean(community?.readmePresent) || Boolean(community?.readmeMarkdown);

  const releaseEvents = events.filter((e) => e.type === "ReleaseEvent");
  const issueEvents = events.filter((e) => e.type === "IssuesEvent");
  const pullEvents = events.filter((e) => e.type === "PullRequestEvent");

  const metrics: HealthMetric[] = [
    {
      label: "License",
      value: license?.spdxId ?? "—",
      level: license?.spdxId ? "up" : "down",
      detail: license?.name ?? "no license file detected",
    },
    {
      label: "Last commit",
      value:
        lastCommitDays === Infinity
          ? "—"
          : lastCommitDays === 0
            ? "today"
            : `${lastCommitDays}d ago`,
      level:
        lastCommitDays < 14 ? "up" : lastCommitDays < 60 ? "warn" : "down",
    },
    {
      label: "Latest release",
      value: repo.lastReleaseTag ?? "no tag yet",
      level: repo.lastReleaseTag
        ? lastReleaseDays < 90
          ? "up"
          : lastReleaseDays < 365
            ? "warn"
            : "down"
        : "down",
      detail:
        lastReleaseDays === Infinity || !repo.lastReleaseTag
          ? undefined
          : `${lastReleaseDays}d ago`,
    },
    {
      label: "Contributors",
      value: contributors.toLocaleString(),
      level: contributors >= 10 ? "up" : contributors >= 3 ? "warn" : "down",
      detail:
        contributors <= 1
          ? "bus factor ~1 — single-maintainer risk"
          : contributors <= 3
            ? `bus factor ~${contributors} — concentrated`
            : undefined,
    },
    {
      label: "Open issues",
      value: openIssues.toLocaleString(),
      level: openIssues < 50 ? "up" : openIssues < 250 ? "warn" : "down",
      detail: `${issueEvents.length} issue events tracked`,
    },
    {
      label: "Open PRs",
      value: openPulls.toLocaleString(),
      level: openPulls < 25 ? "up" : openPulls < 100 ? "warn" : "down",
      detail: `${pullEvents.length} PR events tracked`,
    },
    {
      label: "Releases tracked",
      value: releaseEvents.length.toLocaleString(),
      level: releaseEvents.length >= 1 ? "up" : "down",
    },
    {
      label: "README",
      value: readmePresent ? "present" : "missing",
      level: readmePresent ? "up" : "down",
    },
    {
      label: "Community health",
      value: health !== null ? `${health}%` : "—",
      level: health === null ? "muted" : health >= 80 ? "up" : health >= 40 ? "warn" : "down",
    },
  ];

  // Production-ready / Early / Experimental line — drive from verdicts.
  const productionLine = (() => {
    const v = verdicts.productionReadiness;
    if (v.level === "high") {
      return `Production-ready — ${v.reason}.`;
    }
    if (v.level === "medium") {
      return `Early but shippable — ${v.reason}.`;
    }
    return `Experimental — ${v.reason}. Treat as research-grade.`;
  })();

  return {
    verdict: verdicts.repoHealth,
    productionLine,
    metrics,
  };
}

// ---------------------------------------------------------------------------
// Ecosystem context — categorisation + related-repos framing.
// ---------------------------------------------------------------------------

export interface EcosystemContext {
  category: string;             // "AI agents" / "Devtools" / "Automation" / "Other"
  spike_or_market: "spike" | "market" | "unknown";
  spike_explanation: string;    // 1-2 sentences
}

export function computeEcosystemContext(args: {
  repo: Repo;
  verdicts: VerdictPanel;
}): EcosystemContext {
  const { repo, verdicts } = args;
  const topics = repo.topics ?? [];
  const isAi = topicMatches(topics, AI_TOPIC_HINTS);
  const isDev = topicMatches(topics, DEVTOOL_TOPIC_HINTS);
  const isAuto = topicMatches(topics, AUTOMATION_HINTS);

  const category = isAi
    ? isDev
      ? "AI × Devtools"
      : isAuto
        ? "AI × Automation"
        : "AI agents / LLM tooling"
    : isDev
      ? "Developer tools"
      : isAuto
        ? "Automation"
        : "General";

  const channels = repo.channelsFiring ?? 0;
  const trend = verdicts.trendStrength.level;

  let spike: "spike" | "market" | "unknown";
  let spike_explanation: string;

  if (trend === "high" && channels >= 4) {
    spike = "market";
    spike_explanation =
      "Multiple channels firing in parallel — this is part of a category-level move, not a one-off post.";
  } else if (channels >= 2 && trend !== "low") {
    spike = "market";
    spike_explanation =
      "Cross-source mentions suggest broader interest in the category, not just this repo.";
  } else if (channels === 1) {
    spike = "spike";
    spike_explanation =
      "Signal concentrated on a single channel — could be a one-off post rather than a market move.";
  } else if (trend === "low") {
    spike = "unknown";
    spike_explanation =
      "Not enough cross-source signal yet to tell whether this is a one-off spike or category breakout.";
  } else {
    spike = "unknown";
    spike_explanation =
      "Mixed signal — track for another week before calling it.";
  }

  return { category, spike_or_market: spike, spike_explanation };
}
