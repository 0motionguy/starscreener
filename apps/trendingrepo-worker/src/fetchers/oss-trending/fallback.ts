import { readDataStore } from '../../lib/redis.js';

const PERIODS = ['past_24_hours', 'past_week', 'past_month'] as const;
const LANGUAGES = ['All', 'Python', 'TypeScript', 'Rust', 'Go'] as const;
const FALLBACK_MAX_ROWS = 100;

type TrendingPeriod = (typeof PERIODS)[number];
type TrendingLanguage = (typeof LANGUAGES)[number];

export interface FallbackOssRow {
  repo_id?: string;
  repo_name?: string;
  primary_language?: string;
  description?: string;
  stars?: string;
  forks?: string;
  pull_requests?: string;
  pushes?: string;
  total_score?: string;
  contributor_logins?: string;
  collection_names?: string;
  [k: string]: unknown;
}

export interface FallbackTrendingPayload {
  fetchedAt: string;
  buckets: Record<string, Record<string, FallbackOssRow[]>>;
}

interface RegistryEntry {
  fullName?: string;
  repoId?: string | null;
  language?: string | null;
  description?: string;
  stars?: number;
  forks?: number;
  totalScore?: number | null;
}

interface RegistryPayload {
  repos?: Record<string, RegistryEntry>;
}

interface RepoMetadataItem {
  githubId?: number | null;
  fullName?: string;
  description?: string;
  language?: string | null;
  stars?: number;
  forks?: number;
}

interface RepoMetadataPayload {
  items?: RepoMetadataItem[];
}

interface ConsensusItem {
  fullName?: string;
  rank?: number;
  consensusScore?: number;
  sourceCount?: number;
}

interface ConsensusPayload {
  items?: ConsensusItem[];
}

interface RecentRepoRow {
  githubId?: number;
  fullName?: string;
  description?: string;
  language?: string | null;
  stars?: number;
  forks?: number;
  createdAt?: string;
}

interface RecentReposPayload {
  items?: RecentRepoRow[];
}

interface StarActivityDeltaValue {
  value?: number | null;
  basis?: string;
}

interface StarActivityDeltaEntry {
  stars_now?: number;
  delta_24h?: StarActivityDeltaValue;
  delta_7d?: StarActivityDeltaValue;
  delta_30d?: StarActivityDeltaValue;
}

interface StarActivityDeltasPayload {
  repos?: Record<string, StarActivityDeltaEntry>;
}

export interface FallbackSources {
  registry: RegistryPayload | null;
  metadata: RepoMetadataPayload | null;
  consensus: ConsensusPayload | null;
  recent: RecentReposPayload | null;
  starActivityDeltas: StarActivityDeltasPayload | null;
}

interface FallbackCandidate {
  fullName: string;
  repoId: string;
  language: string;
  description: string;
  forks: number;
  registryStars: number;
  totalScore: number;
  consensusRank: number;
  consensusScore: number;
  sourceCount: number;
  recentStars: number;
  recentCreatedAt: string | null;
  starActivity: StarActivityDeltaEntry | null;
}

