// Compute the consensus-trending payload from the bundled / Redis-resident
// source feeds and write it back to the data-store.
//
// Mirrors the Railway worker fetcher
// (apps/trendingrepo-worker/src/fetchers/consensus-trending/) so /consensus
// has fresh data even when the worker isn't running. The scoring is ported
// inline from the worker — pure compute, no Redis or third-party deps.
//
// Run: `npm run compute:consensus`
// Cron: covered by snapshot-consensus daily; this script is the
// production-side hourly producer when the Railway worker is unavailable.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getDataStore } from "@/lib/data-store";

// --- Worker-mirrored types ---------------------------------------------------

type ConsensusInternalSource = "ours";
type ConsensusExternalSource =
  | "gh"
  | "hf"
  | "hn"
  | "x"
  | "r"
  | "pdh"
  | "dev"
  | "bs";
type ConsensusSource = ConsensusInternalSource | ConsensusExternalSource;
type ConsensusVerdictBand =
  | "strong_consensus"
  | "early_call"
  | "divergence"
  | "external_only"
  | "single_source";

interface ConsensusSourceInput {
  fullName: string;
  rank: number;
  score?: number;
}

interface ConsensusScoreInput {
  ours: ConsensusSourceInput[];
  gh: ConsensusSourceInput[];
  hf: ConsensusSourceInput[];
  hn: ConsensusSourceInput[];
  x: ConsensusSourceInput[];
  r: ConsensusSourceInput[];
  pdh: ConsensusSourceInput[];
  dev: ConsensusSourceInput[];
  bs: ConsensusSourceInput[];
  limit?: number;
}

interface ConsensusSourceComponent {
  present: boolean;
  rank: number | null;
  score: number | null;
  normalized: number;
}

interface ConsensusItem {
  fullName: string;
  rank: number;
  consensusScore: number;
  confidence: number;
  sourceCount: number;
  externalRank: number | null;
  oursRank: number | null;
  maxRankGap: number;
  verdict: ConsensusVerdictBand;
  sources: Record<ConsensusSource, ConsensusSourceComponent>;
}

interface ConsensusTrendingPayload {
  computedAt: string;
  itemCount: number;
  weights: Record<ConsensusExternalSource, number>;
  sourceStats: Record<ConsensusExternalSource, { count: number; rows: number }>;
  bandCounts: Record<ConsensusVerdictBand, number>;
  items: ConsensusItem[];
}

// --- Scoring (ported verbatim from worker scoring.ts) -----------------------

const CONSENSUS_WEIGHTS: Record<ConsensusExternalSource, number> = {
  gh: 0.20,
  hf: 0.18,
  hn: 0.16,
  x: 0.14,
  r: 0.10,
  pdh: 0.08,
  dev: 0.08,
  bs: 0.06,
};

const EXTERNAL_SOURCES: readonly ConsensusExternalSource[] = [
  "gh", "hf", "hn", "x", "r", "pdh", "dev", "bs",
] as const;

const ALL_SOURCES: readonly ConsensusSource[] = [
  "ours", ...EXTERNAL_SOURCES,
] as const;

const STRONG_MIN_SOURCES = 5;
const STRONG_MAX_GAP = 30;
const EARLY_OURS_LEAD = 20;
const DIVERGENCE_GAP = 30;

interface Candidate {
  fullName: string;
  lower: string;
  sources: Record<ConsensusSource, ConsensusSourceComponent>;
}

function emptyComponent(): ConsensusSourceComponent {
  return { present: false, rank: null, score: null, normalized: 0 };
}

function emptySources(): Record<ConsensusSource, ConsensusSourceComponent> {
  return Object.fromEntries(
    ALL_SOURCES.map((k) => [k, emptyComponent()]),
  ) as Record<ConsensusSource, ConsensusSourceComponent>;
}

function normalizeFullName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.includes("/")) return null;
  const [owner, name] = trimmed.split("/");
  if (!owner || !name) return null;
  return `${owner}/${name}`;
}

function rankToNormalized(rank: number): number {
  if (!Number.isFinite(rank) || rank <= 0) return 0;
  return 1 / Math.sqrt(rank);
}

function componentFor(row: ConsensusSourceInput, fallbackRank: number): ConsensusSourceComponent {
  const rank = Number.isFinite(row.rank) && row.rank > 0 ? Math.trunc(row.rank) : fallbackRank;
  return {
    present: true,
    rank,
    score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : null,
    normalized: rankToNormalized(rank),
  };
}

