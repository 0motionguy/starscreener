// ProductHunt GraphQL helpers + token pool + redirect/discovery utilities.
//
// Mirrors scripts/_ph-shared.mjs. Differences from the script port:
//   - PH GraphQL goes through ctx.http (POST) so retries are consistent
//   - The curl-based redirect resolver is replaced with undici's
//     redirect-following fetch using a browser UA. Cloudflare's TLS
//     fingerprint check on producthunt.com/r/* still trips on Node, so
//     unresolved redirects fall back to "leave as-is" (the discovery pass
//     still tries to extract github/x links from the original URL).

import { fetch as undiciFetch } from 'undici';
import type { HttpClient } from '../types.js';
import {
  extractFirstGithubRepoLink,
  normalizeGithubRepoUrl,
  type FirstGithubRepoLink,
} from '../util/github-repo-links.js';

export const USER_AGENT =
  'StarScreener-worker/0.1 (+https://github.com/0motionguy/starscreener; producthunt)';

export const PH_GRAPHQL_URL = 'https://api.producthunt.com/v2/api/graphql';

export const TOPICS = [
  'artificial-intelligence',
  'developer-tools',
  'saas',
  'productivity',
];

export const AI_KEYWORDS = [
  'llm',
  'agent',
  'agents',
  'mcp',
  'skill',
  'skills',
  'claude',
  'gpt',
  'openai',
  'anthropic',
  'copilot',
  'llama',
  'mistral',
  'gemini',
  'rag',
  'vector',
  'embedding',
  'prompt',
  'chatbot',
  'fine-tun',
  'inference',
  'genai',
  'generative ai',
  'ai-powered',
  'ai agent',
  'model context',
  'open source',
];

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export function hasAiKeyword(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  return AI_KEYWORDS.some((kw) => lower.includes(kw));
}

// Token pool — round-robin across N PH tokens. PRODUCTHUNT_TOKENS (plural,
// comma-separated) is canonical; PRODUCTHUNT_TOKEN (singular) is back-compat.
export function loadProducthuntTokens(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (k: string | undefined): void => {
    const v = (k ?? '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  const pool = process.env.PRODUCTHUNT_TOKENS;
  if (typeof pool === 'string' && pool.length > 0) {
    for (const raw of pool.split(',')) push(raw);
  }
  push(process.env.PRODUCTHUNT_TOKEN);
  return out;
}

let _phCursor = 0;
export function pickToken(tokens: string[]): string {
  const t = tokens[_phCursor % tokens.length];
  _phCursor += 1;
  if (!t) throw new Error('producthunt: token pool empty');
  return t;
}

export interface PhGraphQLOpts {
  http: HttpClient;
  token: string;
}

export async function phGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  opts: PhGraphQLOpts,
): Promise<T> {
  const { http, token } = opts;
  if (!token) throw new Error('PRODUCTHUNT_TOKEN is required');
  const { data } = await http.json<{ data?: T; errors?: Array<{ message?: string }> }>(
    PH_GRAPHQL_URL,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': USER_AGENT,
      },
      body: { query, variables },
      useEtagCache: false,
      timeoutMs: 20_000,
    },
  );
  if (data.errors && data.errors.length > 0) {
    throw new Error(`PH GraphQL error: ${data.errors.map((e) => e.message).join('; ')}`);
  }
  return data.data as T;
}

export function extractGithubLink(text: string): FirstGithubRepoLink | null {
  return extractFirstGithubRepoLink(text);
}

const X_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
  'mobile.x.com',
]);

const RESERVED_X_PATHS = new Set([
  'home',
  'search',
  'explore',
  'hashtag',
  'i',
  'intent',
  'share',
  'compose',
  'messages',
  'notifications',
  'settings',
  'login',
]);

const URL_ATTR_RE = /\b(?:href|content)\s*=\s*["']([^"'#][^"']*)["']/gi;
const ABSOLUTE_URL_RE = /https?:\/\/[^\s"'<>`\\]+/gi;
const DISCOVER_TIMEOUT_MS = 8000;
const DISCOVER_HTML_LIMIT = 250_000;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function stripTrailingPunctuation(value: unknown): string {
  return String(value ?? '').replace(/[),.;:!?]+$/, '');
}

export function normalizeXUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!X_HOSTS.has(host)) return null;
  const segments = parsed.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length < 1) return null;
  const handleRaw = segments[0] ?? '';
  const handle = handleRaw.replace(/^@+/, '');
  if (!handle) return null;
  if (RESERVED_X_PATHS.has(handle.toLowerCase())) return null;
  if ((segments[1] ?? '').toLowerCase() === 'status' && segments[2]) {
    const statusId = stripTrailingPunctuation(segments[2]);
    if (!statusId) return null;
    return `https://x.com/${handle}/status/${statusId}`;
  }
  return `https://x.com/${handle}`;
}