function finiteNumber(value: unknown): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function finiteInt(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validFullName(value: unknown): string {
  return typeof value === 'string' && value.includes('/') ? value : '';
}

function candidateFor(
  candidates: Map<string, FallbackCandidate>,
  fullName: string,
): FallbackCandidate {
  const key = fullName.toLowerCase();
  const existing = candidates.get(key);
  if (existing) return existing;

  const created: FallbackCandidate = {
    fullName,
    repoId: '',
    language: '',
    description: '',
    forks: 0,
    registryStars: 0,
    totalScore: 0,
    consensusRank: Number.MAX_SAFE_INTEGER,
    consensusScore: 0,
    sourceCount: 0,
    recentStars: 0,
    recentCreatedAt: null,
    starActivity: null,
  };
  candidates.set(key, created);
  return created;
}

function realDeltaValue(delta: StarActivityDeltaValue | undefined): number {
  if (!delta || delta.value === null || delta.value === undefined) return 0;
  if (delta.basis === 'cold-start' || delta.basis === 'no-history') return 0;
  const value = finiteInt(delta.value);
  return value > 0 ? value : 0;
}

function periodDelta(
  entry: StarActivityDeltaEntry | null,
  period: TrendingPeriod,
): number {
  if (!entry) return 0;
  if (period === 'past_24_hours') return realDeltaValue(entry.delta_24h);
  if (period === 'past_week') return realDeltaValue(entry.delta_7d);
  return realDeltaValue(entry.delta_30d);
}

function recentWindowStars(
  candidate: FallbackCandidate,
  period: TrendingPeriod,
  fetchedAt: string,
): number {
  if (candidate.recentStars <= 0 || !candidate.recentCreatedAt) return 0;
  const createdMs = Date.parse(candidate.recentCreatedAt);
  const fetchedMs = Date.parse(fetchedAt);
  if (!Number.isFinite(createdMs) || !Number.isFinite(fetchedMs)) return 0;
  const ageMs = Math.max(0, fetchedMs - createdMs);
  const limitMs =
    period === 'past_24_hours'
      ? 36 * 60 * 60 * 1000
      : period === 'past_week'
        ? 8 * 24 * 60 * 60 * 1000
        : 31 * 24 * 60 * 60 * 1000;
  return ageMs <= limitMs ? candidate.recentStars : 0;
}

function periodActivity(
  candidate: FallbackCandidate,
  period: TrendingPeriod,
  fetchedAt: string,
): number {
  return (
    periodDelta(candidate.starActivity, period) ||
    recentWindowStars(candidate, period, fetchedAt)
  );
}

function periodScore(
  candidate: FallbackCandidate,
  period: TrendingPeriod,
  fetchedAt: string,
): number {
  const activity = periodActivity(candidate, period, fetchedAt);
  return (
    activity * 1000 +
    candidate.consensusScore * 10 +
    candidate.sourceCount * 5 +
    candidate.totalScore
  );
}

function candidateToRow(
  candidate: FallbackCandidate,
  period: TrendingPeriod,
  fetchedAt: string,
): FallbackOssRow | null {
  const activity = periodActivity(candidate, period, fetchedAt);
  if (activity <= 0 || !candidate.repoId) return null;
  return {
    repo_id: candidate.repoId,
    repo_name: candidate.fullName,
    primary_language: candidate.language,
    description: candidate.description,
    stars: String(activity),
    forks: String(candidate.forks),
    pull_requests: '',
    pushes: '',
    total_score: String(Math.round(periodScore(candidate, period, fetchedAt))),
    contributor_logins: '',
    collection_names: '',
  };
}

function languageMatches(
  candidate: FallbackCandidate,
  language: TrendingLanguage,
): boolean {
  if (language === 'All') return true;
  return candidate.language.toLowerCase() === language.toLowerCase();
}

export function countTrendingRows(payload: FallbackTrendingPayload): number {
  let count = 0;
  for (const langMap of Object.values(payload.buckets)) {
    for (const rows of Object.values(langMap)) {
      count += rows.length;
    }
  }
  return count;
}

export function buildFallbackTrendingPayload(
  sources: FallbackSources,
  fetchedAt: string,
  maxRows = FALLBACK_MAX_ROWS,
): FallbackTrendingPayload | null {
  const candidates = new Map<string, FallbackCandidate>();

  for (const entry of Object.values(sources.registry?.repos ?? {})) {
    const fullName = validFullName(entry.fullName);
    if (!fullName) continue;
    const candidate = candidateFor(candidates, fullName);
    candidate.repoId = entry.repoId || candidate.repoId;
    candidate.language = entry.language || candidate.language;
    candidate.description = entry.description || candidate.description;
    candidate.forks = Math.max(candidate.forks, finiteInt(entry.forks));
    candidate.registryStars = Math.max(candidate.registryStars, finiteInt(entry.stars));
    candidate.totalScore = Math.max(candidate.totalScore, finiteNumber(entry.totalScore));
  }

  for (const item of sources.metadata?.items ?? []) {
    const fullName = validFullName(item.fullName);
    if (!fullName) continue;
    const candidate = candidateFor(candidates, fullName);
    candidate.repoId = item.githubId ? String(item.githubId) : candidate.repoId;
    candidate.language = item.language || candidate.language;
    candidate.description = item.description || candidate.description;
    candidate.forks = Math.max(candidate.forks, finiteInt(item.forks));
    candidate.registryStars = Math.max(candidate.registryStars, finiteInt(item.stars));
  }

  for (const item of sources.consensus?.items ?? []) {
    const fullName = validFullName(item.fullName);
    if (!fullName) continue;
    const candidate = candidateFor(candidates, fullName);
    candidate.consensusRank = Math.min(
      candidate.consensusRank,
      finiteInt(item.rank) || Number.MAX_SAFE_INTEGER,
    );
    candidate.consensusScore = Math.max(
      candidate.consensusScore,
      finiteNumber(item.consensusScore),
    );
    candidate.sourceCount = Math.max(candidate.sourceCount, finiteInt(item.sourceCount));
  }

  for (const row of sources.recent?.items ?? []) {
    const fullName = validFullName(row.fullName);
    if (!fullName) continue;
    const candidate = candidateFor(candidates, fullName);
    candidate.repoId = row.githubId ? String(row.githubId) : candidate.repoId;
    candidate.language = row.language || candidate.language;
    candidate.description = row.description || candidate.description;
    candidate.forks = Math.max(candidate.forks, finiteInt(row.forks));
    candidate.recentStars = Math.max(candidate.recentStars, finiteInt(row.stars));
    candidate.recentCreatedAt = row.createdAt || candidate.recentCreatedAt;
  }

  for (const [key, entry] of Object.entries(sources.starActivityDeltas?.repos ?? {})) {
    const fullName = validFullName(key);
    if (!fullName) continue;
    const candidate = candidateFor(candidates, fullName);
    candidate.starActivity = entry;
    candidate.registryStars = Math.max(candidate.registryStars, finiteInt(entry.stars_now));
  }

  const allCandidates = Array.from(candidates.values()).filter((candidate) =>
    PERIODS.some((period) => periodActivity(candidate, period, fetchedAt) > 0),
  );
  if (allCandidates.length === 0) return null;

  const buckets = {} as Record<TrendingPeriod, Record<TrendingLanguage, FallbackOssRow[]>>;
  for (const period of PERIODS) {
    buckets[period] = {} as Record<TrendingLanguage, FallbackOssRow[]>;
    const rankedForPeriod = [...allCandidates].sort((a, b) => {
      const scoreDelta =
        periodScore(b, period, fetchedAt) - periodScore(a, period, fetchedAt);
      if (scoreDelta !== 0) return scoreDelta;
      const rankDelta = a.consensusRank - b.consensusRank;
      if (rankDelta !== 0) return rankDelta;
      return a.fullName.localeCompare(b.fullName);
    });

    for (const language of LANGUAGES) {
      buckets[period]![language] = rankedForPeriod
        .filter((candidate) => languageMatches(candidate, language))
        .map((candidate) => candidateToRow(candidate, period, fetchedAt))
        .filter((row): row is FallbackOssRow => row !== null)
        .slice(0, maxRows);
    }
  }

  const payload: FallbackTrendingPayload = { fetchedAt, buckets };
  return countTrendingRows(payload) > 0 ? payload : null;
}

export async function readFallbackSources(): Promise<FallbackSources> {
  const [registry, metadata, consensus, recent, starActivityDeltas] = await Promise.all([
    readDataStore<RegistryPayload>('repo-registry').catch(() => null),
    readDataStore<RepoMetadataPayload>('repo-metadata').catch(() => null),
    readDataStore<ConsensusPayload>('consensus-trending').catch(() => null),
    readDataStore<RecentReposPayload>('recent-repos').catch(() => null),
    readDataStore<StarActivityDeltasPayload>('star-activity-deltas').catch(() => null),
  ]);
  return { registry, metadata, consensus, recent, starActivityDeltas };
}
