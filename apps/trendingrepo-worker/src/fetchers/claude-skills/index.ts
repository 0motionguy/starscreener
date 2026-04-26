// Trending Claude Code skills fetcher.
//
// Primary signal: GitHub repos tagged with the canonical topics. The
// `topic:claude-code-skill` topic is what Anthropic's official docs guide
// new skill authors to apply, but the community has also adopted
// `claude-skill` (singular) and `agent-skill` (broader) so we union all three
// and dedupe by full_name. Cross-topic appearance gives a small score boost.
//
// Secondary signal (planned): Firecrawl scrape of docs.claude.com curated
// skill links, when Anthropic publishes a registry-shaped index page.
// Currently that page is tutorial content with no machine-extractable list,
// so the scrape is a stub returning [].
//
// Cadence: every 6h. Top 200 by score (log-stars * 30d-half-life recency +
// cross-source bonus) -> ss:data:v1:trending-skill. The Vercel route at
// /api/skills reads this slug.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';

const GITHUB_TOPICS = ['claude-code-skill', 'claude-skill', 'agent-skill'] as const;
const PER_PAGE = 100;
const TOP_LIMIT = 200;
const RECENCY_HALF_LIFE_DAYS = 30;

interface GitHubRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics?: string[];
  pushed_at: string;
  created_at: string;
  archived?: boolean;
  fork?: boolean;
  owner: { login: string; avatar_url: string };
}

interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepo[];
}

interface SkillItem {
  full_name: string;
  slug: string;
  title: string;
  description: string;
  url: string;
  author: string;
  avatar_url: string;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  pushed_at: string;
  created_at: string;
  source_topics: string[];
}

interface SkillScored extends SkillItem {
  score: number;
  rank: number;
}

export interface SkillsPayload {
  fetchedAt: string;
  windowItems: number;
  sources: {
    githubTotalSeen: number;
    topics: ReadonlyArray<string>;
  };
  items: SkillScored[];
}

const fetcher: Fetcher = {
  name: 'claude-skills',
  schedule: '0 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('claude-skills dry-run');
      return done(startedAt, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const skillsByName = new Map<string, SkillItem>();

    for (const topic of GITHUB_TOPICS) {
      try {
        const repos = await searchGitHubTopic(ctx, topic);
        for (const repo of repos) {
          if (repo.archived || repo.fork) continue;
          const existing = skillsByName.get(repo.full_name);
          if (existing) {
            if (!existing.source_topics.includes(topic)) existing.source_topics.push(topic);
            continue;
          }
          skillsByName.set(repo.full_name, normalizeRepo(repo, topic));
        }
      } catch (err) {
        errors.push({ stage: `github-topic-${topic}`, message: (err as Error).message });
      }
    }

    // Firecrawl path - stub. Skills currently come from GitHub only.
    // The docs.claude.com/en/docs/claude-code/skills page exists but is
    // tutorial content, not a curated registry. Revisit when Anthropic ships
    // a machine-readable skill index.
    try {
      const docsSeen = await scrapeOfficialDocs(ctx);
      for (const fullName of docsSeen) {
        const existing = skillsByName.get(fullName);
        if (existing && !existing.source_topics.includes('docs.claude.com')) {
          existing.source_topics.push('docs.claude.com');
        }
      }
    } catch (err) {
      errors.push({ stage: 'firecrawl-docs', message: (err as Error).message });
    }

    const sorted = Array.from(skillsByName.values())
      .map(scoreSkill)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_LIMIT)
      .map((s, i) => ({ ...s, rank: i + 1 }));

    const payload: SkillsPayload = {
      fetchedAt: new Date().toISOString(),
      windowItems: sorted.length,
      sources: {
        githubTotalSeen: skillsByName.size,
        topics: GITHUB_TOPICS,
      },
      items: sorted,
    };

    const result = await writeDataStore('trending-skill', payload);
    ctx.log.info(
      {
        items: sorted.length,
        totalSeen: skillsByName.size,
        redisSource: result.source,
        writtenAt: result.writtenAt,
        errors: errors.length,
      },
      'claude-skills published',
    );

    return {
      fetcher: 'claude-skills',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: skillsByName.size,
      itemsUpserted: 0,
      metricsWritten: 0,
      redisPublished: result.source === 'redis',
      errors,
    };
  },
};

export default fetcher;

async function searchGitHubTopic(ctx: FetcherContext, topic: string): Promise<GitHubRepo[]> {
  const url =
    `https://api.github.com/search/repositories` +
    `?q=topic:${encodeURIComponent(topic)}` +
    `&sort=stars&order=desc&per_page=${PER_PAGE}&page=1`;

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  const token = pickGitHubToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const { data } = await ctx.http.json<GitHubSearchResponse>(url, {
    headers,
    timeoutMs: 30_000,
    maxRetries: 3,
    useEtagCache: false,
  });
  return Array.isArray(data?.items) ? data.items : [];
}

function pickGitHubToken(): string | undefined {
  // Phase 2A introduced GH_TOKEN_POOL (comma-separated). Use first slot if present;
  // the worker's full pool integration belongs in Phase B alongside the github
  // fetcher port. For one search call every 6h we don't need the rotation.
  const pool = process.env.GH_TOKEN_POOL;
  if (pool) {
    const first = pool.split(',').map((t) => t.trim()).find((t) => t.length > 0);
    if (first) return first;
  }
  return process.env.GH_PAT?.trim() || undefined;
}

function normalizeRepo(repo: GitHubRepo, sourceTopic: string): SkillItem {
  return {
    full_name: repo.full_name,
    slug: slugify(repo.full_name),
    title: repo.full_name.split('/').pop() ?? repo.full_name,
    description: cleanText(repo.description) ?? '',
    url: repo.html_url,
    author: repo.owner.login,
    avatar_url: repo.owner.avatar_url,
    language: repo.language,
    topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 20) : [],
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    pushed_at: repo.pushed_at,
    created_at: repo.created_at,
    source_topics: [sourceTopic],
  };
}

function scoreSkill(s: SkillItem): SkillScored {
  // Log-scale stars to keep the 10k-outliers from dominating, recency decay
  // (half-life 30d) so abandoned skills slide down, plus 0.5 per extra
  // matched topic as a "shows up in multiple lenses" cross-source signal.
  const starsScore = Math.log1p(Math.max(0, s.stars));
  const ageMs = Date.now() - Date.parse(s.pushed_at);
  const recency = Number.isFinite(ageMs) && ageMs > 0
    ? Math.exp((-Math.LN2 * (ageMs / 86_400_000)) / RECENCY_HALF_LIFE_DAYS)
    : 1;
  const crossSource = Math.max(0, s.source_topics.length - 1) * 0.5;
  const score = Math.round((starsScore * recency + crossSource) * 1000) / 1000;
  return { ...s, score, rank: 0 };
}

async function scrapeOfficialDocs(_ctx: FetcherContext): Promise<string[]> {
  // Reserved for later. The docs.claude.com/en/docs/claude-code/skills page
  // returns 200 + 44KB of markdown but its content is tutorial-shaped, not a
  // registry. Revisit if Anthropic publishes a curated <SkillCard> grid we
  // can parse. Until then we don't burn Firecrawl credits per cron tick.
  return [];
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean.length > 0 ? clean.slice(0, 500) : undefined;
}

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'claude-skills',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
