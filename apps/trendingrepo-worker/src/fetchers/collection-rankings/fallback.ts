import { readDataStore } from '../../lib/redis.js';
import seedRankings from './seed.json' with { type: 'json' };

export interface CollectionRef {
  id: number;
  slug: string;
}

export const COLLECTIONS: CollectionRef[] = [
  { id: 10139, slug: 'a2a-protocol' },
  { id: 10141, slug: 'agent-harness' },
  { id: 10124, slug: 'agent-skills' },
  { id: 10098, slug: 'ai-agent-frameworks' },
  { id: 10114, slug: 'ai-agent-memory' },
  { id: 10113, slug: 'ai-browser-agents' },
  { id: 10136, slug: 'ai-code-review' },
  { id: 10112, slug: 'ai-coding-assistants' },
  { id: 10130, slug: 'ai-finops' },
  { id: 10127, slug: 'ai-governance' },
  { id: 10125, slug: 'ai-infrastructure' },
  { id: 10135, slug: 'ai-observability' },
  { id: 10116, slug: 'ai-safety-alignment' },
  { id: 10122, slug: 'ai-video-generation' },
  { id: 10010, slug: 'artificial-intelligence' },
  { id: 10075, slug: 'chatgpt-alternatives' },
  { id: 10078, slug: 'chatgpt-apps' },
  { id: 10106, slug: 'coding-agents' },
  { id: 10126, slug: 'edge-ai' },
  { id: 10134, slug: 'knowledge-graphs-for-ai' },
  { id: 10110, slug: 'llm-finetuning' },
  { id: 10109, slug: 'llm-inference-engines' },
  { id: 10076, slug: 'llm-tools' },
  { id: 10105, slug: 'mcp-servers' },
  { id: 10121, slug: 'model-compression' },
  { id: 10118, slug: 'multimodal-ai' },
  { id: 10108, slug: 'rag-frameworks' },
  { id: 10117, slug: 'vector-databases' },
];

export const METRICS = ['stars', 'issues'] as const;
export type Metric = (typeof METRICS)[number];

export interface NormalizedRankingRow {
  repoId: number | null;
  repoName: string;
  currentPeriodGrowth: number | null;
  pastPeriodGrowth: number | null;
  growthPop: number | null;
  rankPop: number | null;
  total: number | null;
  currentPeriodRank: number | null;
  pastPeriodRank: number | null;
}

export interface CollectionRankingsPayload {
  fetchedAt: string;
  period: string;
  collections: Record<string, Record<Metric, NormalizedRankingRow[]>>;
  status?: 'ok' | 'degraded';
  dataAsOf?: string | null;
  errors?: Array<{ stage: string; message: string }>;
  source?: string;
}

interface RepoMetadataItem {
  githubId?: number | null;
  fullName?: string;
  stars?: number;
  forks?: number;
  openIssues?: number;
}

interface RepoMetadataPayload {
  fetchedAt?: string;
  items?: RepoMetadataItem[];
}

interface StarActivityDeltaValue {
  value?: number | null;
  basis?: string;
}

interface StarActivityDeltaEntry {
  stars_now?: number;
  delta_30d?: StarActivityDeltaValue;
}

interface StarActivityDeltasPayload {
  computedAt?: string;
  repos?: Record<string, StarActivityDeltaEntry>;
}

export interface GithubCollectionFallbackSources {
  repoMetadata: RepoMetadataPayload | null;
  starActivityDeltas: StarActivityDeltasPayload | null;
}

export const SEED_COLLECTION_RANKINGS =
  seedRankings as unknown as CollectionRankingsPayload;

function finiteNumber(value: unknown): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveDelta(value: StarActivityDeltaValue | undefined): number {
  const parsed = finiteNumber(value?.value);
  return parsed > 0 ? parsed : 0;
}

function lowerFullName(value: unknown): string {
  const fullName = String(value ?? '').trim().toLowerCase();
  return fullName.includes('/') ? fullName : '';
}

