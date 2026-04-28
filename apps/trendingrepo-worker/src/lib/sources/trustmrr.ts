// TrustMRR catalog client + URL match helpers. Ported from
// scripts/_trustmrr.mjs to keep the worker self-contained.
//
// - paginated catalog fetch (paced under 20 req/min)
// - URL normalization for website ↔ repo.homepage matching
// - match pass that produces RevenueOverlay rows

import { fetchJsonWithRetry, sleep } from '../util/http-helpers.js';

export const TRUSTMRR_BASE_URL = 'https://trustmrr.com/api/v1';
export const TRUSTMRR_PAGE_SIZE = 50; // docs say max 50
export const TRUSTMRR_PAGE_INTERVAL_MS = 3_500;
export const TRUSTMRR_MAX_PAGES = 200;

export interface TrustmrrStartup {
  slug: string;
  website?: string | null;
  category?: string | null;
  customers?: number | null;
  activeSubscriptions?: number | null;
  paymentProvider?: string | null;
  growthMRR30d?: number | null;
  revenue?: {
    mrr?: number | null;
    last30Days?: number | null;
    total?: number | null;
  } | null;
}

export interface TrustmrrApiPage {
  data?: TrustmrrStartup[];
  meta?: {
    total?: number;
    hasMore?: boolean;
  };
}

export interface FetchAllStartupsOptions {
  apiKey: string;
  baseUrl?: string;
  pageSize?: number;
  intervalMs?: number;
  maxPages?: number;
  onPage?: (info: { page: number; pageSize: number; received: number; total: number | null }) => void;
}

export interface FetchAllStartupsResult {
  startups: TrustmrrStartup[];
  total: number;
  pages: number;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'User-Agent': 'Mozilla/5.0 (compatible)',
  };
}

export async function fetchAllStartups({
  apiKey,
  baseUrl = TRUSTMRR_BASE_URL,
  pageSize = TRUSTMRR_PAGE_SIZE,
  intervalMs = TRUSTMRR_PAGE_INTERVAL_MS,
  maxPages = TRUSTMRR_MAX_PAGES,
  onPage,
}: FetchAllStartupsOptions): Promise<FetchAllStartupsResult> {
  if (!apiKey) {
    throw new Error('fetchAllStartups: apiKey is required');
  }
  const headers = authHeaders(apiKey);
  const collected: TrustmrrStartup[] = [];
  let page = 1;
  let total: number | null = null;

  while (page <= maxPages) {
    const url = `${baseUrl}/startups?page=${page}&limit=${pageSize}&sort=revenue-desc`;
    const body = await fetchJsonWithRetry<TrustmrrApiPage>(url, {
      headers,
      attempts: 4,
      retryDelayMs: 2_000,
      timeoutMs: 20_000,
    });
    const rows = Array.isArray(body?.data) ? body.data : [];
    total = body?.meta?.total ?? total ?? null;
    collected.push(...rows);
    if (typeof onPage === 'function') {
      onPage({ page, pageSize, received: rows.length, total });
    }
    const hasMore = Boolean(body?.meta?.hasMore) && rows.length > 0;
    if (!hasMore) break;
    page += 1;
    await sleep(intervalMs);
  }

  return { startups: collected, total: total ?? collected.length, pages: page };
}

export const PATH_SENSITIVE_HOSTS = new Set<string>([
  'x.com',
  'twitter.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'reddit.com',
  'threads.net',
  'mastodon.social',
  'bsky.app',
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'sourceforge.net',
  'huggingface.co',
  'kaggle.com',
  'colab.research.google.com',
  't.me',
  'telegram.me',
  'discord.com',
  'discord.gg',
  'whatsapp.com',
  'medium.com',
  'substack.com',
  'dev.to',
  'hashnode.com',
  'notion.so',
  'notion.site',
  'apps.apple.com',
  'itunes.apple.com',
  'play.google.com',
  'chromewebstore.google.com',
  'microsoftedge.microsoft.com',
  'linktr.ee',
  'bit.ly',
  'tinyurl.com',
  'beacons.ai',
  'bio.link',
]);

export function normalizeUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  return `${host}${path}`;
}

