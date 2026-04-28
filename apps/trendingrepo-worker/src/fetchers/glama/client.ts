import type { Logger } from 'pino';
import type { HttpClient } from '../../lib/types.js';
import type { McpServerNormalized, SecurityGrade } from '../../lib/mcp/types.js';

const BASE = 'https://glama.ai/api/mcp/v1';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

export interface GlamaServerEntry {
  id?: string;
  name?: string;
  slug?: string;
  namespace?: string;
  description?: string;
  repository?: { url?: string };
  attributes?: string[];
  spdxLicense?: { name?: string };
  tools?: unknown[];
  url?: string;
  // Optional fields some entries include (rankings/metrics endpoints).
  security_grade?: string;
  grade?: string;
  github_stars?: number;
  stars?: number;
  downloads?: number;
  [k: string]: unknown;
}

interface ListResponse {
  servers?: GlamaServerEntry[];
  pageInfo?: { endCursor?: string | null; hasNextPage?: boolean };
}

export async function fetchAllGlama(
  http: HttpClient,
  log: Logger,
  apiKey?: string,
): Promise<McpServerNormalized[]> {
  const out: McpServerNormalized[] = [];
  const headers: Record<string, string> = {};
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url: string =
      `${BASE}/servers?first=${PAGE_LIMIT}` + (cursor ? `&after=${encodeURIComponent(cursor)}` : '');
    const { data }: { data: ListResponse } = await http.json<ListResponse>(url, { headers, timeoutMs: 20_000 });
    const servers = data.servers ?? [];
    for (const s of servers) {
      const norm = normalizeGlama(s);
      if (norm) out.push(norm);
    }
    if (!data.pageInfo?.hasNextPage) break;
    cursor = data.pageInfo?.endCursor ?? null;
    if (!cursor || servers.length === 0) break;
  }
  log.debug({ count: out.length }, 'glama fetch complete');
  return out;
}

export function normalizeGlama(s: GlamaServerEntry): McpServerNormalized | null {
  const name = (s.name ?? s.slug)?.trim();
  if (!name) return null;
  const namespace = s.namespace?.trim() ?? null;
  const qualified = namespace ? `${namespace}/${name}` : name;

  const githubUrl = s.repository?.url ?? null;
  const owner = githubUrl ? githubOwner(githubUrl) : namespace;

  const stars = num(s.github_stars ?? s.stars);
  const downloads = num(s.downloads);
  const isRemote =
    Array.isArray(s.attributes) && s.attributes.some((a) => a.toLowerCase().startsWith('hosting:remote'));

  return {
    source: 'glama',
    source_id: s.id ?? qualified,
    name,
    owner,
    qualified_name: qualified,
    package_name: null,
    package_registry: null,
    github_url: githubUrl,
    github_stars: stars,
    downloads_total: downloads,
    popularity_signal: signalFrom(stars, downloads),
    security_grade: parseGrade(s.security_grade ?? s.grade),
    is_remote: isRemote,
    description: s.description?.trim() ?? null,
    raw: s as unknown as Record<string, unknown>,
  };
}

function parseGrade(g: string | undefined): SecurityGrade | null {
  if (!g) return null;
  const upper = g.toUpperCase().trim();
  if (upper === 'A' || upper === 'B' || upper === 'C' || upper === 'F') return upper;
  return null;
}

function num(v: number | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function signalFrom(stars: number | null, downloads: number | null): number {
  // Normalize to ~0..1 within glama. Coarse log-scaling; merger takes max
  // across sources so the absolute scale needn't match across providers.
  const s = stars ?? 0;
  const d = downloads ?? 0;
  const score = Math.log10(1 + Math.max(s, d / 100));
  // log10(1+1e6) ≈ 6 → cap around there.
  return Math.min(score / 6, 1);
}

function githubOwner(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\/+/, '').split('/');
    return parts[0]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}
