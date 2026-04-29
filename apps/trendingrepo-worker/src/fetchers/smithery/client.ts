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

export function normalizeSmithery(s: SmitheryServerEntry): McpServerNormalized | null {
  const name = (s.displayName ?? s.qualifiedName)?.trim();
  if (!name) return null;
  const qn = (s.qualifiedName ?? name).toLowerCase();

  const owner = s.namespace?.toLowerCase() ?? ownerFromQn(qn);
  const installs = num(s.useCount);

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
    raw: s as unknown as Record<string, unknown>,
  };
}

function num(v: number | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function ownerFromQn(qn: string): string | null {
  if (qn.includes('/')) return qn.split('/')[0]!.toLowerCase();
  return null;
}