function upsertRows(
  candidates: Map<string, Candidate>,
  source: ConsensusSource,
  rows: ConsensusSourceInput[],
): void {
  rows.forEach((row, idx) => {
    const fullName = normalizeFullName(row.fullName);
    if (!fullName) return;
    const lower = fullName.toLowerCase();
    let candidate = candidates.get(lower);
    if (!candidate) {
      candidate = { fullName, lower, sources: emptySources() };
      candidates.set(lower, candidate);
    }
    const next = componentFor(row, idx + 1);
    const prev = candidate.sources[source];
    if (!prev.present || (next.rank ?? Infinity) < (prev.rank ?? Infinity)) {
      candidate.sources[source] = next;
    }
  });
}

function externalSourceCount(sources: Record<ConsensusSource, ConsensusSourceComponent>): number {
  return EXTERNAL_SOURCES.reduce((acc, k) => acc + (sources[k].present ? 1 : 0), 0);
}

function maxRankGap(sources: Record<ConsensusSource, ConsensusSourceComponent>): number {
  const ranks = EXTERNAL_SOURCES
    .map((k) => sources[k].rank)
    .filter((r): r is number => typeof r === "number");
  if (ranks.length < 2) return 0;
  return Math.max(...ranks) - Math.min(...ranks);
}

function concordanceFactor(sources: Record<ConsensusSource, ConsensusSourceComponent>): number {
  const ranks = EXTERNAL_SOURCES
    .map((k) => sources[k].rank)
    .filter((r): r is number => typeof r === "number");
  if (ranks.length < 2) return 1.0;
  const gap = Math.max(...ranks) - Math.min(...ranks);
  const factor = 1.0 - Math.min(1, gap / 100) * 0.4;
  return Math.max(0.6, Math.min(1.0, factor));
}

function externalWeightedScore(
  sources: Record<ConsensusSource, ConsensusSourceComponent>,
): number {
  let weighted = 0;
  for (const k of EXTERNAL_SOURCES) {
    weighted += sources[k].normalized * CONSENSUS_WEIGHTS[k];
  }
  return weighted;
}

function consensusScore(sources: Record<ConsensusSource, ConsensusSourceComponent>): number {
  const weighted = externalWeightedScore(sources);
  const count = externalSourceCount(sources);
  const coverageBonus = count >= STRONG_MIN_SOURCES ? 0.15 : count >= 3 ? 0.08 : 0;
  return Math.max(0, Math.min(100, (weighted + coverageBonus) * 100));
}

function confidenceFor(sources: Record<ConsensusSource, ConsensusSourceComponent>): number {
  let weightSum = 0;
  for (const k of EXTERNAL_SOURCES) {
    if (sources[k].present) weightSum += CONSENSUS_WEIGHTS[k];
  }
  const factor = concordanceFactor(sources);
  return Math.max(0, Math.min(100, Math.round(weightSum * factor * 100)));
}

function classifyVerdict(
  sources: Record<ConsensusSource, ConsensusSourceComponent>,
  oursRank: number | null,
  externalRank: number | null,
): ConsensusVerdictBand {
  const count = externalSourceCount(sources);
  const oursPresent = sources.ours.present;
  const gap = maxRankGap(sources);

  if (count >= STRONG_MIN_SOURCES && gap <= STRONG_MAX_GAP) {
    return "strong_consensus";
  }
  if (
    oursPresent &&
    typeof oursRank === "number" &&
    typeof externalRank === "number" &&
    oursRank + EARLY_OURS_LEAD <= externalRank
  ) {
    return "early_call";
  }
  if (count >= 2 && gap > DIVERGENCE_GAP) {
    return "divergence";
  }
  if (!oursPresent && count >= 2) {
    return "external_only";
  }
  return "single_source";
}

