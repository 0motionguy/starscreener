// cross-source-sweep — daily repo-first mention sweep for the top-N repos.
//
// Flips the source-first collectors around: for each of the top ~100 repos
// (from consensus-trending), ask every channel "show me mentions of THIS repo",
// attribute by github.com/owner/repo URL → slug match, and publish a rollup
// (top-5 mentions per source per repo, last 7d) to `repo-mentions-detail-rollup`
// in redis. The app reads that via src/lib/cross-source-mentions.ts to fill the
// per-source pips + mention block on profiles + list rows.
//
// Ported from scripts/_cross-source-search.mjs + scripts/sweep-cross-source-
// mentions.ts (which ran only in GitHub Actions → dead Railway redis). This
// runs on the prod worker so the data is fresh + reaches the TOOLBOX redis.
//
// Channels: HN (Algolia), Reddit (public JSON), dev.to (public feed), Bluesky
// (BLUESKY_HANDLE/APP_PASSWORD session) — all key-free except Bluesky's app
// password. ProductHunt reads the producthunt-launches snapshot. Tavily +
// Twitter(Apify) are env-gated (TAVILY_API_KEY / APIFY_API_TOKEN) and skip
// cleanly when unset. Each channel fails soft (errors → [] → sweep continues).

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';

const TOP_N = 100;
const REPO_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 15_000;
const SEVEN_DAYS_S = 7 * 24 * 60 * 60;
const TEXT_TRUNCATE = 500;
const UA = 'TrendingRepo/0.2 (+https://github.com/0motionguy/starscreener; cross-source-sweep)';

type Channel =
  | 'hackernews'
  | 'reddit'
  | 'bluesky'
  | 'devto'
  | 'producthunt'
  | 'tavily'
  | 'twitter';

export interface Mention {
  source: Channel;
  fullName: string;
  url: string;
  title: string;
  text: string;
  author: string | null;
  engagement: { score?: number; comments?: number; reactions?: number };
  observedAt: string;
}

interface RepoInput {
  fullName: string;
  owner: string;
  name: string;
}

// --- helpers ---------------------------------------------------------------

function truncate(value: unknown, max = TEXT_TRUNCATE): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function isoFromUnix(seconds: unknown): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

async function fetchJson(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers ?? {}) },
      body: opts.body,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${opts.method ?? 'GET'} HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const GENERIC_NAMES = new Set([
  'skills', 'core', 'api', 'cli', 'agent', 'agents', 'bot', 'framework', 'code',
  'app', 'apps', 'sdk', 'lib', 'tools', 'ui', 'model', 'models', 'client',
  'server', 'data', 'docs', 'engine', 'kit', 'plugin', 'project', 'service',
  'utils', 'web', 'playground', 'demo', 'starter', 'template',
]);

export function isDistinctiveName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return lower.length >= 5 && !GENERIC_NAMES.has(lower);
}

// --- channel adapters ------------------------------------------------------

interface AlgoliaHit {
  objectID?: string; url?: string; title?: string; story_text?: string;
  comment_text?: string; author?: string; points?: number; num_comments?: number;
  created_at_i?: number;
}

async function searchHackerNews(repo: RepoInput): Promise<Mention[]> {
  const since = Math.floor(Date.now() / 1000) - SEVEN_DAYS_S;
  const seen = new Map<string, AlgoliaHit>();
  const queries = [`github.com/${repo.fullName}`, `${repo.owner}/${repo.name}`];
  if (isDistinctiveName(repo.name)) queries.push(repo.name);
  try {
    for (const query of queries) {
      const url =
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}` +
        `&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=30`;
      const data = (await fetchJson(url)) as { hits?: AlgoliaHit[] };
      for (const h of data.hits ?? []) {
        if (h.objectID && !seen.has(h.objectID)) seen.set(h.objectID, h);
      }
    }
    return Array.from(seen.values()).map((s) => ({
      source: 'hackernews' as const,
      fullName: repo.fullName,
      url: s.url || `https://news.ycombinator.com/item?id=${s.objectID}`,
      title: truncate(s.title, 200),
      text: truncate(s.story_text ?? s.comment_text ?? ''),
      author: s.author ?? null,
      engagement: { score: s.points ?? 0, comments: s.num_comments ?? 0 },
      observedAt: isoFromUnix(s.created_at_i),
    }));
  } catch {
    return [];
  }
}

