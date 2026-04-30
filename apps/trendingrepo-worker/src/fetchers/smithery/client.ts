import type { Logger } from 'pino';
import type { HttpClient } from '../../lib/types.js';
import type { McpServerNormalized } from '../../lib/mcp/types.js';

const BASE = 'https://registry.smithery.ai';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

export interface SmitheryServerEntry {
  id?: string;
  qualifiedName?: string;
  namespace?: string;
  slug?: string;
  displayName?: string;
  description?: string;
  iconUrl?: string;
  verified?: boolean;
  useCount?: number;
  remote?: boolean;
  isDeployed?: boolean;
  homepage?: string;
  owner?: string;
  score?: number | null;
  createdAt?: string;
  [k: string]: unknown;
}

interface ListResponse {
  servers?: SmitheryServerEntry[];
  pagination?: { currentPage?: number; pageSize?: number; totalPages?: number; totalCount?: number };
}

export async function fetchAllSmithery(
  http: HttpClient,
  log: Logger,
  apiKey: string,
): Promise<McpServerNormalized[]> {
  const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };

  const out: McpServerNormalized[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url: string = `${BASE}/servers?page=${page}&pageSize=${PAGE_SIZE}`;
    const { data }: { data: ListResponse } = await http.json<ListResponse>(url, { headers, timeoutMs: 20_000 });
    const servers = data.servers ?? [];
    for (const s of servers) {
      const norm = normalizeSmithery(s);
      if (norm) out.push(norm);
    }
    const totalPages = data.pagination?.totalPages ?? 1;
    if (servers.length === 0 || page >= totalPages) break;
  }
  log.debug({ count: out.length }, 'smithery fetch complete');
  return out;
}

// Unified metrics shape consumed downstream as `raw.smithery.metrics.*`.
// Source of truth for which numeric fields the Smithery /servers endpoint
// actually exposes (verified via live probe 2026-04-29). The list endpoint
// at https://registry.smithery.ai/servers carries only:
//   - useCount   (lifetime connections, integer)
//   - score      (Smithery quality score, 0..1 float, nullable)
// The detail endpoint /servers/{name} exposes NO numeric fields beyond
// what's in the listing — no visitors, no time-windowed popularity. So
// visitors_4w, popularity_24h, popularity_7d, popularity_30d are always
// undefined for this source. They are kept in the type contract for
// cross-source uniformity (M4 consumes the same metrics shape across
// pulsemcp/glama/official). When/if Smithery exposes those, only this
// mapper changes.
export interface SmitheryMetrics {
  visitors_4w?: number;        // not exposed by Smithery — always undefined
  use_count?: number;          // from useCount
  popularity_24h?: number;     // not exposed by Smithery — always undefined
  popularity_7d?: number;      // not exposed by Smithery — always undefined
  popularity_30d?: number;     // not exposed by Smithery — always undefined
  quality_score?: number;      // from score (0..1)
}

export function buildSmitheryMetrics(s: SmitheryServerEntry): SmitheryMetrics {
  const m: SmitheryMetrics = {};
  if (typeof s.useCount === 'number' && Number.isFinite(s.useCount)) {
    m.use_count = s.useCount;
  }
  if (typeof s.score === 'number' && Number.isFinite(s.score)) {
    m.quality_score = s.score;
  }
  return m;
}

export function normalizeSmithery(s: SmitheryServerEntry): McpServerNormalized | null {
  const name = (s.displayName ?? s.qualifiedName)?.trim();
  if (!name) return null;
  const qn = (s.qualifiedName ?? name).toLowerCase();

  const owner = s.namespace?.toLowerCase() ?? ownerFromQn(qn);
  const installs = num(s.useCount);

  // Metrics are nested into raw so the merger's `raw[source] = n.raw`
  // assignment surfaces them as `raw.smithery.metrics.*` on trending_items.
  // Spread the original entry first so existing field names (useCount,
  // qualifiedName, etc.) remain accessible to legacy consumers untouched.
  const rawWithMetrics: Record<string, unknown> = {
    ...(s as unknown as Record<string, unknown>),
    metrics: buildSmitheryMetrics(s),
  };

  return {
    source: 'smithery',
    source_id: s.id ?? s.qualifiedName ?? name,
    name,
    owner,
    qualified_name: qn,
    package_name: null,
    package_registry: null,
    github_url: null,
    github_stars: null,
    downloads_total: installs,
    popularity_signal: installs !== null ? Math.min(Math.log10(1 + installs) / 5, 1) : 0,
    security_grade: null,
    is_remote: Boolean(s.remote),
    description: s.description?.trim() ?? null,
    raw: rawWithMetrics,
  };
}

function num(v: number | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function ownerFromQn(qn: string): string | null {
  if (qn.includes('/')) return qn.split('/')[0]!.toLowerCase();
  return null;
}