function scoreConsensus(input: ConsensusScoreInput): ConsensusItem[] {
  const candidates = new Map<string, Candidate>();
  upsertRows(candidates, "ours", input.ours);
  for (const k of EXTERNAL_SOURCES) {
    upsertRows(candidates, k, input[k]);
  }

  const scored = Array.from(candidates.values()).map((c) => ({
    candidate: c,
    score: consensusScore(c.sources),
  }));

  const externalOrdered = [...scored].sort((a, b) => {
    const aWeighted = externalWeightedScore(a.candidate.sources);
    const bWeighted = externalWeightedScore(b.candidate.sources);
    if (bWeighted !== aWeighted) return bWeighted - aWeighted;
    const aCount = externalSourceCount(a.candidate.sources);
    const bCount = externalSourceCount(b.candidate.sources);
    if (bCount !== aCount) return bCount - aCount;
    return a.candidate.fullName.localeCompare(b.candidate.fullName);
  });
  const externalRankByLower = new Map<string, number>();
  externalOrdered.forEach((entry, idx) => {
    if (externalSourceCount(entry.candidate.sources) > 0) {
      externalRankByLower.set(entry.candidate.lower, idx + 1);
    }
  });

  const items: ConsensusItem[] = scored.map(({ candidate, score }) => {
    const oursRank = candidate.sources.ours.rank ?? null;
    const externalRank = externalRankByLower.get(candidate.lower) ?? null;
    const verdict = classifyVerdict(candidate.sources, oursRank, externalRank);
    return {
      fullName: candidate.fullName,
      rank: 0,
      consensusScore: Math.round(score * 10) / 10,
      confidence: confidenceFor(candidate.sources),
      sourceCount: externalSourceCount(candidate.sources),
      externalRank,
      oursRank,
      maxRankGap: maxRankGap(candidate.sources),
      verdict,
      sources: candidate.sources,
    };
  });

  items.sort((a, b) => {
    if (b.consensusScore !== a.consensusScore) return b.consensusScore - a.consensusScore;
    if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
    return a.fullName.localeCompare(b.fullName);
  });

  const limit = Math.max(0, Math.trunc(input.limit ?? Number.POSITIVE_INFINITY));
  const truncated = items.slice(0, Math.min(limit, items.length));
  truncated.forEach((item, idx) => {
    item.rank = idx + 1;
  });
  return truncated;
}

function bandCounts(items: ConsensusItem[]): Record<ConsensusVerdictBand, number> {
  const counts: Record<ConsensusVerdictBand, number> = {
    strong_consensus: 0,
    early_call: 0,
    divergence: 0,
    external_only: 0,
    single_source: 0,
  };
  for (const item of items) counts[item.verdict] += 1;
  return counts;
}

// --- Source readers ---------------------------------------------------------

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

interface EngagementCompositePayload {
  items?: Array<{ fullName?: string; rank?: number; compositeScore?: number }>;
}
interface OssTrendingPayload {
  buckets?: Record<string, Record<string, Array<{ repo_name?: string; total_score?: string | number }>>>;
}
interface HfTrendingPayload {
  models?: Array<{ id?: string; rank?: number; trendingScore?: number }>;
}
interface LeaderboardEntry {
  fullName?: string;
  count7d?: number;
  scoreSum7d?: number;
  upvotes7d?: number;
  likesSum7d?: number;
  reactionsSum7d?: number;
}
interface MentionsPayload {
  leaderboard?: LeaderboardEntry[];
}
interface ProductHuntPayload {
  launches?: Array<{ id?: string; linkedRepo?: string | null; votesCount?: number }>;
}
interface TwitterTrendingPayload {
  items?: Array<{ fullName?: string; rank?: number; mentions?: number; impressions?: number }>;
}

function fromEngagement(p: EngagementCompositePayload | null): ConsensusSourceInput[] {
  const items = Array.isArray(p?.items) ? p.items : [];
  return items
    .map((item, idx) => ({
      fullName: String(item.fullName ?? ""),
      rank: typeof item.rank === "number" ? item.rank : idx + 1,
      score: toNumber(item.compositeScore),
    }))
    .filter((it) => it.fullName.includes("/"));
}

function fromOss(p: OssTrendingPayload | null): ConsensusSourceInput[] {
  const rows = p?.buckets?.past_24_hours?.All ?? [];
  return rows
    .map((row, idx) => ({
      fullName: String(row.repo_name ?? ""),
      rank: idx + 1,
      score: toNumber(row.total_score),
    }))
    .filter((it) => it.fullName.includes("/"));
}

function fromHf(p: HfTrendingPayload | null): ConsensusSourceInput[] {
  const rows = Array.isArray(p?.models) ? p.models : [];
  return rows
    .map((row, idx) => ({
      fullName: String(row.id ?? ""),
      rank: typeof row.rank === "number" ? row.rank : idx + 1,
      score: toNumber(row.trendingScore),
    }))
    .filter((it) => it.fullName.includes("/"));
}

function fromLeaderboard(
  p: MentionsPayload | null,
  scoreField: keyof LeaderboardEntry,
): ConsensusSourceInput[] {
  const rows = Array.isArray(p?.leaderboard) ? p.leaderboard : [];
  const sorted = rows
    .filter((row): row is LeaderboardEntry => Boolean(row?.fullName?.includes("/")))
    .map((row) => ({ row, sortKey: toNumber(row[scoreField]) ?? 0 }))
    .sort((a, b) => b.sortKey - a.sortKey);
  return sorted.map((entry, idx) => ({
    fullName: String(entry.row.fullName),
    rank: idx + 1,
    score: entry.sortKey,
  }));
}