async function searchReddit(repo: RepoInput): Promise<Mention[]> {
  const queries = [`github.com/${repo.fullName}`, `${repo.owner}/${repo.name}`];
  if (isDistinctiveName(repo.name)) queries.push(repo.name);
  const seen = new Map<string, Mention>();
  for (const q of queries) {
    const url = `https://old.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&t=week&limit=50`;
    let data: { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
    try {
      data = (await fetchJson(url)) as typeof data;
    } catch {
      continue; // 429 / network — skip this query, keep going
    }
    for (const c of data.data?.children ?? []) {
      const d = (c.data ?? {}) as Record<string, unknown>;
      const id = typeof d.id === 'string' ? d.id : null;
      if (!id || seen.has(id)) continue;
      const permalink = typeof d.permalink === 'string' ? d.permalink : null;
      seen.set(id, {
        source: 'reddit',
        fullName: repo.fullName,
        url: permalink ? `https://www.reddit.com${permalink}` : String(d.url ?? ''),
        title: truncate(d.title, 200),
        text: truncate(d.selftext),
        author: typeof d.author === 'string' ? d.author : null,
        engagement: {
          score: typeof d.score === 'number' ? d.score : 0,
          comments: typeof d.num_comments === 'number' ? d.num_comments : 0,
        },
        observedAt: isoFromUnix(d.created_utc),
      });
    }
  }
  return Array.from(seen.values());
}

async function searchDevto(repo: RepoInput): Promise<Mention[]> {
  const url =
    `https://dev.to/search/feed_content?per_page=30&class_name=Article` +
    `&search_fields=body_text&q=${encodeURIComponent(repo.fullName)}`;
  try {
    let data: { result?: Array<Record<string, unknown>> };
    try {
      data = (await fetchJson(url, { timeoutMs: 25_000 })) as typeof data;
    } catch {
      await new Promise((r) => setTimeout(r, 1_000));
      data = (await fetchJson(url, { timeoutMs: 25_000 })) as typeof data;
    }
    return (data.result ?? []).map((a) => {
      const user = (a.user ?? {}) as Record<string, unknown>;
      return {
        source: 'devto' as const,
        fullName: repo.fullName,
        url: typeof a.url === 'string' ? a.url : `https://dev.to${a.path ?? ''}`,
        title: truncate(a.title, 200),
        text: truncate(a.description ?? a.summary ?? ''),
        author: typeof user.username === 'string' ? user.username : null,
        engagement: {
          score:
            (typeof a.public_reactions_count === 'number' ? a.public_reactions_count : 0) ||
            (typeof a.positive_reactions_count === 'number' ? a.positive_reactions_count : 0),
          comments: typeof a.comments_count === 'number' ? a.comments_count : 0,
        },
        observedAt:
          (typeof a.published_at === 'string' ? a.published_at : null) ?? new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

async function searchBluesky(repo: RepoInput, jwt: string | null): Promise<Mention[]> {
  if (!jwt) return [];
  const headers = { Authorization: `Bearer ${jwt}` };
  const queries = [`"github.com/${repo.fullName}"`, `"${repo.fullName}"`];
  const out: Mention[] = [];
  for (const q of queries) {
    try {
      const url =
        `https://bsky.social/xrpc/app.bsky.feed.searchPosts?` +
        new URLSearchParams({ q, sort: 'latest', limit: '50' });
      const data = (await fetchJson(url, { headers })) as {
        posts?: Array<Record<string, unknown>>;
      };
      for (const p of data.posts ?? []) {
        const author = (p.author ?? {}) as Record<string, unknown>;
        const record = (p.record ?? {}) as Record<string, unknown>;
        const handle = typeof author.handle === 'string' ? author.handle : '';
        const rkey = String(p.uri ?? '').split('/').pop() ?? '';
        out.push({
          source: 'bluesky',
          fullName: repo.fullName,
          url: handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : String(p.uri ?? ''),
          title: truncate(record.text, 200),
          text: truncate(record.text),
          author: handle || null,
          engagement: {
            score:
              (typeof p.likeCount === 'number' ? p.likeCount : 0) +
              (typeof p.repostCount === 'number' ? p.repostCount : 0),
            comments: typeof p.replyCount === 'number' ? p.replyCount : 0,
          },
          observedAt: typeof p.indexedAt === 'string' ? p.indexedAt : new Date().toISOString(),
        });
      }
      if (out.length > 0) break; // URL form usually gets exact hits
    } catch {
      /* fail soft, try next query */
    }
  }
  return out;
}

interface PhLaunch {
  linkedRepo?: string; website?: string; url?: string; name?: string;
  tagline?: string; description?: string; makers?: Array<{ username?: string }>;
  votesCount?: number; commentsCount?: number; createdAt?: string; featuredAt?: string;
}

function searchProductHunt(repo: RepoInput, launches: PhLaunch[]): Mention[] {
  const fullLower = repo.fullName.toLowerCase();
  return launches
    .filter((l) => {
      if (l.linkedRepo && l.linkedRepo.toLowerCase() === fullLower) return true;
      return (l.website?.toLowerCase() ?? '').includes(`github.com/${fullLower}`);
    })
    .map((l) => ({
      source: 'producthunt' as const,
      fullName: repo.fullName,
      url: l.url ?? '',
      title: truncate(l.name, 200),
      text: truncate(l.tagline ?? l.description ?? ''),
      author:
        (Array.isArray(l.makers)
          ? l.makers.map((m) => m.username).filter(Boolean).join(', ')
          : '') || null,
      engagement: { score: l.votesCount ?? 0, comments: l.commentsCount ?? 0 },
      observedAt: l.createdAt ?? l.featuredAt ?? new Date().toISOString(),
    }));
}

async function searchTavily(repo: RepoInput, apiKey: string | undefined): Promise<Mention[]> {
  if (!apiKey) return [];
  try {
    const data = (await fetchJson('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: `"${repo.fullName}" github`,
        search_depth: 'basic',
        time_range: 'week',
        max_results: 10,
      }),
    })) as { results?: Array<Record<string, unknown>> };
    return (data.results ?? [])
      .filter((r) => !String(r.url ?? '').toLowerCase().includes(`github.com/${repo.fullName.toLowerCase()}`))
      .map((r) => ({
        source: 'tavily' as const,
        fullName: repo.fullName,
        url: typeof r.url === 'string' ? r.url : '',
        title: truncate(r.title, 200),
        text: truncate(r.content),
        author: null,
        engagement: { score: typeof r.score === 'number' ? Math.round(r.score * 100) : 0 },
        observedAt: typeof r.published_date === 'string' ? r.published_date : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

async function blueskySession(): Promise<string | null> {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) return null;
  try {
    const data = (await fetchJson('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: handle, password }),
    })) as { accessJwt?: string };
    return data.accessJwt ?? null;
  } catch {
    return null;
  }
}

// --- rollup ----------------------------------------------------------------

interface RollupBucket { count7d: number; top: Mention[]; }
interface RollupRepo { fullName: string; totalMentions7d: number; perSource: Record<string, RollupBucket>; }
interface RollupPayload {
  computedAt: string;
  windowDays: number;
  repos: Record<string, RollupRepo>;
}

export function buildRollupRepos(mentions: Mention[], windowDays = 7): Record<string, RollupRepo> {
  const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;
  const repos: Record<string, RollupRepo> = {};
  for (const ev of mentions) {
    const ts = Date.parse(ev.observedAt);
    if (Number.isFinite(ts) && ts < cutoff) continue;
    const r = (repos[ev.fullName] ??= { fullName: ev.fullName, totalMentions7d: 0, perSource: {} });
    const bucket = (r.perSource[ev.source] ??= { count7d: 0, top: [] });
    bucket.count7d += 1;
    r.totalMentions7d += 1;
    bucket.top.push(ev);
  }
  for (const r of Object.values(repos)) {
    for (const bucket of Object.values(r.perSource)) {
      bucket.top.sort((a, b) => {
        const sd = (b.engagement?.score ?? 0) - (a.engagement?.score ?? 0);
        return sd !== 0 ? sd : Date.parse(b.observedAt) - Date.parse(a.observedAt);
      });
      bucket.top = bucket.top.slice(0, 5);
    }
  }
  return repos;
}

// --- top-N selection -------------------------------------------------------

export function toRepoInput(fullName: unknown): RepoInput | null {
  if (typeof fullName !== 'string' || !fullName.includes('/')) return null;
  const [owner, name] = fullName.split('/');
  if (!owner || !name) return null;
  return { fullName, owner, name };
}

async function loadTopRepos(limit: number): Promise<RepoInput[]> {
  const seen = new Set<string>();
  const out: RepoInput[] = [];
  const ct = await readDataStore<{ items?: Array<{ fullName?: string }> }>('consensus-trending');
  for (const item of ct?.items ?? []) {
    if (out.length >= limit) break;
    const repo = toRepoInput(item.fullName);
    if (repo && !seen.has(repo.fullName.toLowerCase())) {
      seen.add(repo.fullName.toLowerCase());
      out.push(repo);
    }
  }
  return out;
}

const fetcher: Fetcher = {
  name: 'cross-source-sweep',
  // Daily 06:00 UTC. Repo-first per-repo searches across channels for the
  // top-100; bounded concurrency keeps the wall-clock in budget.
  schedule: '0 6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('cross-source-sweep dry-run');
      return done(startedAt, 0, false);
    }

    const repos = await loadTopRepos(TOP_N);
    if (repos.length === 0) {
      ctx.log.warn('cross-source-sweep: no consensus-trending repos yet, skipping');
      return done(startedAt, 0, false);
    }

    const jwt = await blueskySession();
    const phSnapshot = await readDataStore<{ launches?: PhLaunch[] }>('producthunt-launches').catch(() => null);
    const phLaunches = Array.isArray(phSnapshot?.launches) ? phSnapshot.launches : [];
    const tavilyKey = process.env.TAVILY_API_KEY;

    const allMentions: Mention[] = [];
    const queue = [...repos];
    let processed = 0;
    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const repo = queue.shift();
        if (!repo) return;
        const results = await Promise.allSettled([
          searchHackerNews(repo),
          searchReddit(repo),
          searchDevto(repo),
          searchBluesky(repo, jwt),
          Promise.resolve(searchProductHunt(repo, phLaunches)),
          searchTavily(repo, tavilyKey),
        ]);
        for (const r of results) {
          if (r.status === 'fulfilled') allMentions.push(...r.value);
        }
        processed += 1;
      }
    };
    await Promise.all(Array.from({ length: Math.min(REPO_CONCURRENCY, repos.length) }, () => worker()));

    // Build this run's rollup, then merge over the existing one so repos not
    // covered this run keep their prior detail (read-then-merge).
    const freshRepos = buildRollupRepos(allMentions);
    const existing = await readDataStore<RollupPayload>('repo-mentions-detail-rollup').catch(() => null);
    const mergedRepos: Record<string, RollupRepo> = { ...(existing?.repos ?? {}), ...freshRepos };
    const payload: RollupPayload = {
      computedAt: new Date().toISOString(),
      windowDays: 7,
      repos: mergedRepos,
    };
    const result = await writeDataStore('repo-mentions-detail-rollup', payload);

    const sourceCounts: Record<string, number> = {};
    for (const m of allMentions) sourceCounts[m.source] = (sourceCounts[m.source] ?? 0) + 1;
    ctx.log.info(
      {
        reposSwept: processed,
        freshRepos: Object.keys(freshRepos).length,
        totalRepos: Object.keys(mergedRepos).length,
        mentions: allMentions.length,
        bySource: sourceCounts,
        bluesky: jwt ? 'on' : 'off',
        tavily: tavilyKey ? 'on' : 'off',
        redis: result.source,
      },
      'cross-source-sweep published',
    );
    return done(startedAt, allMentions.length, result.source === 'redis');
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'cross-source-sweep',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
