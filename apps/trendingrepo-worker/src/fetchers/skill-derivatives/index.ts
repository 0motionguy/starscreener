// skill-derivatives fetcher.
//
//   API           https://api.github.com/search/code?q=path:**/SKILL.md+"name: <skill>"
//   Auth          GITHUB_TOKEN (round-robin via the canonical token-pool helper)
//   Rate limit    GitHub code-search: 10 req/min unauthenticated, 30 req/min
//                 authenticated. We sleep 2200ms between calls (~27 req/min).
//   Cache TTL     12h per-skill (skill-derivative-count:<slug>)
//   Aggregate key skill-derivative-count
//   Cadence       12h (refresh-skill-derivatives.yml)
//
// For each known skill (read from `trending-skill` and `trending-skill-sh`),
// run a code search for files matching `path:**/SKILL.md "name: <skill-name>"`
// and read total_count from the response. That's our derivative-count proxy:
// how many other repos have copied/forked/extended this skill's manifest.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore } from '../../lib/redis.js';
import { fetchJsonWithRetry, HttpStatusError, sleep } from '../../lib/util/http-helpers.js';
import { pickGithubToken } from '../../lib/util/github-token-pool.js';

const USER_AGENT = 'TrendingRepo-Skill-Derivatives/1.0 (+https://trendingrepo.com)';
const REQ_INTERVAL_MS = 2200; // ~27/min, under the 30/min authenticated cap
const CACHE_TTL_SECONDS = 12 * 60 * 60;
const FRESH_THRESHOLD_MS = 11 * 60 * 60 * 1000;
const MAX_SKILLS_PER_RUN = 200;

interface CachedDerivative {
  count: number;
  sampledAt: string;
  sources: string[]; // which keys we read this skill from (trending-skill, trending-skill-sh)
}

interface GitHubCodeSearchResponse {
  total_count?: number;
  incomplete_results?: boolean;
}

interface RosterSkillItem {
  slug?: string;
  full_name?: string;
  title?: string;
  skill_name?: string;
}

interface AggregateSummaryEntry {
  count: number;
  sampledAt: string;
}

interface AggregatePayload {
  fetchedAt: string;
  summary: Record<string, AggregateSummaryEntry>;
  counts: { skills: number; queried: number; ok: number; failed: number; cacheHit: number };
}

