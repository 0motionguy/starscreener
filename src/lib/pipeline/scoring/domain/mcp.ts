// TrendingRepo Pipeline — MCP domain scorer.
//
// Pure function. Stdio servers don't have HTTP liveness, so we drop the
// `livenessUptime7d` term and renormalize. Latency and downloads are
// optional; missing inputs drop their term cleanly.

import { clamp } from "../../../utils";
import { logNorm } from "../normalize";
import type { DomainItem, DomainScorer, ScoredItem } from "./types";
import {
  normalizeWeights,
  topContributorsExplanation,
  weightedSum,
} from "./types";

export interface McpItem extends DomainItem {
  domainKey: "mcp";
  npmDownloads7d?: number;
  pypiDownloads7d?: number;
  livenessUptime7d?: number; // 0..1
  livenessInferred?: boolean;
  toolCount?: number;
  smitheryRank?: number;
  smitheryTotal?: number;
  npmDependents?: number;
  crossSourceCount?: number;
  p50LatencyMs?: number;
  isStdio?: boolean;
  /** ISO timestamp of the last npm/pypi release — feeds lastReleaseRecency. */
  lastReleaseAt?: string;
}

const COMPONENT_LABELS: Record<string, string> = {
  downloadsCombined7d: "downloads 7d",
  installsAbs: "installs abs",
  starsAbs: "stars abs",
  livenessUptime7d: "uptime",
  toolCount: "tools",
  smitheryRankInverse: "smithery rank",
  npmDependents: "dependents",
  crossSourceCount: "sources",
  latencyInverse: "latency",
  lastReleaseRecency: "release recency",
};

// `installsAbs` and `starsAbs` are cold-start fallbacks — they fire only
// when their stronger counterparts are absent. Smaller weights than the
// primary signals because absolute snapshots are noisier than 7d deltas.
const DEFAULT_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  downloadsCombined7d: 0.25,
  installsAbs: 0.15,
  starsAbs: 0.10,
  livenessUptime7d: 0.20,
  toolCount: 0.15,
  smitheryRankInverse: 0.15,
  npmDependents: 0.10,
  crossSourceCount: 0.05,
  latencyInverse: 0.05,
  lastReleaseRecency: 0.05,
});

function toolCountScore(toolCount: number): number {
  const safe = Math.max(0, toolCount);
  const score = (Math.log(safe + 1) / Math.log(20)) * 100;
  return clamp(score, 0, 100);
}

/**
 * lastReleaseRecency: 100 if last release within 30 days, then linear
 * taper to 0 at 365 days. Returns null when the timestamp is unparseable
 * so callers can drop the term and renormalize.
 */
function lastReleaseRecencyScore(isoDate: string): number | null {
  const ts = Date.parse(isoDate);
  if (!Number.isFinite(ts)) return null;
  const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (days <= 30) return 100;
  if (days >= 365) return 0;
  // Linear taper from 100 at day 30 to 0 at day 365.
  const frac = (365 - days) / (365 - 30);
  return clamp(frac * 100, 0, 100);
}

