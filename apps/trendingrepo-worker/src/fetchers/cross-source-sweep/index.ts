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
// password. ProductHunt reads the producthunt-launches snapshot. Tavily is
// key-gated. Twitter(Apify) is token + operator-approval gated and skips
// cleanly unless both are present. Each channel fails soft (errors → [] →
// sweep continues).

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { describeApifyGate, isApifyTokenApproved } from '../../lib/apify-policy.js';
// Reuse the proven Apify `apidojo~tweet-scraper` caller (run-sync-get-dataset-
// items + field-name normalization) rather than re-implementing it. Gated on
// APIFY_API_TOKEN plus TRENDINGREPO_ENABLE_APIFY — see searchTwitterApify.
import { runTweetScraper } from '../x-funding/index.js';

// Bumped 150 → 250 (2026-05-27) to push the registry-only tail into the
// rollup so dropped repos get cross-source mention markers. Per-repo
// channel fan-out (~3 key-free channels × ~500ms / concurrency 4) ≈ 95s
// wall-clock for 250 repos at daily 06:00 UTC — safe. Twitter (Apify) is
// still batched-top-40 + approval-gated, so no accidental Apify cost change.
const TOP_N = 250;
const REPO_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 15_000;
const SEVEN_DAYS_S = 7 * 24 * 60 * 60;
const TEXT_TRUNCATE = 500;
// Twitter via Apify is cost-bearing (the operator deliberately keeps Apify
// spend low — see the reddit-Apify decision). Cap it: ONE batched actor run
// (not one-per-repo) covering only the top slice, gated on explicit operator
// approval so a leftover token cannot wake it up.
const TWITTER_BATCH_REPOS = 40;
const TWITTER_MAX_ITEMS = 200;
const UA = 'TrendingRepo/0.2 (+https://github.com/0motionguy/starscreener; cross-source-sweep)';

type Channel =
  | 'hackernews'
  | 'reddit'
  | 'bluesky'
  | 'devto'
  | 'lobsters'
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

// NOTE: live per-repo Reddit + Dev.to search were removed 2026-05-27. From the
// prod worker's VPS IP, `old.reddit.com/search.json` returns a "Blocked" page
// (Reddit blocks datacenter IPs) and `dev.to/search/feed_content` returns an
// empty result set for every query (endpoint dead). Both channels are now
// folded in from their source-first snapshots (`reddit-mentions`,
// `devto-mentions`) via foldSourceFirstSnapshots() below — which carry richer,
// already-attributed per-repo buckets anyway.

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

// Twitter via Apify — gated on APIFY_API_TOKEN plus
// TRENDINGREPO_ENABLE_APIFY=operator-approved. One batched actor run for the
// top slice; attribute each tweet to whichever batch repo its text references
// (github URL → owner/repo → distinctive name).
interface TweetRow {
  text?: string; full_text?: string; url?: string; twitterUrl?: string;
  id?: string | number; createdAt?: string; created_at?: string;
  username?: string; user?: { screen_name?: string; userName?: string };
  likeCount?: number; retweetCount?: number; replyCount?: number;
}

