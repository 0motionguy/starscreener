// skillsmp.com fetcher.
//
// Public REST: GET https://skillsmp.com/api/skills?page=N&limit=N
//   -> { skills: [{ id, name, author, authorAvatar, description, githubUrl,
//                   stars, forks, updatedAt, path, branch }], pagination }
//
// 1M+ skills indexed (per the homepage banner) - the largest open SKILL.md
// catalog. We pull the top N (sorted by their default API ordering, which
// is most-recently-updated by observation) and rerank ourselves with
// log-stars * 30d-recency. No API key needed.
//
// Cron: 0 */6 * * *  (every 6h, staggered from skills-sh which fires at :15)
// Output: ss:data:v1:trending-skill-skillsmp

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';

const BASE = 'https://skillsmp.com/api/skills';
const PAGE_LIMIT = 100;
const MAX_PAGES = 5;
const TOP_KEEP = 200;
const RECENCY_HALF_LIFE_DAYS = 30;

interface SkillsmpSkill {
  id: string;
  name: string;
  author: string;
  authorAvatar?: string;
  description?: string;
  githubUrl: string;
  stars?: number;
  forks?: number;
  updatedAt?: string;
  path?: string;
  branch?: string;
}

interface SkillsmpResponse {
  skills: SkillsmpSkill[];
  pagination?: {
    page?: number;
    totalPages?: number;
    total?: number;
  };
}

interface SkillRow {
  rank: number;
  id: string;
  source_id: string;
  name: string;
  author: string;
  authorAvatar: string | null;
  description: string;
  githubUrl: string;
  url: string;
  stars: number;
  forks: number;
  updatedAt: string | null;
  trending_score: number;
}

interface SkillsmpPayload {
  fetchedAt: string;
  windowItems: number;
  total_seen: number;
  pagesFetched: number;
  items: SkillRow[];
}

const fetcher: Fetcher = {
  name: 'skillsmp',
  schedule: '0 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('skillsmp dry-run');
      return done(startedAt, 0, false);
    }

    const seen = new Map<string, SkillsmpSkill>();
    let pagesFetched = 0;
    const errors: RunResult['errors'] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      try {
        const url = `${BASE}?page=${page}&limit=${PAGE_LIMIT}`;
        const { data } = await ctx.http.json<SkillsmpResponse>(url, {
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
        ctx.log.debug({ page, gotThisPage: skills.length, cumulative: seen.size }, 'skillsmp page');
        if (skills.length < PAGE_LIMIT) break;
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

    const payload: SkillsmpPayload = {
      fetchedAt: new Date().toISOString(),
      windowItems: ranked.length,
      total_seen: seen.size,
      pagesFetched,
      items: ranked,
    };

    const result = await writeDataStore('trending-skill-skillsmp', payload);
    ctx.log.info(
      { items: ranked.length, totalSeen: seen.size, pagesFetched, redisSource: result.source, writtenAt: result.writtenAt },
      'skillsmp published',
    );

    return {
      fetcher: 'skillsmp',
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

function normaliseAndScore(s: SkillsmpSkill): SkillRow {
  const stars = nonNegative(s.stars);
  const lastModified = parseUpdatedAt(s.updatedAt);
  const trending_score = compositeScore(stars, lastModified);
  return {
    rank: 0,
    id: s.id,
    source_id: `${s.author}/${s.name}`,
    name: s.name,
    author: s.author,
    authorAvatar: s.authorAvatar?.trim() || null,
    description: cleanText(s.description) ?? '',
    githubUrl: s.githubUrl,
    url: `https://skillsmp.com/skills/${s.id}`,
    stars,
    forks: nonNegative(s.forks),
    updatedAt: lastModified ? lastModified.toISOString() : null,
    trending_score,
  };
}

function compositeScore(stars: number, lastModified: Date | null): number {
  const starsTerm = Math.log1p(Math.max(0, stars));
  const recency = lastModified ? recencyDecay(lastModified) : 0.5; // unknown -> partial credit
  return Math.round(starsTerm * recency * 1000) / 1000;
}

function recencyDecay(lastModified: Date, halfLifeDays = RECENCY_HALF_LIFE_DAYS): number {
  const ageMs = Date.now() - lastModified.getTime();
  if (ageMs <= 0) return 1;
  const ageDays = ageMs / 86_400_000;
  return Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
}

function parseUpdatedAt(raw: unknown): Date | null {
  if (!raw) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // SkillsMP API returns updatedAt as a unix-second string, observed as
    // "1777062875" (10 digits => seconds, 13 => ms). Accept both.
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num < 1e12 ? num * 1000 : num;
      const d = new Date(ms);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    const d = new Date(trimmed);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function nonNegative(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean.length > 0 ? clean.slice(0, 500) : undefined;
}

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'skillsmp',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