function titleizeCollection(slug: string): string {
  const acronyms = new Map([
    ['a2a', 'A2A'],
    ['ai', 'AI'],
    ['llm', 'LLM'],
    ['mcp', 'MCP'],
    ['rag', 'RAG'],
  ]);
  return slug
    .split('-')
    .map((part) => acronyms.get(part) ?? part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function previousRank(
  seedRows: NormalizedRankingRow[],
  repoName: string,
): number | null {
  return (
    seedRows.find(
      (row) => row.repoName.toLowerCase() === repoName.toLowerCase(),
    )?.currentPeriodRank ?? null
  );
}

function withRanks(
  rows: NormalizedRankingRow[],
  seedRows: NormalizedRankingRow[],
): NormalizedRankingRow[] {
  return rows
    .sort((a, b) => {
      const growthDelta =
        (b.currentPeriodGrowth ?? 0) - (a.currentPeriodGrowth ?? 0);
      if (growthDelta !== 0) return growthDelta;
      const totalDelta = (b.total ?? 0) - (a.total ?? 0);
      if (totalDelta !== 0) return totalDelta;
      return a.repoName.localeCompare(b.repoName);
    })
    .slice(0, 50)
    .map((row, index) => {
      const currentRank = index + 1;
      const priorRank = previousRank(seedRows, row.repoName);
      return {
        ...row,
        currentPeriodRank: currentRank,
        pastPeriodRank: priorRank,
        rankPop: priorRank === null ? null : priorRank - currentRank,
      };
    });
}

export function rankingRows(
  payload: CollectionRankingsPayload | null | undefined,
  collectionId: string,
  metric: Metric,
): NormalizedRankingRow[] {
  return payload?.collections?.[collectionId]?.[metric] ?? [];
}

export function countRankingRows(
  payload: CollectionRankingsPayload | null | undefined,
): number {
  if (!payload?.collections) return 0;
  let count = 0;
  for (const collection of Object.values(payload.collections)) {
    for (const metric of METRICS) {
      count += collection[metric]?.length ?? 0;
    }
  }
  return count;
}

export function buildGithubCollectionRankingsFallback(
  sources: GithubCollectionFallbackSources,
  fetchedAt: string,
): CollectionRankingsPayload | null {
  const metadataByName = new Map<string, RepoMetadataItem>();
  for (const item of sources.repoMetadata?.items ?? []) {
    const key = lowerFullName(item.fullName);
    if (key) metadataByName.set(key, item);
  }
  const deltas = sources.starActivityDeltas?.repos ?? {};

  if (metadataByName.size === 0 && Object.keys(deltas).length === 0) {
    return null;
  }

  const collections = {} as Record<string, Record<Metric, NormalizedRankingRow[]>>;
  for (const collection of COLLECTIONS) {
    const id = String(collection.id);
    const starsSeed = rankingRows(SEED_COLLECTION_RANKINGS, id, 'stars');
    const issuesSeed = rankingRows(SEED_COLLECTION_RANKINGS, id, 'issues');
    const seedByName = new Map<string, NormalizedRankingRow>();
    for (const row of [...starsSeed, ...issuesSeed]) {
      const key = lowerFullName(row.repoName);
      if (key && !seedByName.has(key)) seedByName.set(key, row);
    }

    const starsRows: NormalizedRankingRow[] = [];
    const issuesRows: NormalizedRankingRow[] = [];
    for (const [key, seed] of seedByName.entries()) {
      const meta = metadataByName.get(key);
      const delta = deltas[key];
      if (!meta && !delta) continue;

      const starsNow = finiteNumber(delta?.stars_now ?? meta?.stars ?? seed.total);
      const starGrowth = positiveDelta(delta?.delta_30d);
      const openIssues = finiteNumber(meta?.openIssues);
      const repoId = meta?.githubId ?? seed.repoId ?? null;
      const repoName = meta?.fullName ?? seed.repoName;

      starsRows.push({
        repoId,
        repoName,
        currentPeriodGrowth: starGrowth > 0 ? starGrowth : starsNow,
        pastPeriodGrowth: seed.pastPeriodGrowth,
        growthPop: null,
        rankPop: null,
        total: starsNow,
        currentPeriodRank: null,
        pastPeriodRank: null,
      });
      issuesRows.push({
        repoId,
        repoName,
        currentPeriodGrowth: openIssues,
        pastPeriodGrowth: seed.pastPeriodGrowth,
        growthPop: null,
        rankPop: null,
        total: openIssues,
        currentPeriodRank: null,
        pastPeriodRank: null,
      });
    }

    collections[id] = {
      stars: withRanks(starsRows, starsSeed),
      issues: withRanks(issuesRows, issuesSeed),
    };
  }

  const payload: CollectionRankingsPayload = {
    fetchedAt,
    period: SEED_COLLECTION_RANKINGS.period,
    collections,
    status: 'ok',
    dataAsOf: fetchedAt,
    source: 'github-metadata-fallback',
  };
  return countRankingRows(payload) > 0 ? payload : null;
}

export function buildHotCollectionsFromRankings(
  payload: CollectionRankingsPayload | null | undefined,
  maxReposPerCollection = 3,
): Array<{
  id: number | null;
  name: string;
  repos: number | null;
  repoId: number | null;
  repoName: string;
  repoCurrentPeriodRank: number | null;
  repoPastPeriodRank: number | null;
  repoRankChanges: number | null;
}> {
  if (!payload) return [];
  const rows: Array<{
    id: number | null;
    name: string;
    repos: number | null;
    repoId: number | null;
    repoName: string;
    repoCurrentPeriodRank: number | null;
    repoPastPeriodRank: number | null;
    repoRankChanges: number | null;
  }> = [];

  for (const collection of COLLECTIONS) {
    const stars = rankingRows(payload, String(collection.id), 'stars')
      .slice()
      .sort((a, b) => {
        const rankDelta =
          (a.currentPeriodRank ?? Number.MAX_SAFE_INTEGER) -
          (b.currentPeriodRank ?? Number.MAX_SAFE_INTEGER);
        if (rankDelta !== 0) return rankDelta;
        return a.repoName.localeCompare(b.repoName);
      });
    for (const row of stars.slice(0, maxReposPerCollection)) {
      rows.push({
        id: collection.id,
        name: titleizeCollection(collection.slug),
        repos: stars.length,
        repoId: row.repoId,
        repoName: row.repoName,
        repoCurrentPeriodRank: row.currentPeriodRank,
        repoPastPeriodRank: row.pastPeriodRank,
        repoRankChanges:
          row.rankPop === null || row.rankPop === undefined
            ? null
            : row.rankPop,
      });
    }
  }

  return rows;
}

async function safeReadDataStore<T>(slug: string): Promise<T | null> {
  try {
    return (await readDataStore<T>(slug)) ?? null;
  } catch {
    return null;
  }
}

export async function readGithubCollectionFallbackSources(): Promise<GithubCollectionFallbackSources> {
  const [repoMetadata, starActivityDeltas] = await Promise.all([
    safeReadDataStore<RepoMetadataPayload>('repo-metadata'),
    safeReadDataStore<StarActivityDeltasPayload>('star-activity-deltas'),
  ]);
  return { repoMetadata, starActivityDeltas };
}
