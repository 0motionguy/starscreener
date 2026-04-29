import type { Logger } from 'pino';
import type { HttpClient } from '../../lib/types.js';
import type { McpServerNormalized, SecurityGrade } from '../../lib/mcp/types.js';

const BASE = 'https://glama.ai/api/mcp/v1';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

// Glama exposes a server-listing endpoint (`/servers`) that returns the
// metadata captured below, plus a separate ranking endpoint that surfaces
// install/visitor counts. Some tenants also see install/usage counts inline
// on `/servers` entries. As of 2026-04-29 Glama's public docs only formally
// document the basic listing fields; the visitor/install/popularity fields
// below are speculative — we forward them only when upstream emits them as
// finite numbers. Unknown fields fall through `[k: string]: unknown` and stay
// in `raw` as-is.
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
  // Speculative numeric fields — Glama probes. Only forwarded into the
  // metrics subobject when upstream returns finite numbers.
  visitors?: number;
  visitors_4w?: number;
  visitorsLastFourWeeks?: number;
  visitors_last_four_weeks?: number;
  use_count?: number;
  useCount?: number;
  installs?: number;
  install_count?: number;
  popularity?: number;
  popularity_24h?: number;
  popularity_7d?: number;
  popularity_30d?: number;
  last24Hours?: number;
  last7Days?: number;
  last30Days?: number;
  [k: string]: unknown;
}

// Unified metrics subobject persisted at `trending_items.raw.glama.metrics`.
// Field names are the contract M4 (publish/projection) consumes. Mirrors the
// pulsemcp shape so the UI can read either source uniformly.
export interface GlamaMetrics {
  /** Glama 4-week visitor count if upstream returns one (gap as of 2026-04-29). */
  visitors_4w?: number;
  /** Total install/use count when Glama exposes it. */
  use_count?: number;
  /** Trailing-24h popularity (gap upstream — kept for forward compat). */
  popularity_24h?: number;
  /** Trailing-7d popularity (gap upstream — kept for forward compat). */
  popularity_7d?: number;
  /** Trailing-30d popularity (gap upstream — kept for forward compat). */
  popularity_30d?: number;
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

  const metrics = buildMetrics(s);

  // Preserve upstream entry verbatim AND add a normalized `metrics` sibling.
  // Existing readers that walk `raw.glama.*` keep working; M4's projection
  // layer reads `raw.glama.metrics.*`.
  const rawWithMetrics: Record<string, unknown> = {
    ...(s as unknown as Record<string, unknown>),
    metrics,
  };

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
    raw: rawWithMetrics,
  };
}

// Build the unified metrics subobject. Each field is only set when the
// upstream payload contains a finite number — we never coerce nulls/strings.
// Missing fields stay `undefined`, NOT 0, so consumers can distinguish
// "Glama doesn't expose this" from "metric is zero".
export function buildMetrics(s: GlamaServerEntry): GlamaMetrics {
  const out: GlamaMetrics = {};
  const visitors4w =
    pickFinite(s.visitors_4w) ??
    pickFinite(s.visitorsLastFourWeeks) ??
    pickFinite(s.visitors_last_four_weeks) ??
    pickFinite(s.visitors);
  if (visitors4w !== undefined) out.visitors_4w = visitors4w;

  const useCount =
    pickFinite(s.use_count) ??
    pickFinite(s.useCount) ??
    pickFinite(s.installs) ??
    pickFinite(s.install_count) ??
    pickFinite(s.downloads);
  if (useCount !== undefined) out.use_count = useCount;

  const pop24 = pickFinite(s.popularity_24h) ?? pickFinite(s.last24Hours);
  if (pop24 !== undefined) out.popularity_24h = pop24;
  const pop7 = pickFinite(s.popularity_7d) ?? pickFinite(s.last7Days);
  if (pop7 !== undefined) out.popularity_7d = pop7;
  const pop30 = pickFinite(s.popularity_30d) ?? pickFinite(s.last30Days);
  if (pop30 !== undefined) out.popularity_30d = pop30;

  return out;
}

function pickFinite(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
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
