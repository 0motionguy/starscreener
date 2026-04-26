// Pure npm-helper functions ported from scripts/scrape-npm.mjs.
// Network calls live in the fetcher; everything here is pure transformation
// for testability + reuse.

export const WINDOWS = ['24h', '7d', '30d'] as const;
export type NpmWindow = (typeof WINDOWS)[number];

export const DEFAULT_NPM_DISCOVERY_QUERIES: string[] = [
  'ai',
  'llm',
  'agent',
  'mcp',
  'rag',
  'openai',
  'anthropic',
  'claude',
  'ollama',
  'embedding',
  'react',
  'next',
  'vite',
  'cli',
];

export function parseDiscoveryQueries(raw: string | undefined | null): string[] {
  const source =
    typeof raw === 'string' && raw.trim().length > 0
      ? raw.split(/[,\n]/)
      : DEFAULT_NPM_DISCOVERY_QUERIES;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of source) {
    const query = String(entry ?? '').trim();
    if (query.length < 2) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(query);
  }
  return out;
}

export function encodePackageName(name: string): string {
  return encodeURIComponent(String(name));
}

export function npmPackageUrl(name: string): string {
  return `https://www.npmjs.com/package/${String(name)}`;
}

export function normalizeRepositoryUrl(repository: unknown): string | null {
  const raw =
    typeof repository === 'string'
      ? repository
      : typeof (repository as { url?: string } | undefined)?.url === 'string'
        ? (repository as { url: string }).url
        : '';
  if (!raw) return null;
  let url = raw.trim();
  url = url.replace(/^git\+/, '');
  url = url.replace(/^git:\/\//, 'https://');
  url = url.replace(/^ssh:\/\/git@github\.com\//i, 'https://github.com/');
  url = url.replace(/^git@github\.com:/i, 'https://github.com/');
  url = url.replace(/\.git(#.*)?$/i, '');
  url = url.replace(/#.*$/, '');
  url = url.replace(/\/+$/, '');
  if (/^github\.com\//i.test(url)) url = `https://${url}`;
  return url || null;
}

export function extractGithubRepoFullName(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = String(url).match(
    /github\.com[:/]([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)/i,
  );
  if (!match || !match[1] || !match[2]) return null;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, '');
  return `${owner}/${repo}`;
}

export interface DownloadStat {
  downloads24h: number;
  previous24h: number;
  delta24h: number;
  deltaPct24h: number;
  downloads7d: number;
  previous7d: number;
  delta7d: number;
  deltaPct7d: number;
  downloads30d: number;
  previous30d: number;
  delta30d: number;
  deltaPct30d: number;
  trendScore24h: number;
  trendScore7d: number;
  trendScore30d: number;
}

function sumDownloads(days: Array<{ downloads: number }>): number {
  return days.reduce((sum, day) => sum + Math.max(0, Number(day.downloads) || 0), 0);
}

function pctDelta(current: number, previous: number): number {
  if (previous > 0) return ((current - previous) / previous) * 100;
  return current > 0 ? 100 : 0;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

function computeMoverScore(current: number, previous: number): number {
  const delta = current - previous;
  if (current <= 0 || delta <= 0) return 0;
  const cappedPct = Math.min(500, Math.max(0, pctDelta(current, previous)));
  const volumeWeight = Math.log10(current + 10);
  const deltaWeight = Math.log10(delta + 10);
  return Math.round(cappedPct * volumeWeight + deltaWeight * 25);
}

export function computeDownloadStats(
  downloads: Array<{ day: string; downloads: number }>,
): DownloadStat {
  const days = Array.isArray(downloads)
    ? downloads.slice().sort((a, b) => String(a?.day ?? '').localeCompare(String(b?.day ?? '')))
    : [];
  const lastDay = days.length > 0 ? days[days.length - 1] : null;
  const prevLastDay = days.length > 1 ? days[days.length - 2] : null;
  const downloads24h = lastDay ? Math.max(0, Number(lastDay.downloads) || 0) : 0;
  const previous24h = prevLastDay ? Math.max(0, Number(prevLastDay.downloads) || 0) : 0;
  const downloads7d = sumDownloads(days.slice(-7));
  const previous7d = sumDownloads(days.slice(-14, -7));
  const downloads30d = sumDownloads(days.slice(-30));
  const previous30d = sumDownloads(days.slice(-60, -30));
  return {
    downloads24h,
    previous24h,
    delta24h: downloads24h - previous24h,
    deltaPct24h: roundPct(pctDelta(downloads24h, previous24h)),
    downloads7d,
    previous7d,
    delta7d: downloads7d - previous7d,
    deltaPct7d: roundPct(pctDelta(downloads7d, previous7d)),
    downloads30d,
    previous30d,
    delta30d: downloads30d - previous30d,
    deltaPct30d: roundPct(pctDelta(downloads30d, previous30d)),
    trendScore24h: computeMoverScore(downloads24h, previous24h),
    trendScore7d: computeMoverScore(downloads7d, previous7d),
    trendScore30d: computeMoverScore(downloads30d, previous30d),
  };
}

export interface NpmCandidate {
  name: string;
  npmUrl: string;
  description: string | null;
  latestVersion: string | null;
  publishedAt: string | null;
  repositoryUrl: string | null;
  linkedRepo: string | null;
  homepage: string | null;
  keywords: string[];
  discovery: {
    queries: string[];
    searchScore: number;
    finalScore: number;
    weeklyDownloads: number;
    monthlyDownloads: number;
  };
}

interface NpmSearchObject {
  package?: {
    name?: string;
    description?: string;
    version?: string;
    date?: string;
    keywords?: string[];
    links?: {
      npm?: string;
      homepage?: string;
      repository?: string;
    };
  };
  searchScore?: number;
  score?: { final?: number };
  downloads?: { weekly?: number; monthly?: number };
}

export function normalizeSearchObject(object: NpmSearchObject, query: string): NpmCandidate | null {
  const pkg = object?.package;
  if (!pkg) return null;
  const name = typeof pkg.name === 'string' ? pkg.name : '';
  if (!name) return null;
  const repositoryUrl = normalizeRepositoryUrl(pkg.links?.repository);
  const linkedRepo = extractGithubRepoFullName(repositoryUrl);
  if (!linkedRepo) return null;
  return {
    name,
    npmUrl: typeof pkg.links?.npm === 'string' ? pkg.links.npm : npmPackageUrl(name),
    description: typeof pkg.description === 'string' ? pkg.description : null,
    latestVersion: typeof pkg.version === 'string' ? pkg.version : null,
    publishedAt: typeof pkg.date === 'string' ? pkg.date : null,
    repositoryUrl,
    linkedRepo,
    homepage: typeof pkg.links?.homepage === 'string' ? pkg.links.homepage : null,
    keywords: Array.isArray(pkg.keywords) ? pkg.keywords.filter(Boolean).slice(0, 12) : [],
    discovery: {
      queries: [query],
      searchScore: Number(object?.searchScore) || 0,
      finalScore: Number(object?.score?.final) || 0,
      weeklyDownloads: Math.max(0, Number(object?.downloads?.weekly) || 0),
      monthlyDownloads: Math.max(0, Number(object?.downloads?.monthly) || 0),
    },
  };
}

export function mergeCandidate(existing: NpmCandidate | undefined, next: NpmCandidate): NpmCandidate {
  if (!existing) return next;
  const queries = new Set([...existing.discovery.queries, ...next.discovery.queries]);
  return {
    ...existing,
    description: existing.description ?? next.description,
    latestVersion: existing.latestVersion ?? next.latestVersion,
    publishedAt: existing.publishedAt ?? next.publishedAt,
    repositoryUrl: existing.repositoryUrl ?? next.repositoryUrl,
    linkedRepo: existing.linkedRepo ?? next.linkedRepo,
    homepage: existing.homepage ?? next.homepage,
    keywords: Array.from(new Set([...existing.keywords, ...next.keywords])).slice(0, 12),
    discovery: {
      queries: Array.from(queries),
      searchScore: Math.max(existing.discovery.searchScore, next.discovery.searchScore),
      finalScore: Math.max(existing.discovery.finalScore, next.discovery.finalScore),
      weeklyDownloads: Math.max(existing.discovery.weeklyDownloads, next.discovery.weeklyDownloads),
      monthlyDownloads: Math.max(existing.discovery.monthlyDownloads, next.discovery.monthlyDownloads),
    },
  };
}

export interface DownloadRange {
  start: string;
  end: string;
  days: number;
}

function utcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface ResolveDownloadRangeOptions {
  days?: number;
  now?: Date;
  endDate?: string | undefined;
  lagDays?: number;
}

export function resolveDownloadRange(opts: ResolveDownloadRangeOptions = {}): DownloadRange {
  const RANGE_DAYS = 60;
  const safeDays = Math.max(1, Number.parseInt(String(opts.days ?? RANGE_DAYS), 10) || RANGE_DAYS);
  const safeLagDays = Math.max(0, Number.parseInt(String(opts.lagDays ?? 2), 10) || 0);
  const endDate = opts.endDate;
  const now = opts.now ?? new Date();
  const end =
    typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
      ? new Date(`${endDate}T00:00:00.000Z`)
      : addUtcDays(utcDateOnly(now), -safeLagDays);
  const start = addUtcDays(end, -(safeDays - 1));
  return { start: formatDateKey(start), end: formatDateKey(end), days: safeDays };
}

export function normalizeRangePayload(
  payload: { downloads?: Array<{ day?: string; downloads?: number }> } | null | undefined,
): Array<{ day: string; downloads: number }> {
  const rows = Array.isArray(payload?.downloads) ? payload.downloads : [];
  return rows
    .map((row) => ({
      day: typeof row?.day === 'string' ? row.day.slice(0, 10) : '',
      downloads: Math.max(0, Number(row?.downloads) || 0),
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function metricForWindow(row: DownloadStat, window: NpmWindow): number {
  if (window === '24h') return row.trendScore24h ?? 0;
  if (window === '7d') return row.trendScore7d ?? 0;
  return row.trendScore30d ?? 0;
}

export function deltaForWindow(row: DownloadStat, window: NpmWindow): number {
  if (window === '24h') return row.delta24h ?? 0;
  if (window === '7d') return row.delta7d ?? 0;
  return row.delta30d ?? 0;
}

export function deltaPctForWindow(row: DownloadStat, window: NpmWindow): number {
  if (window === '24h') return row.deltaPct24h ?? 0;
  if (window === '7d') return row.deltaPct7d ?? 0;
  return row.deltaPct30d ?? 0;
}

export function sortByWindow<T extends DownloadStat & { name: string; downloads30d: number }>(
  rows: T[],
  window: NpmWindow,
): T[] {
  return rows.slice().sort((a, b) => {
    const byMetric = metricForWindow(b, window) - metricForWindow(a, window);
    if (byMetric !== 0) return byMetric;
    const byPct = deltaPctForWindow(b, window) - deltaPctForWindow(a, window);
    if (byPct !== 0) return byPct;
    const byDelta = deltaForWindow(b, window) - deltaForWindow(a, window);
    if (byDelta !== 0) return byDelta;
    const byDownloads = (b.downloads30d ?? 0) - (a.downloads30d ?? 0);
    if (byDownloads !== 0) return byDownloads;
    return a.name.localeCompare(b.name);
  });
}