function fromProductHunt(p: ProductHuntPayload | null): ConsensusSourceInput[] {
  const rows = Array.isArray(p?.launches) ? p.launches : [];
  const byRepo = new Map<string, number>();
  for (const launch of rows) {
    const linked = launch.linkedRepo;
    if (!linked || !linked.includes("/")) continue;
    const lower = linked.toLowerCase();
    byRepo.set(lower, (byRepo.get(lower) ?? 0) + (toNumber(launch.votesCount) ?? 1));
  }
  const sorted = Array.from(byRepo.entries())
    .map(([fullName, votes]) => ({ fullName, votes }))
    .sort((a, b) => b.votes - a.votes);
  return sorted.map((entry, idx) => ({
    fullName: entry.fullName,
    rank: idx + 1,
    score: entry.votes,
  }));
}

function fromTwitter(p: TwitterTrendingPayload | null): ConsensusSourceInput[] {
  const rows = Array.isArray(p?.items) ? p.items : [];
  return rows
    .map((row, idx) => ({
      fullName: String(row.fullName ?? ""),
      rank: typeof row.rank === "number" ? row.rank : idx + 1,
      score: toNumber(row.mentions ?? row.impressions),
    }))
    .filter((it) => it.fullName.includes("/"));
}

// --- Main -------------------------------------------------------------------

const TOP_LIMIT = 200;

// --- Twitter aggregation -----------------------------------------------------
// The Apify Twitter collector publishes per-repo signal records to
// .data/twitter-repo-signals.jsonl but never folds them into a ranked
// `twitter-trending` data-store key — which is what the consensus engine
// reads. Without this step, the `x` source contributes 0 to consensus
// even though hundreds of real signals exist on disk.

interface TwitterSignalRecord {
  githubFullName?: string;
  updatedAt?: string;
  metrics?: { mentionCount24h?: number; engagementTotal?: number };
  score?: { finalTwitterScore?: number };
}

interface TwitterTrendingItem {
  fullName: string;
  rank: number;
  mentions: number;
  impressions: number;
  finalTwitterScore: number;
  updatedAt: string;
  updatedAtMs: number;
}

function aggregateTwitterSignals(): TwitterTrendingPayloadOut {
  const path = resolve(process.cwd(), ".data", "twitter-repo-signals.jsonl");
  const byLower = new Map<string, TwitterTrendingItem>();
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { fetchedAt: new Date().toISOString(), source: "twitter-repo-signals.jsonl", count: 0, items: [] };
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: TwitterSignalRecord;
    try {
      rec = JSON.parse(trimmed) as TwitterSignalRecord;
    } catch {
      continue;
    }
    const fullName = rec.githubFullName;
    if (!fullName || !fullName.includes("/")) continue;
    const lower = fullName.toLowerCase();
    const score = rec.score?.finalTwitterScore ?? 0;
    const mentions = rec.metrics?.mentionCount24h ?? 0;
    const impressions = rec.metrics?.engagementTotal ?? 0;
    const updatedAt = rec.updatedAt ?? "";
    const updatedAtMs = updatedAt ? Date.parse(updatedAt) : 0;
    const prev = byLower.get(lower);
    // Latest scan per repo wins. The previous max-score-wins rule froze
    // the 65 repos that hit finalTwitterScore=100 in the 2026-04-23 bulk
    // scan as eternal winners — no later (lower-score) record could
    // displace them, so the leaderboard never rotated. updatedAt is
    // always present on real records; ms=0 is the cold tiebreaker.
    if (!prev || updatedAtMs > prev.updatedAtMs) {
      byLower.set(lower, {
        fullName,
        rank: 0,
        mentions,
        impressions,
        finalTwitterScore: score,
        updatedAt,
        updatedAtMs,
      });
    }
  }
  // After per-repo dedup-to-latest, rank by Twitter signal strength so
  // the consensus engine sees the strongest current buzz first. Ties
  // broken by mentions then recency.
  const items = Array.from(byLower.values())
    .filter((it) => it.finalTwitterScore > 0 || it.mentions > 0)
    .sort(
      (a, b) =>
        b.finalTwitterScore - a.finalTwitterScore ||
        b.mentions - a.mentions ||
        b.updatedAtMs - a.updatedAtMs,
    );
  items.forEach((it, idx) => {
    it.rank = idx + 1;
  });
  return {
    fetchedAt: new Date().toISOString(),
    source: "twitter-repo-signals.jsonl",
    count: items.length,
    items,
  };
}