const fetcher: Fetcher = {
  name: 'skill-derivatives',
  schedule: '7 */12 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('skill-derivatives dry-run');
      return done(startedAt, 0, false, []);
    }

    const errors: RunResult['errors'] = [];

    // Discover skills from BOTH skill rosters.
    // AUDIT-2026-05-04: allSettled so a single Redis flake degrades to
    // null instead of crashing the whole fetcher. Same fix as f39cd09d.
    const reads = await Promise.allSettled([
      readDataStore<{ items?: RosterSkillItem[] }>('trending-skill'),
      readDataStore<{ items?: RosterSkillItem[] }>('trending-skill-sh'),
    ]);
    const github = reads[0].status === 'fulfilled' ? reads[0].value : null;
    const skillsSh = reads[1].status === 'fulfilled' ? reads[1].value : null;
    if (reads[0].status === 'rejected' || reads[1].status === 'rejected') {
      ctx.log.warn(
        {
          trendingSkill:
            reads[0].status === 'rejected'
              ? reads[0].reason instanceof Error
                ? reads[0].reason.message
                : String(reads[0].reason)
              : null,
          trendingSkillSh:
            reads[1].status === 'rejected'
              ? reads[1].reason instanceof Error
                ? reads[1].reason.message
                : String(reads[1].reason)
              : null,
        },
        'skill-derivatives: roster read failed; degrading to null',
      );
    }

    const targets = new Map<string, { slug: string; queryName: string; sources: string[] }>();
    for (const it of github?.items ?? []) {
      const slug = String(it.slug ?? it.full_name ?? '').trim().toLowerCase();
      const queryName = pickQueryName(it);
      if (!slug || !queryName) continue;
      mergeTarget(targets, slug, queryName, 'trending-skill');
    }
    for (const it of skillsSh?.items ?? []) {
      const slug = String(it.slug ?? '').trim().toLowerCase();
      const queryName = pickQueryName(it);
      if (!slug || !queryName) continue;
      mergeTarget(targets, slug, queryName, 'trending-skill-sh');
    }

    const allTargets = Array.from(targets.values()).slice(0, MAX_SKILLS_PER_RUN);
    ctx.log.info({ skills: allTargets.length }, 'skill-derivatives targets resolved');

    const summary: Record<string, AggregateSummaryEntry> = {};
    let ok = 0;
    let failed = 0;
    let cacheHit = 0;
    let queried = 0;

    for (let i = 0; i < allTargets.length; i += 1) {
      const t = allTargets[i]!;
      try {
        const cached = await readDataStore<CachedDerivative>(`skill-derivative-count:${t.slug}`);
        const fresh = cached && Date.now() - Date.parse(cached.sampledAt) < FRESH_THRESHOLD_MS;
        if (fresh && cached) {
          summary[t.slug] = { count: cached.count, sampledAt: cached.sampledAt };
          cacheHit += 1;
          continue;
        }

        queried += 1;
        const count = await fetchDerivativeCount(t.queryName);
        if (count === null) continue;

        const sampledAt = new Date().toISOString();
        const entry: CachedDerivative = { count, sampledAt, sources: t.sources };
        await writeDataStore(`skill-derivative-count:${t.slug}`, entry, { ttlSeconds: CACHE_TTL_SECONDS });
        summary[t.slug] = { count, sampledAt };
        ok += 1;
      } catch (err) {
        failed += 1;
        errors.push({ stage: 'fetch', message: (err as Error).message, itemSourceId: t.slug });
      }

      if (i < allTargets.length - 1 && REQ_INTERVAL_MS > 0) await sleep(REQ_INTERVAL_MS);
    }

    const aggregate: AggregatePayload = {
      fetchedAt: new Date().toISOString(),
      summary,
      counts: { skills: allTargets.length, queried, ok, failed, cacheHit },
    };
    const result = await writeDataStore('skill-derivative-count', aggregate);
    ctx.log.info(
      { slugs: Object.keys(summary).length, queried, ok, failed, cacheHit, redisSource: result.source },
      'skill-derivatives published',
    );

    return {
      fetcher: 'skill-derivatives',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: allTargets.length,
      itemsUpserted: 0,
      metricsWritten: Object.keys(summary).length,
      redisPublished: result.source === 'redis',
      errors,
    };
  },
};

export default fetcher;

function pickQueryName(it: RosterSkillItem): string | null {
  // Prefer the explicit skill_name (skills.sh shape) which is closest to the
  // name-yaml-key in SKILL.md. Fall back to the title or repo-leaf.
  const cands = [it.skill_name, it.title, leafName(it.full_name)];
  for (const c of cands) {
    if (typeof c === 'string' && c.trim().length > 0 && c.trim().length <= 80) {
      return c.trim();
    }
  }
  return null;
}

function leafName(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const last = value.split('/').pop();
  return last ?? null;
}

function mergeTarget(
  map: Map<string, { slug: string; queryName: string; sources: string[] }>,
  slug: string,
  queryName: string,
  source: string,
): void {
  const existing = map.get(slug);
  if (existing) {
    if (!existing.sources.includes(source)) existing.sources.push(source);
    return;
  }
  map.set(slug, { slug, queryName, sources: [source] });
}

async function fetchDerivativeCount(skillName: string): Promise<number | null> {
  // Code search syntax: `path:**/SKILL.md "name: <skill>"`. The double-quote
  // forces an exact phrase match on the YAML frontmatter line.
  const q = `path:**/SKILL.md "name: ${skillName}"`;
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=1`;

  const token = pickGithubToken();
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const data = await fetchJsonWithRetry<GitHubCodeSearchResponse>(url, {
      attempts: 3,
      retryDelayMs: 3000,
      timeoutMs: 20_000,
      headers,
    });
    return typeof data.total_count === 'number' ? data.total_count : 0;
  } catch (err) {
    if (err instanceof HttpStatusError && (err.status === 422 || err.status === 404)) {
      return 0;
    }
    throw err;
  }
}

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'skill-derivatives',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
