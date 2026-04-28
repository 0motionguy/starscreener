// Smithery Skills fetcher (distinct from the smithery MCP fetcher).
//
// Public REST: GET https://api.smithery.ai/skills?page=N
//   -> { skills: [{ id, namespace, slug, displayName, description, gitUrl,
//                   externalStars, externalForks, categories, servers,
//                   totalActivations, uniqueUsers, qualityScore, featured,
//                   verified, listed, createdAt, ownerId }], pagination }
//
// 132K+ skills with REAL telemetry (totalActivations = install count,
// uniqueUsers = distinct adopters, qualityScore = Smithery's own ranking
// signal). The qualityScore boost makes this the highest-fidelity skill
// signal we have apart from skills.sh. No auth needed for the /skills
// endpoint - the SMITHERY_API_KEY env var is for their MCP product.
//
// Cron: 30 */6 * * *  (every 6h at :30, staggered from skillsmp at :00)
// Output: ss:data:v1:trending-skill-smithery

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';

const BASE = 'https://api.smithery.ai/skills';
// Smithery accepts `pageSize` (NOT `limit`) up to 100. Default is 10. Their
// pagination response carries totalPages so we can stop once we've consumed
// what the API will give us. With pageSize=100 we collect 200+ skills in
// 2-3 calls, well under their rate budget.
const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const TOP_KEEP = 200;
const RECENCY_HALF_LIFE_DAYS = 30;
const QUALITY_WEIGHT = 0.5;

interface SmitherySkill {
  id: string;
  namespaceId?: string;
  namespace: string;
  slug: string;
  displayName?: string;
  description?: string;
  prompt?: string | null;
  gitUrl?: string;
  externalStars?: number;
  externalForks?: number;
  categories?: string[];
  servers?: unknown[];
  totalActivations?: number;
  uniqueUsers?: number;
  qualityScore?: number;
  featured?: boolean;
  verified?: boolean;
  listed?: boolean;
  createdAt?: string;
  ownerId?: string;
}

interface SmitheryResponse {
  skills: SmitherySkill[];
  pagination?: {
    currentPage?: number;
    pageSize?: number;
    totalPages?: number;
    totalCount?: number;
  };
}

interface SkillRow {
  rank: number;
  id: string;
  source_id: string;
  namespace: string;
  slug: string;
  displayName: string;
  description: string;
  gitUrl: string | null;
  url: string;
  stars: number;
  forks: number;
  totalActivations: number;
  uniqueUsers: number;
  qualityScore: number;
  categories: string[];
  featured: boolean;
  verified: boolean;
  trending_score: number;
}

interface SmitheryPayload {
  fetchedAt: string;
  windowItems: number;
  total_seen: number;
  pagesFetched: number;
  featured_count: number;
  verified_count: number;
  upstream_total?: number;
  items: SkillRow[];
}