export function normalizeHost(raw: string | null | undefined): string | null {
  const normalized = normalizeUrl(raw);
  if (!normalized) return null;
  const slash = normalized.indexOf('/');
  const host = slash === -1 ? normalized : normalized.slice(0, slash);
  if (PATH_SENSITIVE_HOSTS.has(host)) return null;
  return host;
}

export interface RepoHomepage {
  fullName: string;
  homepage?: string | null;
  websiteUrl?: string | null;
}

export interface RevenueOverlay {
  tier: 'verified_trustmrr';
  fullName: string;
  trustmrrSlug: string;
  mrrCents: number | null;
  last30DaysCents: number | null;
  totalCents: number | null;
  growthMrr30d: number | null;
  customers: number | null;
  activeSubscriptions: number | null;
  paymentProvider: string | null;
  category: string | null;
  asOf: string;
  matchConfidence: 'exact' | 'host' | 'manual';
  sourceUrl: string;
}

function dollarsToCents(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function toOverlay(
  fullName: string,
  s: TrustmrrStartup,
  matchConfidence: RevenueOverlay['matchConfidence'],
  generatedAt: string,
): RevenueOverlay {
  return {
    tier: 'verified_trustmrr',
    fullName,
    trustmrrSlug: s.slug,
    mrrCents: dollarsToCents(s.revenue?.mrr),
    last30DaysCents: dollarsToCents(s.revenue?.last30Days),
    totalCents: dollarsToCents(s.revenue?.total),
    growthMrr30d:
      typeof s.growthMRR30d === 'number' && Number.isFinite(s.growthMRR30d)
        ? s.growthMRR30d
        : null,
    customers: typeof s.customers === 'number' ? s.customers : null,
    activeSubscriptions:
      typeof s.activeSubscriptions === 'number' ? s.activeSubscriptions : null,
    paymentProvider: s.paymentProvider ?? null,
    category: s.category ?? null,
    asOf: generatedAt,
    matchConfidence,
    sourceUrl: `https://trustmrr.com/startup/${s.slug}`,
  };
}

export interface BuildOverlaysOptions {
  startups: TrustmrrStartup[];
  repos: RepoHomepage[];
  manualMatches?: Record<string, string>;
  generatedAt: string;
}

export function buildOverlays({
  startups,
  repos,
  manualMatches = {},
  generatedAt,
}: BuildOverlaysOptions): Record<string, RevenueOverlay> {
  const byExact = new Map<string, TrustmrrStartup>();
  const byHost = new Map<string, TrustmrrStartup>();
  const bySlug = new Map<string, TrustmrrStartup>();

  for (const s of startups) {
    if (!s || typeof s.slug !== 'string') continue;
    bySlug.set(s.slug, s);
    const mrr = s?.revenue?.mrr;
    if (typeof mrr !== 'number' || mrr <= 0) continue;
    const exact = normalizeUrl(s.website);
    const host = normalizeHost(s.website);
    if (exact && !byExact.has(exact)) byExact.set(exact, s);
    if (host && !byHost.has(host)) byHost.set(host, s);
  }

  const overlays: Record<string, RevenueOverlay> = {};
  const seenSlugs = new Set<string>();

  for (const repo of repos) {
    if (!repo || typeof repo.fullName !== 'string') continue;
    const homepage = repo.homepage ?? repo.websiteUrl ?? null;
    if (!homepage) continue;
    const exact = normalizeUrl(homepage);
    const host = normalizeHost(homepage);
    let match: TrustmrrStartup | null = null;
    let confidence: RevenueOverlay['matchConfidence'] | null = null;
    if (exact && byExact.has(exact)) {
      match = byExact.get(exact) ?? null;
      confidence = 'exact';
    } else if (host && byHost.has(host)) {
      match = byHost.get(host) ?? null;
      confidence = 'host';
    }
    if (match && confidence && !seenSlugs.has(match.slug)) {
      overlays[repo.fullName] = toOverlay(repo.fullName, match, confidence, generatedAt);
      seenSlugs.add(match.slug);
    }
  }

  for (const [fullName, slug] of Object.entries(manualMatches)) {
    if (!slug) continue;
    const match = bySlug.get(slug);
    if (!match) continue;
    overlays[fullName] = toOverlay(fullName, match, 'manual', generatedAt);
  }

  return overlays;
}