function computeOne(item: McpItem): ScoredItem<McpItem> {
  const components: Record<string, number> = {};
  const activeWeights: Record<string, number> = {};

  // downloadsCombined7d (0.25): both undefined → drop
  const hasNpm = item.npmDownloads7d !== undefined;
  const hasPypi = item.pypiDownloads7d !== undefined;
  const downloadsSum = (item.npmDownloads7d ?? 0) + (item.pypiDownloads7d ?? 0);
  if (hasNpm || hasPypi) {
    components.downloadsCombined7d = logNorm(downloadsSum, 50000);
    activeWeights.downloadsCombined7d = DEFAULT_WEIGHTS.downloadsCombined7d;
  } else if (item.installsTotal !== undefined && item.installsTotal > 0) {
    // installsAbs (0.15): cold-start fallback when neither npm nor pypi 7d
    // delta is available. Mutually exclusive with downloadsCombined7d.
    components.installsAbs = logNorm(item.installsTotal, 50_000);
    activeWeights.installsAbs = DEFAULT_WEIGHTS.installsAbs;
  } else if (item.stars !== undefined && item.stars > 0) {
    // starsAbs (0.10): final fallback when no install/download signal at
    // all. Lets brand-new MCPs with a popular GitHub repo still rank.
    components.starsAbs = logNorm(item.stars, 5_000);
    activeWeights.starsAbs = DEFAULT_WEIGHTS.starsAbs;
  }

  // livenessUptime7d (0.20): drop for stdio servers
  if (!item.isStdio) {
    components.livenessUptime7d = clamp(
      (item.livenessUptime7d ?? 0) * 100,
      0,
      100,
    );
    activeWeights.livenessUptime7d = DEFAULT_WEIGHTS.livenessUptime7d;
  }

  // toolCount (0.15): undefined → drop
  if (item.toolCount !== undefined) {
    components.toolCount = toolCountScore(item.toolCount);
    activeWeights.toolCount = DEFAULT_WEIGHTS.toolCount;
  }

  // smitheryRankInverse (0.15): require both rank + total>0
  if (
    item.smitheryRank !== undefined &&
    item.smitheryTotal !== undefined &&
    item.smitheryTotal > 0
  ) {
    const inv = (1 - item.smitheryRank / item.smitheryTotal) * 100;
    components.smitheryRankInverse = clamp(inv, 0, 100);
    activeWeights.smitheryRankInverse = DEFAULT_WEIGHTS.smitheryRankInverse;
  }

  // npmDependents (0.10): undefined → drop
  if (item.npmDependents !== undefined) {
    components.npmDependents = logNorm(item.npmDependents, 100);
    activeWeights.npmDependents = DEFAULT_WEIGHTS.npmDependents;
  }

  // crossSourceCount (0.10): always present (default 1)
  components.crossSourceCount =
    Math.min((item.crossSourceCount ?? 1) / 4, 1) * 100;
  activeWeights.crossSourceCount = DEFAULT_WEIGHTS.crossSourceCount;

  // latencyInverse (0.05): undefined → drop
  if (item.p50LatencyMs !== undefined) {
    const norm = clamp(item.p50LatencyMs / 2000, 0, 1);
    components.latencyInverse = (1 - norm) * 100;
    activeWeights.latencyInverse = DEFAULT_WEIGHTS.latencyInverse;
  }

  // lastReleaseRecency (0.05): drop when timestamp absent or unparseable.
  if (item.lastReleaseAt !== undefined) {
    const score = lastReleaseRecencyScore(item.lastReleaseAt);
    if (score !== null) {
      components.lastReleaseRecency = score;
      activeWeights.lastReleaseRecency = DEFAULT_WEIGHTS.lastReleaseRecency;
    }
  }

  const weights = normalizeWeights(activeWeights);
  const rawScore = clamp(weightedSum(components, weights), 0, 100);

  const primaryMetric =
    hasNpm || hasPypi
      ? { name: "downloads_7d", value: downloadsSum, label: "Downloads" }
      : item.installsTotal !== undefined && item.installsTotal > 0
        ? { name: "installs_total", value: item.installsTotal, label: "Installs" }
        : item.stars !== undefined && item.stars > 0
          ? { name: "stars", value: item.stars, label: "Stars" }
          : item.toolCount !== undefined
            ? { name: "tool_count", value: item.toolCount, label: "Tools" }
            : { name: "none", value: 0, label: "—" };

  const explanation = topContributorsExplanation(
    components,
    weights,
    COMPONENT_LABELS,
    rawScore,
  );

  return {
    item,
    rawComponents: components,
    weights,
    rawScore,
    primaryMetric,
    explanation,
  };
}

export const mcpScorer: DomainScorer<McpItem> = {
  domainKey: "mcp",
  defaultWeights: DEFAULT_WEIGHTS,
  computeRaw(items: McpItem[]): ScoredItem<McpItem>[] {
    return items.map(computeOne);
  },
};