const fetcher: Fetcher = {
  name: 'smithery-skills',
  schedule: '30 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('smithery-skills dry-run');
      return done(startedAt, 0, false);
    }

    const seen = new Map<string, SmitherySkill>();
    let pagesFetched = 0;
    let totalCount: number | null = null;
    let totalPages: number | null = null;
    const errors: RunResult['errors'] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      try {
        const url = `${BASE}?page=${page}&pageSize=${PAGE_SIZE}`;
        const { data } = await ctx.http.json<SmitheryResponse>(url, {
          timeoutMs: 30_000,
          maxRetries: 3,
          useEtagCache: false,
        });
        const skills = Array.isArray(data?.skills) ? data.skills : [];
        if (skills.length === 0) break;
        for (const s of skills) {
          if (s?.id && !seen.has(s.id)) seen.set(s.id, s);
        }
        pagesFetched = page;
        totalPages = data?.pagination?.totalPages ?? totalPages;
        totalCount = data?.pagination?.totalCount ?? totalCount;
        ctx.log.debug(
          {
            page,
            got: skills.length,
            cumulative: seen.size,
            totalPages,
            totalCount,
          },
          'smithery-skills page',
        );
        // Stop if the API tells us this was the last page, OR if we got
        // fewer than the requested page size (last partial page).
        if (totalPages !== null && page >= totalPages) break;
        if (skills.length < PAGE_SIZE) break;
      } catch (err) {
        errors.push({ stage: `fetch-page-${page}`, message: (err as Error).message });
        break;
      }
    }

    const ranked = Array.from(seen.values())
      .map(normaliseAndScore)
      .sort((a, b) => b.trending_score - a.trending_score)
      .slice(0, TOP_KEEP)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const featured_count = ranked.reduce((n, r) => (r.featured ? n + 1 : n), 0);
    const verified_count = ranked.reduce((n, r) => (r.verified ? n + 1 : n), 0);

    const payload: SmitheryPayload = {
      fetchedAt: new Date().toISOString(),
      windowItems: ranked.length,
      total_seen: seen.size,
      pagesFetched,
      featured_count,
      verified_count,
      ...(totalCount !== null ? { upstream_total: totalCount } : {}),
      items: ranked,
    };

    const result = await writeDataStore('trending-skill-smithery', payload);
    ctx.log.info(
      { items: ranked.length, totalSeen: seen.size, pagesFetched, featured_count, verified_count, redisSource: result.source, writtenAt: result.writtenAt },
      'smithery-skills published',
    );

    return {
      fetcher: 'smithery-skills',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: seen.size,
      itemsUpserted: 0,
      metricsWritten: 0,
      redisPublished: result.source === 'redis',
      errors,
    };
  },
};

export default fetcher;

function normaliseAndScore(s: SmitherySkill): SkillRow {
  const activations = nonNegative(s.totalActivations);
  const stars = nonNegative(s.externalStars);
  const quality = clamp01(s.qualityScore);
  const createdAt = parseDate(s.createdAt);
  const trending_score = compositeScore({ activations, stars, quality, createdAt });
  return {
    rank: 0,
    id: s.id,
    source_id: `${s.namespace}/${s.slug}`,
    namespace: s.namespace,
    slug: s.slug,
    displayName: s.displayName ?? s.slug,
    description: cleanText(s.description) ?? '',
    gitUrl: s.gitUrl ?? null,
    url: `https://smithery.ai/skills/${s.namespace}/${s.slug}`,
    stars,
    forks: nonNegative(s.externalForks),
    totalActivations: activations,
    uniqueUsers: nonNegative(s.uniqueUsers),
    qualityScore: quality,
    categories: Array.isArray(s.categories) ? s.categories.filter((c): c is string => typeof c === 'string') : [],
    featured: Boolean(s.featured),
    verified: Boolean(s.verified),
    trending_score,
  };
}

interface ScoreInput {
  activations: number;
  stars: number;
  quality: number;
  createdAt: Date | null;
}

function compositeScore(x: ScoreInput): number {
  // Smithery exposes real install telemetry (activations) AND a quality
  // score, so we lean primarily on activations with quality as a multiplier.
  // Stars are a secondary cross-check from the linked GitHub repo.
  const activationsTerm = Math.log1p(x.activations);
  const starsTerm = Math.log1p(x.stars) * 0.3;
  const qualityBoost = 1 + QUALITY_WEIGHT * x.quality; // quality 0.82 -> 1.41 multiplier
  const recency = x.createdAt ? recencyDecay(x.createdAt) : 0.6;
  const score = (activationsTerm + starsTerm) * qualityBoost * recency;
  return Math.round(score * 1000) / 1000;
}

function recencyDecay(date: Date, halfLifeDays = RECENCY_HALF_LIFE_DAYS): number {
  const ageMs = Date.now() - date.getTime();
  if (ageMs <= 0) return 1;
  return Math.exp((-Math.LN2 * (ageMs / 86_400_000)) / halfLifeDays);
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t) : null;
}

function nonNegative(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function clamp01(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean.length > 0 ? clean.slice(0, 500) : undefined;
}

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'smithery-skills',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