export async function searchTwitterApify(
  repos: RepoInput[],
  token: string | undefined,
): Promise<Mention[]> {
  if (!isApifyTokenApproved(token)) return [];
  const batch = repos.slice(0, TWITTER_BATCH_REPOS);
  if (batch.length === 0) return [];
  let tweets: TweetRow[];
  try {
    tweets = (await runTweetScraper(token, {
      searchTerms: batch.map((r) => `"${r.fullName}"`),
      maxItems: TWITTER_MAX_ITEMS,
      sort: 'Latest',
      tweetLanguage: 'en',
    })) as TweetRow[];
  } catch {
    return [];
  }
  const out: Mention[] = [];
  for (const t of tweets) {
    const text = str(t.text ?? t.full_text);
    if (!text) continue;
    const lower = text.toLowerCase();
    const handle = str(t.username || t.user?.screen_name || t.user?.userName);
    const url =
      str(t.url || t.twitterUrl) ||
      (handle && t.id ? `https://x.com/${handle}/status/${t.id}` : '');
    if (!url) continue;
    const observedAt = str(t.createdAt ?? t.created_at) || new Date().toISOString();
    const score = num(t.likeCount) + num(t.retweetCount);
    for (const r of batch) {
      const full = r.fullName.toLowerCase();
      const hit =
        lower.includes(`github.com/${full}`) ||
        lower.includes(full) ||
        (isDistinctiveName(r.name) && lower.includes(r.name.toLowerCase()));
      if (!hit) continue;
      out.push({
        source: 'twitter',
        fullName: r.fullName,
        url,
        title: truncate(text, 200),
        text: truncate(text),
        author: handle || null,
        engagement: { score, comments: num(t.replyCount) },
        observedAt,
      });
    }
  }
  return out;
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

// --- source-first fold-in --------------------------------------------------
// The per-source collectors (devto, hackernews, reddit, lobsters, bluesky)
// publish per-repo buckets keyed by fullName. Fold every snapshot bucket for
// OUR top repos into the mention stream so the rollup is the union of every
// channel we collect — not just the live (HN/Bluesky) searches. This is the
// only path that surfaces Dev.to (search endpoint dead) and Reddit (public
// JSON IP-blocked from the VPS), and it enriches HN/Bluesky with items the
// source-first scan caught that the live per-repo search missed.

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

interface SnapshotAdapter {
  key: string;
  source: Channel;
  listField: string;
  map: (row: Record<string, unknown>, fullName: string) => Mention;
}

const REDDIT_TOPIC_ENABLED = false;

const SNAPSHOT_ADAPTERS: SnapshotAdapter[] = [
  {
    key: 'devto-mentions',
    source: 'devto',
    listField: 'articles',
    map: (a, fullName) => {
      const user = (a.user ?? {}) as Record<string, unknown>;
      const author = (a.author ?? {}) as Record<string, unknown>;
      return {
        source: 'devto',
        fullName,
        url: str(a.url),
        title: truncate(a.title, 200),
        text: truncate(a.description ?? a.summary ?? ''),
        author: str(author.username || user.username) || null,
        engagement: {
          score: num(a.reactionsCount) || num(a.public_reactions_count),
          comments: num(a.commentsCount) || num(a.comments_count),
        },
        observedAt: str(a.publishedAt ?? a.published_at) || new Date().toISOString(),
      };
    },
  },
  {
    key: 'hackernews-repo-mentions',
    source: 'hackernews',
    listField: 'stories',
    map: (s, fullName) => ({
      source: 'hackernews',
      fullName,
      url: str(s.url) || `https://news.ycombinator.com/item?id=${str(s.id) || num(s.id)}`,
      title: truncate(s.title, 200),
      text: truncate(s.storyText ?? ''),
      author: str(s.by) || null,
      engagement: { score: num(s.score), comments: num(s.descendants) },
      observedAt: isoFromUnix(s.createdUtc),
    }),
  },
  {
    key: 'reddit-mentions',
    source: 'reddit',
    listField: 'posts',
    map: (p, fullName) => ({
      source: 'reddit',
      fullName,
      url: str(p.permalink) || str(p.url),
      title: truncate(p.title, 200),
      text: truncate(p.selftext ?? ''),
      author: str(p.author) || null,
      engagement: { score: num(p.score), comments: num(p.numComments) },
      observedAt: isoFromUnix(p.createdUtc),
    }),
  },
  {
    key: 'lobsters-mentions',
    source: 'lobsters',
    listField: 'stories',
    map: (s, fullName) => ({
      source: 'lobsters',
      fullName,
      url: str(s.commentsUrl) || str(s.url),
      title: truncate(s.title, 200),
      text: truncate(s.description ?? ''),
      author: str(s.by) || null,
      engagement: { score: num(s.score), comments: num(s.commentCount) },
      observedAt: isoFromUnix(s.createdUtc),
    }),
  },
  {
    key: 'bluesky-mentions',
    source: 'bluesky',
    listField: 'posts',
    map: (p, fullName) => {
      const author = (p.author ?? {}) as Record<string, unknown>;
      return {
        source: 'bluesky',
        fullName,
        url: str(p.url) || str(p.uri),
        title: truncate(p.text, 200),
        text: truncate(p.text ?? ''),
        author: str(author.handle || p.handle) || null,
        engagement: { score: num(p.likeCount) + num(p.repostCount), comments: num(p.replyCount) },
        observedAt: str(p.indexedAt) || new Date().toISOString(),
      };
    },
  },
];

export async function foldSourceFirstSnapshots(topLower: Set<string>): Promise<Mention[]> {
  const out: Mention[] = [];
  for (const adapter of SNAPSHOT_ADAPTERS) {
    if (adapter.source === 'reddit' && !REDDIT_TOPIC_ENABLED) continue;
    const snap = await readDataStore<{ mentions?: Record<string, unknown> }>(adapter.key).catch(
      () => null,
    );
    const mentions = snap?.mentions ?? {};
    for (const [fullName, bucket] of Object.entries(mentions)) {
      if (!topLower.has(fullName.toLowerCase())) continue;
      const rows = asArray((bucket as Record<string, unknown> | null)?.[adapter.listField]);
      for (const row of rows) {
        const m = adapter.map(row, fullName);
        if (m.url) out.push(m);
      }
    }
  }
  return out;
}

/** Collapse duplicate mentions (same repo + channel + url). Live HN/Bluesky
 *  searches and the source-first fold-in can surface the same item; this keeps
 *  the first occurrence so per-source counts aren't double-inflated. */
export function dedupeMentions(mentions: Mention[]): Mention[] {
  const seen = new Set<string>();
  const out: Mention[] = [];
  for (const m of mentions) {
    const k = `${m.fullName.toLowerCase()}|${m.source}|${m.url}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

// --- rollup ----------------------------------------------------------------

// `countLifetime` is the monotonic, never-drops mention count for the bucket;
// `count7d` is this run's 7d-window count. The merge below keeps lifetime from
// receding when a re-sweep's window happens to be smaller (the founder's
// "mentions should remain, not a 24h thingy").
interface RollupBucket { count7d: number; countLifetime: number; top: Mention[]; }
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
    const bucket = (r.perSource[ev.source] ??= { count7d: 0, countLifetime: 0, top: [] });
    bucket.count7d += 1;
    bucket.countLifetime += 1;
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

/** Merge one source's existing + fresh buckets so counts never drop: count7d
 *  and countLifetime take the max, `top` is the best-5 of the union (deduped by
 *  url). Used per (repo, source) by mergeRollupRepos. */
function mergeBucket(existing: RollupBucket | undefined, fresh: RollupBucket | undefined): RollupBucket {
  const exLife = existing?.countLifetime ?? existing?.count7d ?? 0;
  const frLife = fresh?.countLifetime ?? fresh?.count7d ?? 0;
  const seen = new Set<string>();
  const top: Mention[] = [];
  for (const m of [...(fresh?.top ?? []), ...(existing?.top ?? [])]) {
    if (!m.url || seen.has(m.url)) continue;
    seen.add(m.url);
    top.push(m);
  }
  top.sort((a, b) => {
    const sd = (b.engagement?.score ?? 0) - (a.engagement?.score ?? 0);
    return sd !== 0 ? sd : Date.parse(b.observedAt) - Date.parse(a.observedAt);
  });
  return {
    count7d: Math.max(existing?.count7d ?? 0, fresh?.count7d ?? 0),
    countLifetime: Math.max(exLife, frLife),
    top: top.slice(0, 5),
  };
}

/** Read-then-merge the fresh rollup over the existing one PER (repo, source) so
 *  a re-swept repo never loses prior coverage (sources not re-found this run are
 *  retained; counts take the max). Replaces the old shallow per-repo replace. */
export function mergeRollupRepos(
  existing: Record<string, RollupRepo>,
  fresh: Record<string, RollupRepo>,
): Record<string, RollupRepo> {
  const out: Record<string, RollupRepo> = {};
  for (const [k, r] of Object.entries(existing)) out[k] = r;
  for (const [k, freshRepo] of Object.entries(fresh)) {
    const ex = out[k];
    if (!ex) {
      out[k] = freshRepo;
      continue;
    }
    const perSource: Record<string, RollupBucket> = {};
    const sources = new Set([...Object.keys(ex.perSource), ...Object.keys(freshRepo.perSource)]);
    let total = 0;
    for (const s of sources) {
      const merged = mergeBucket(ex.perSource[s], freshRepo.perSource[s]);
      perSource[s] = merged;
      total += merged.count7d;
    }
    out[k] = { fullName: freshRepo.fullName, totalMentions7d: total, perSource };
  }
  return out;
}

// --- top-N selection -------------------------------------------------------

export function toRepoInput(fullName: unknown): RepoInput | null {
  if (typeof fullName !== 'string' || !fullName.includes('/')) return null;
  const [owner, name] = fullName.split('/');
  if (!owner || !name) return null;
  return { fullName, owner, name };
}

// Window priority mirrors the home page's default view (24h first), so the
// repos users actually see get swept before we spend budget on the long tail.
const TRENDING_WINDOWS = ['past_24_hours', 'past_week', 'past_month'] as const;
type TrendingFile = {
  buckets?: Record<string, Record<string, Array<{ repo_name?: string }>>>;
};

async function loadTopRepos(limit: number): Promise<RepoInput[]> {
  const seen = new Set<string>();
  const out: RepoInput[] = [];
  const push = (fullName: unknown): void => {
    if (out.length >= limit) return;
    const repo = toRepoInput(fullName);
    if (repo && !seen.has(repo.fullName.toLowerCase())) {
      seen.add(repo.fullName.toLowerCase());
      out.push(repo);
    }
  };

  // PRIMARY: the home-page repo universe. `getDerivedRepos()` builds on the
  // `trending` snapshot's "All" language slice; sweep the same set so coverage
  // lands on the rows the home page + profiles actually render. (Before
  // 2026-05-27 the sweep read only `consensus-trending`, a near-disjoint set —
  // so its HN/Bluesky hits rarely reached the home page.)
  const trending = await readDataStore<TrendingFile>('trending').catch(() => null);
  const buckets = trending?.buckets ?? {};
  for (const window of TRENDING_WINDOWS) {
    for (const row of buckets[window]?.All ?? []) push(row?.repo_name);
    if (out.length >= limit) break;
  }

  // SECONDARY: the consensus-trending ranked list (the consensus surface +
  // agents/llms). Fills any remaining budget after the home-page set.
  const ct = await readDataStore<{ items?: Array<{ fullName?: string }> }>(
    'consensus-trending',
  ).catch(() => null);
  for (const item of ct?.items ?? []) push(item?.fullName);

  // TERTIARY: the persistent registry (dropped repos), most-recently-seen
  // first, to fill any remaining budget — so dropped repos keep getting swept.
  if (out.length < limit) {
    const registry = await readDataStore<{
      repos?: Record<string, { fullName?: string; lastSeenAt?: string }>;
    }>('repo-registry').catch(() => null);
    const entries = Object.values(registry?.repos ?? {}).sort((a, b) =>
      (b.lastSeenAt ?? '') < (a.lastSeenAt ?? '') ? -1 : (b.lastSeenAt ?? '') > (a.lastSeenAt ?? '') ? 1 : 0,
    );
    for (const e of entries) push(e?.fullName);
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
    const tavilyKey = process.env.TAVILY_API_KEY?.trim();
    const apifyToken = process.env.APIFY_API_TOKEN?.trim();

    // Key-presence check — reports which optional keys are present and which
    // channels they gate, so the operator can see the activation state at a
    // glance. Tavily can light up from its key alone; Apify is two-step gated
    // so a token landing in env is reported but does not activate spend.
    // Logged at WARN so it's visible under the worker's LOG_LEVEL=warn
    // (once/day).
    ctx.log.warn(
      {
        hackernews: 'live',
        bluesky: jwt ? 'live' : 'no-creds (BLUESKY_HANDLE/APP_PASSWORD)',
        producthunt: phLaunches.length ? 'snapshot' : 'no-snapshot',
        tavily: tavilyKey ? 'live' : 'off (set TAVILY_API_KEY)',
        twitter: isApifyTokenApproved(apifyToken)
          ? `apify·top${TWITTER_BATCH_REPOS}`
          : describeApifyGate(apifyToken),
        foldIn: 'devto,hackernews,lobsters,bluesky (source-first snapshots; reddit paused)',
      },
      'cross-source-sweep channel status',
    );

    const allMentions: Mention[] = [];
    const queue = [...repos];
    let processed = 0;
    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const repo = queue.shift();
        if (!repo) return;
        const results = await Promise.allSettled([
          searchHackerNews(repo),
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

    // Fold the source-first snapshots (Dev.to / Lobsters / HN /
    // Bluesky) for our top repos into the stream + a gated, batched Apify
    // Twitter search, then de-dup so per-source counts aren't double-inflated.
    const topLower = new Set(repos.map((r) => r.fullName.toLowerCase()));
    const [folded, tweets] = await Promise.all([
      foldSourceFirstSnapshots(topLower).catch(() => [] as Mention[]),
      searchTwitterApify(repos, apifyToken).catch(() => [] as Mention[]),
    ]);
    const combinedMentions = dedupeMentions([...allMentions, ...folded, ...tweets]);

    // Build this run's rollup, then merge over the existing one so repos not
    // covered this run keep their prior detail (read-then-merge).
    const freshRepos = buildRollupRepos(combinedMentions);
    const existing = await readDataStore<RollupPayload>('repo-mentions-detail-rollup').catch(() => null);
    const mergedRepos = mergeRollupRepos(existing?.repos ?? {}, freshRepos);
    const payload: RollupPayload = {
      computedAt: new Date().toISOString(),
      windowDays: 7,
      repos: mergedRepos,
    };
    const result = await writeDataStore('repo-mentions-detail-rollup', payload);

    const sourceCounts: Record<string, number> = {};
    for (const m of combinedMentions) sourceCounts[m.source] = (sourceCounts[m.source] ?? 0) + 1;
    // WARN so the per-run outcome (per-source counts, redis publish) is visible
    // under LOG_LEVEL=warn — one line per daily run.
    ctx.log.warn(
      {
        reposSwept: processed,
        freshRepos: Object.keys(freshRepos).length,
        totalRepos: Object.keys(mergedRepos).length,
        liveMentions: allMentions.length,
        foldedMentions: folded.length,
        twitterMentions: tweets.length,
        mentions: combinedMentions.length,
        bySource: sourceCounts,
        bluesky: jwt ? 'on' : 'off',
        tavily: tavilyKey ? 'on' : 'off',
        redis: result.source,
      },
      'cross-source-sweep published',
    );
    return done(startedAt, combinedMentions.length, result.source === 'redis');
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