export function extractXLink(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null;
  const scan = text.replace(/\\\//g, '/');
  ABSOLUTE_URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ABSOLUTE_URL_RE.exec(scan)) !== null) {
    const candidate = stripTrailingPunctuation(match[0] ?? '');
    const normalized = normalizeXUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export interface DiscoveredLinks {
  githubUrl: string | null;
  xUrl: string | null;
}

export function extractLinkedUrls(text: string, baseUrl?: string): DiscoveredLinks {
  const sources: string[] = [];
  if (typeof baseUrl === 'string' && baseUrl) sources.push(baseUrl);
  if (typeof text === 'string' && text) sources.push(text.replace(/\\\//g, '/'));

  let githubUrl: string | null = null;
  let xUrl: string | null = null;

  const accept = (raw: string | null | undefined): void => {
    if (!raw || typeof raw !== 'string') return;
    let candidate = stripTrailingPunctuation(raw.trim());
    if (!candidate) return;
    if (baseUrl) {
      try {
        candidate = new URL(candidate, baseUrl).toString();
      } catch {
        return;
      }
    }
    if (!githubUrl) githubUrl = normalizeGithubRepoUrl(candidate);
    if (!xUrl) xUrl = normalizeXUrl(candidate);
  };

  for (const source of sources) {
    URL_ATTR_RE.lastIndex = 0;
    let attr: RegExpExecArray | null;
    while ((attr = URL_ATTR_RE.exec(source)) !== null) {
      accept(attr[1] ?? '');
      if (githubUrl && xUrl) return { githubUrl, xUrl };
    }
    ABSOLUTE_URL_RE.lastIndex = 0;
    let absolute: RegExpExecArray | null;
    while ((absolute = ABSOLUTE_URL_RE.exec(source)) !== null) {
      accept(absolute[0] ?? '');
      if (githubUrl && xUrl) return { githubUrl, xUrl };
    }
  }
  return { githubUrl, xUrl };
}

export async function discoverLinkedUrls(url: string | null | undefined): Promise<DiscoveredLinks> {
  if (!url || typeof url !== 'string') return { githubUrl: null, xUrl: null };

  const direct = extractLinkedUrls(url, url);
  if (direct.githubUrl || direct.xUrl) return direct;

  try {
    const res = await undiciFetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'user-agent': BROWSER_UA,
      },
      signal: AbortSignal.timeout(DISCOVER_TIMEOUT_MS),
    });
    const finalUrl = res.url || url;
    const links = extractLinkedUrls(finalUrl, finalUrl);
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml+xml')
    ) {
      return links;
    }
    const html = await res.text();
    const merged = extractLinkedUrls(html.slice(0, DISCOVER_HTML_LIMIT), finalUrl);
    return {
      githubUrl: links.githubUrl ?? merged.githubUrl,
      xUrl: links.xUrl ?? merged.xUrl,
    };
  } catch {
    return { githubUrl: null, xUrl: null };
  }
}

/**
 * Resolve a producthunt.com/r/<code> tracking redirect to the final URL using
 * undici's fetch with a browser UA. PH/Cloudflare's TLS fingerprint check
 * still trips on Node sometimes; on failure we just return null and the
 * caller keeps the original URL.
 */
export async function resolveRedirect(url: string | null | undefined): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('producthunt.com/r/')) return url;
  try {
    const res = await undiciFetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'user-agent': BROWSER_UA,
      },
      signal: AbortSignal.timeout(DISCOVER_TIMEOUT_MS),
    });
    const finalUrl = res.url || url;
    if (!finalUrl || !finalUrl.startsWith('http')) return null;
    try {
      const u = new URL(finalUrl);
      for (const key of Array.from(u.searchParams.keys())) {
        if (key === 'ref' || key.startsWith('utm_')) {
          u.searchParams.delete(key);
        }
      }
      return u.toString().replace(/\?$/, '');
    } catch {
      return finalUrl;
    }
  } catch {
    return null;
  }
}

