// Reddit fetch helpers — OAuth primary, public-JSON fallback (via Apify
// residential proxy if APIFY_API_TOKEN is set), with RSS-Atom degradation
// when Reddit's edge IP-blocks the JSON listing endpoints.
//
// Mirrors scripts/_reddit-shared.mjs. Uses apifyAwareFetch instead of
// ctx.http for the public-JSON path because Railway IPs (datacenter range)
// are likely blocked by Reddit just like GH Actions runners — the proxy
// rotation is the fix.

import { apifyAwareFetch, isApifyProxyEnabled } from '../util/apify-proxy.js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUEST_PAUSE_MS = 5000;

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const PUBLIC_REDDIT_ORIGIN = 'https://www.reddit.com';
const TOKEN_URL = `${PUBLIC_REDDIT_ORIGIN}/api/v1/access_token`;
const REDDIT_UA_POOL_CONFIG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../config/reddit-user-agents.json',
);

interface OAuthCacheEntry {
  cacheKey: string;
  accessToken: string;
  expiresAtMs: number;
}

let oauthTokenCache: OAuthCacheEntry | null = null;
let fetchRuntime = createFetchRuntime();
let userAgentPoolIndex = 0;
const quarantinedUserAgents = new Map<string, number>();

function readDefaultUserAgentsFromConfig(): string[] {
  try {
    const raw = readFileSync(REDDIT_UA_POOL_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [DEFAULT_USER_AGENT];
    const normalized = parsed
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
    return normalized.length > 0 ? normalized : [DEFAULT_USER_AGENT];
  } catch {
    return [DEFAULT_USER_AGENT];
  }
}

export interface FetchRuntime {
  preferredMode: 'oauth' | 'public-json' | null;
  activeMode: 'oauth' | 'public-json' | null;
  fallbackUsed: boolean;
  oauthFailures: number;
  oauthRequests: number;
  publicRequests: number;
  lastOauthError: string | null;
  apifyProxyUsed: boolean;
}

function createFetchRuntime(): FetchRuntime {
  return {
    preferredMode: null,
    activeMode: null,
    fallbackUsed: false,
    oauthFailures: 0,
    oauthRequests: 0,
    publicRequests: 0,
    lastOauthError: null,
    apifyProxyUsed: false,
  };
}

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export function getRedditUserAgent(): string {
  const exact = readEnv('REDDIT_USER_AGENT');
  if (exact) return exact;

  const pool = readRedditUserAgentPool();
  const userAgent = pool[userAgentPoolIndex % pool.length] ?? DEFAULT_USER_AGENT;
  userAgentPoolIndex = (userAgentPoolIndex + 1) % pool.length;
  return userAgent;
}

function readRedditUserAgentPool(): string[] {
  const raw = readEnv('REDDIT_USER_AGENTS');
  if (!raw) return readDefaultUserAgentsFromConfig();
  const pool = raw
    .split(/[,\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return pool.length > 0 ? pool : readDefaultUserAgentsFromConfig();
}

function isUserAgentQuarantined(userAgent: string): boolean {
  const untilMs = quarantinedUserAgents.get(userAgent);
  if (!untilMs) return false;
  if (untilMs <= Date.now()) {
    quarantinedUserAgents.delete(userAgent);
    return false;
  }
  return true;
}

function quarantineUserAgentLocal(userAgent: string, durationMs: number): void {
  const untilMs = Date.now() + Math.max(1000, durationMs);
  quarantinedUserAgents.set(userAgent, untilMs);
}

export async function selectUserAgent(): Promise<string> {
  const exact = readEnv('REDDIT_USER_AGENT');
  if (exact) return exact;
  const pool = readRedditUserAgentPool();
  for (let attempt = 0; attempt < pool.length; attempt += 1) {
    const idx = (userAgentPoolIndex + attempt) % pool.length;
    const userAgent = pool[idx] ?? DEFAULT_USER_AGENT;
    if (!isUserAgentQuarantined(userAgent)) {
      userAgentPoolIndex = (idx + 1) % pool.length;
      return userAgent;
    }
  }
  throw new Error('All Reddit User-Agents quarantined');
}

export function hasRedditOAuthCreds(): boolean {
  return readEnv('REDDIT_CLIENT_ID').length > 0;
}

export function getRedditAuthMode(): 'oauth' | 'public-json' {
  return hasRedditOAuthCreds() ? 'oauth' : 'public-json';
}

export function getRedditFetchRuntime(): FetchRuntime {
  return { ...fetchRuntime };
}

export function resetRedditFetchRuntime(): void {
  fetchRuntime = createFetchRuntime();
  oauthTokenCache = null;
  userAgentPoolIndex = 0;
  quarantinedUserAgents.clear();
}

function resolveOauthApiUrl(url: string): string {
  if (!hasRedditOAuthCreds()) return url;
  const resolved = new URL(url);
  if (resolved.origin === PUBLIC_REDDIT_ORIGIN) {
    resolved.protocol = 'https:';
    resolved.host = 'oauth.reddit.com';
  }
  return resolved.toString();
}

function rewriteToOldReddit(url: string): string {
  try {
    const u = new URL(url);
    if (u.origin === PUBLIC_REDDIT_ORIGIN) {
      u.protocol = 'https:';
      u.host = 'old.reddit.com';
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

function rewriteToRss(url: string): string {
  try {
    const u = new URL(url);
    if (!u.pathname.match(/\/r\/[A-Za-z0-9_]+\/new\.json$/)) return url;
    u.pathname = u.pathname.replace(/\.json$/, '/.rss');
    return u.toString();
  } catch {
    return url;
  }
}

async function getRedditAccessToken(): Promise<string | null> {
  if (!hasRedditOAuthCreds()) return null;
  const clientId = readEnv('REDDIT_CLIENT_ID');
  const clientSecret = process.env.REDDIT_CLIENT_SECRET ?? '';
  const cacheKey = `${clientId}:${clientSecret}`;
  const now = Date.now();
  if (
    oauthTokenCache &&
    oauthTokenCache.cacheKey === cacheKey &&
    oauthTokenCache.expiresAtMs > now + 60_000
  ) {
    return oauthTokenCache.accessToken;
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  const tokenBody = new URLSearchParams({ grant_type: 'client_credentials' }).toString();

  const res = await apifyAwareFetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basicAuth}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      'user-agent': await selectUserAgent(),
    },
    body: tokenBody,
    timeoutMs: 15_000,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`reddit oauth ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
  }
  const token = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!token?.access_token) {
    throw new Error('reddit oauth token response missing access_token');
  }
  const expiresInSec =
    Number.isFinite(token.expires_in) && (token.expires_in ?? 0) > 0
      ? Number(token.expires_in)
      : 3600;
  oauthTokenCache = {
    cacheKey,
    accessToken: token.access_token,
    expiresAtMs: now + expiresInSec * 1000,
  };
  return oauthTokenCache.accessToken;
}

const SUBREDDIT_FROM_PATH_RE = /\/r\/([A-Za-z0-9_]+)\/new(?:\.json|\/\.rss)/;

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#32;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function extractTagBody(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = xml.match(re);
  return m ? m[1] ?? null : null;
}

function extractTagAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\s${attr}="([^"]*)"`, 'i');
  const m = xml.match(re);
  return m ? m[1] ?? null : null;
}

export interface RedditPostData {
  id: string;
  name?: string;
  title: string;
  author?: string;
  subreddit: string;
  url: string;
  permalink: string;
  selftext: string;
  is_self?: boolean;
  created_utc: number;
  score: number;
  num_comments: number;
  link_flair_text: string | null;
  _source?: string;
}

export interface RedditListingResponse {
  data: {
    children: Array<{ data: RedditPostData }>;
    after?: string | null;
    before?: string | null;
  };
}

export function parseRedditAtomFeed(
  xmlText: string,
  fallbackSubreddit: string,
): RedditListingResponse {
  const children: Array<{ data: RedditPostData }> = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xmlText)) !== null) {
    const entry = m[1] ?? '';
    const idRaw = extractTagBody(entry, 'id');
    const idMatch = idRaw?.match(/t3_([a-z0-9]+)/i);
    if (!idMatch) continue;
    const id = idMatch[1] ?? '';

    const titleRaw = extractTagBody(entry, 'title') ?? '';
    const title = decodeHtmlEntities(titleRaw).trim();
    if (!title) continue;

    const published = extractTagBody(entry, 'published');
    const createdMs = published ? Date.parse(published) : NaN;
    if (!Number.isFinite(createdMs)) continue;
    const created_utc = Math.floor(createdMs / 1000);

    const authorBlock = extractTagBody(entry, 'author') ?? '';
    const authorName = extractTagBody(authorBlock, 'name') ?? '';
    const author = authorName.replace(/^\/u\//, '').trim();

    const subreddit = extractTagAttr(entry, 'category', 'term') ?? fallbackSubreddit ?? '';
    const linkHref = extractTagAttr(entry, 'link', 'href') ?? '';
    const contentRaw = extractTagBody(entry, 'content') ?? '';
    const contentHtml = decodeHtmlEntities(contentRaw);
    const isSelf = linkHref.includes(`/comments/${id}/`);

    let permalink = '';
    if (isSelf) {
      const pm = linkHref.match(/(\/r\/[^/]+\/comments\/[^/]+\/[^/?#]+\/?)/);
      permalink = pm?.[1] ?? '';
    } else {
      const pm = contentHtml.match(
        /href="https:\/\/www\.reddit\.com(\/r\/[^/]+\/comments\/[^/]+\/[^/?"#]+\/?)/,
      );
      permalink = pm?.[1] ?? `/r/${subreddit}/comments/${id}/`;
    }

    let selftext = '';
    if (isSelf) {
      const sm = contentHtml.match(/<!--\s*SC_OFF\s*-->([\s\S]*?)<!--\s*SC_ON\s*-->/);
      if (sm && sm[1]) selftext = stripHtmlTags(sm[1]).slice(0, 5000);
    }
    const url = isSelf ? `https://www.reddit.com${permalink}` : linkHref;

    children.push({
      data: {
        id,
        name: `t3_${id}`,
        title,
        author,
        subreddit,
        url,
        permalink,
        selftext,
        is_self: isSelf,
        created_utc,
        score: 0,
        num_comments: 0,
        link_flair_text: null,
        _source: 'rss-atom',
      },
    });
  }
  return { data: { children, after: null, before: null } };
}

const PUBLIC_HEADERS_BASE: Record<string, string> = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'accept-encoding': 'gzip, deflate, br',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'sec-ch-ua':
    '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
};

async function publicHeaders(): Promise<Record<string, string>> {
  return { ...PUBLIC_HEADERS_BASE, 'user-agent': await selectUserAgent() };
}

async function fetchTextWithRetry(
  url: string,
  init: { headers: Record<string, string>; method?: string; body?: string },
  attempts = 2,
): Promise<string> {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await apifyAwareFetch(url, {
        method: init.method ?? 'GET',
        headers: init.headers,
        body: init.body,
        timeoutMs: 15_000,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (attempt < attempts && (res.status >= 500 || res.status === 429)) {
          lastErr = new Error(`HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        const err = new Error(`HTTP ${res.status} ${res.statusText} - ${url}`);
        (err as Error & { status?: number }).status = res.status;
        throw err;
      }
      return await res.text();
    } catch (err) {
      lastErr = err as Error;
      if (attempt >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr ?? new Error(`fetchTextWithRetry: exhausted attempts for ${url}`);
}

async function fetchJsonWithRetry(
  url: string,
  init: { headers: Record<string, string>; method?: string; body?: string },
  attempts = 2,
): Promise<unknown> {
  const text = await fetchTextWithRetry(url, init, attempts);
  return JSON.parse(text);
}

export async function fetchRedditJson(url: string): Promise<RedditListingResponse> {
  fetchRuntime.preferredMode = hasRedditOAuthCreds() ? 'oauth' : 'public-json';
  if (isApifyProxyEnabled()) fetchRuntime.apifyProxyUsed = true;

  if (!hasRedditOAuthCreds()) {
    fetchRuntime.activeMode = 'public-json';
    fetchRuntime.publicRequests += 1;

    const rssUrl = rewriteToRss(url);
    if (rssUrl !== url) {
      const subMatch = url.match(SUBREDDIT_FROM_PATH_RE);
      const fallbackSub = subMatch?.[1] ?? '';
      const rssText = await fetchTextWithRetry(rssUrl, {
        headers: {
          ...(await publicHeaders()),
          accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      return parseRedditAtomFeed(rssText, fallbackSub);
    }
    return (await fetchJsonWithRetry(rewriteToOldReddit(url), {
      headers: await publicHeaders(),
    })) as RedditListingResponse;
  }

  try {
    const accessToken = await getRedditAccessToken();
    fetchRuntime.activeMode = 'oauth';
    fetchRuntime.oauthRequests += 1;
    const result = (await fetchJsonWithRetry(resolveOauthApiUrl(url), {
      headers: {
        ...(await publicHeaders()),
        authorization: `Bearer ${accessToken ?? ''}`,
      },
    })) as RedditListingResponse;
    return result;
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    let userAgent: string | null = null;
    try {
      userAgent = await selectUserAgent();
    } catch {
      userAgent = null;
    }
    if (userAgent && status === 429) {
      quarantineUserAgentLocal(userAgent, 10 * 60 * 1000);
    } else if (userAgent && status === 403) {
      quarantineUserAgentLocal(userAgent, 60 * 60 * 1000);
    } else if (userAgent && status != null && status >= 500 && status <= 599) {
      quarantineUserAgentLocal(userAgent, 60 * 1000);
    }
    const fallbackAllowed =
      status == null ||
      [401, 403, 408, 429, 500, 502, 503, 504].includes(status);

    fetchRuntime.oauthFailures += 1;
    fetchRuntime.lastOauthError = (err as Error).message ?? String(err);
    if (!fallbackAllowed) throw err;

    fetchRuntime.fallbackUsed = true;
    fetchRuntime.activeMode = 'public-json';
    fetchRuntime.publicRequests += 1;

    const rssUrl = rewriteToRss(url);
    if (rssUrl !== url) {
      const subMatch = url.match(SUBREDDIT_FROM_PATH_RE);
      const fallbackSub = subMatch?.[1] ?? '';
      const rssText = await fetchTextWithRetry(rssUrl, {
        headers: {
          ...(await publicHeaders()),
          accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      return parseRedditAtomFeed(rssText, fallbackSub);
    }
    return (await fetchJsonWithRetry(rewriteToOldReddit(url), {
      headers: await publicHeaders(),
    })) as RedditListingResponse;
  }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