interface TwitterTrendingPayloadOut {
  fetchedAt: string;
  source: string;
  count: number;
  items: TwitterTrendingItem[];
}

async function main(): Promise<void> {
  const store = getDataStore();
  const startedAt = new Date().toISOString();
  console.log(`[compute-consensus] start at ${startedAt}`);

  // Step 1 — fold the per-repo Twitter JSONL into a ranked twitter-trending
  // payload so step 2 (consensus) sees it as a populated source feed.
  const twitterPayload = aggregateTwitterSignals();
  await store.write("twitter-trending", twitterPayload, { mirrorToFile: true });
  console.log(`[compute-consensus] aggregated twitter-trending: items=${twitterPayload.count}`);

  const [
    engagement,
    oss,
    hf,
    hnMentions,
    twitter,
    redditMentions,
    ph,
    devtoMentions,
    blueskyMentions,
  ] = await Promise.all([
    store.read<EngagementCompositePayload>("engagement-composite"),
    store.read<OssTrendingPayload>("trending"),
    store.read<HfTrendingPayload>("huggingface-trending"),
    store.read<MentionsPayload>("hackernews-repo-mentions"),
    store.read<TwitterTrendingPayload>("twitter-trending"),
    store.read<MentionsPayload>("reddit-mentions"),
    store.read<ProductHuntPayload>("producthunt-launches"),
    store.read<MentionsPayload>("devto-mentions"),
    store.read<MentionsPayload>("bluesky-mentions"),
  ]);

  const tier = (label: string, source: string, age: number, count: number) =>
    `[${label}] source=${source} age=${Math.floor(age / 1000)}s items=${count}`;

  const input: ConsensusScoreInput = {
    ours: fromEngagement(engagement.data),
    gh: fromOss(oss.data),
    hf: fromHf(hf.data),
    hn: fromLeaderboard(hnMentions.data, "scoreSum7d"),
    x: fromTwitter(twitter.data),
    r: fromLeaderboard(redditMentions.data, "upvotes7d"),
    pdh: fromProductHunt(ph.data),
    dev: fromLeaderboard(devtoMentions.data, "reactionsSum7d"),
    bs: fromLeaderboard(blueskyMentions.data, "likesSum7d"),
    limit: TOP_LIMIT,
  };

  console.log(tier("ours", engagement.source, engagement.ageMs, input.ours.length));
  console.log(tier("gh  ", oss.source, oss.ageMs, input.gh.length));
  console.log(tier("hf  ", hf.source, hf.ageMs, input.hf.length));
  console.log(tier("hn  ", hnMentions.source, hnMentions.ageMs, input.hn.length));
  console.log(tier("x   ", twitter.source, twitter.ageMs, input.x.length));
  console.log(tier("r   ", redditMentions.source, redditMentions.ageMs, input.r.length));
  console.log(tier("pdh ", ph.source, ph.ageMs, input.pdh.length));
  console.log(tier("dev ", devtoMentions.source, devtoMentions.ageMs, input.dev.length));
  console.log(tier("bs  ", blueskyMentions.source, blueskyMentions.ageMs, input.bs.length));

  const items = scoreConsensus(input);

  const sourceStats: Record<ConsensusExternalSource, { count: number; rows: number }> = {
    gh: { count: input.gh.length, rows: oss.data?.buckets?.past_24_hours?.All?.length ?? 0 },
    hf: { count: input.hf.length, rows: hf.data?.models?.length ?? 0 },
    hn: { count: input.hn.length, rows: hnMentions.data?.leaderboard?.length ?? 0 },
    x: { count: input.x.length, rows: twitter.data?.items?.length ?? 0 },
    r: { count: input.r.length, rows: redditMentions.data?.leaderboard?.length ?? 0 },
    pdh: { count: input.pdh.length, rows: ph.data?.launches?.length ?? 0 },
    dev: { count: input.dev.length, rows: devtoMentions.data?.leaderboard?.length ?? 0 },
    bs: { count: input.bs.length, rows: blueskyMentions.data?.leaderboard?.length ?? 0 },
  };

  const payload: ConsensusTrendingPayload = {
    computedAt: new Date().toISOString(),
    itemCount: items.length,
    weights: CONSENSUS_WEIGHTS,
    sourceStats,
    bandCounts: bandCounts(items),
    items,
  };

  await store.write("consensus-trending", payload, { mirrorToFile: true });

  console.log(
    `[compute-consensus] wrote consensus-trending: items=${items.length} bands=${JSON.stringify(payload.bandCounts)}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[compute-consensus] FAILED", err);
    process.exit(1);
  });