export function daysBetween(isoA: string, isoB?: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB ?? new Date().toISOString()).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

// GitHub enrichment for launches that resolved to a github.com URL.
const KEYWORD_TAGS: Array<{ tag: string; keywords: string[] }> = [
  { tag: 'mcp', keywords: ['mcp', 'model-context-protocol', 'model context protocol'] },
  { tag: 'claude-skill', keywords: ['claude skill', 'claude-skill', 'claude skills'] },
  { tag: 'agent', keywords: ['agent', 'agents', 'agentic'] },
  { tag: 'llm', keywords: ['llm', 'large language model'] },
  { tag: 'rag', keywords: ['rag', 'retrieval-augmented', 'retrieval augmented'] },
  { tag: 'chatbot', keywords: ['chatbot', 'chat bot'] },
  { tag: 'fine-tune', keywords: ['fine-tun', 'finetun'] },
  { tag: 'vector-db', keywords: ['vector db', 'vector database', 'pgvector'] },
];

interface GhRepoMeta {
  description?: string | null;
  topics?: string[];
  stargazers_count?: number;
}

interface GhReadme {
  content?: string;
  encoding?: string;
}

async function ghFetch<T>(http: HttpClient, path: string, token: string | null): Promise<T | null> {
  const url = `https://api.github.com${path}`;
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': USER_AGENT,
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const { data } = await http.json<T>(url, {
      headers,
      useEtagCache: false,
      timeoutMs: 10_000,
    });
    return data;
  } catch {
    return null;
  }
}

export interface GithubEnrichmentResult {
  stars: number;
  topics: string[];
  readmeSnippet: string;
  tags: string[];
}

export async function enrichWithGithub(
  http: HttpClient,
  fullName: string,
  opts: { token?: string | null } = {},
): Promise<GithubEnrichmentResult | null> {
  if (!fullName || !fullName.includes('/')) return null;
  const [owner, repo] = fullName.split('/', 2);
  if (!owner || !repo) return null;
  const token = opts.token ?? null;
  const meta = await ghFetch<GhRepoMeta>(
    http,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    token,
  );
  if (!meta) return null;
  const topics = Array.isArray(meta.topics) ? meta.topics.slice(0, 20) : [];

  const readmeRes = await ghFetch<GhReadme>(
    http,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
    token,
  );
  let readmeSnippet = '';
  if (readmeRes?.content && readmeRes.encoding === 'base64') {
    try {
      const decoded = Buffer.from(readmeRes.content, 'base64').toString('utf8');
      readmeSnippet = decoded.slice(0, 500);
    } catch {
      readmeSnippet = '';
    }
  }

  const blob = [meta.description ?? '', readmeSnippet, topics.join(' ')]
    .join(' ')
    .toLowerCase();
  const tags = new Set<string>();
  for (const t of topics) {
    const slug = String(t).toLowerCase();
    if (slug === 'mcp' || slug === 'model-context-protocol') tags.add('mcp');
    if (slug.includes('agent')) tags.add('agent');
    if (slug === 'llm' || slug === 'large-language-model') tags.add('llm');
    if (slug === 'rag') tags.add('rag');
    if (slug.includes('chatbot')) tags.add('chatbot');
    if (slug === 'ai' || slug === 'artificial-intelligence') tags.add('ai');
  }
  for (const { tag, keywords } of KEYWORD_TAGS) {
    if (keywords.some((kw) => blob.includes(kw))) tags.add(tag);
  }
  return {
    stars: Number.isFinite(meta.stargazers_count) ? Number(meta.stargazers_count) : 0,
    topics,
    readmeSnippet,
    tags: Array.from(tags),
  };
}

/** Pick a GitHub PAT from GH_TOKEN_POOL (round-robin) or GH_PAT/GITHUB_TOKEN. */
export function pickGithubToken(): string | null {
  const pool = (process.env.GH_TOKEN_POOL ?? '').trim();
  if (pool) {
    const tokens = pool
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (tokens.length > 0) {
      const idx = Math.floor(Math.random() * tokens.length);
      const tok = tokens[idx];
      if (tok) return tok;
    }
  }
  const single = (process.env.GH_PAT ?? process.env.GITHUB_TOKEN ?? '').trim();
  return single || null;
}
