import type { Logger } from 'pino';
import type { HttpClient } from '../../lib/types.js';
import type { McpServerNormalized, PackageRegistry } from '../../lib/mcp/types.js';

const BASE = 'https://registry.modelcontextprotocol.io/v0';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50; // hard cap so a buggy cursor can't loop forever

export interface OfficialServerEntry {
  // The actual registry response wraps each entry as { server: {...}, _meta: {...} }.
  server?: OfficialServerCore;
  _meta?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface OfficialServerCore {
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  repository?: { url?: string; source?: string };
  packages?: Array<{
    registryType?: string;
    registry_name?: string;
    identifier?: string;
    name?: string;
    version?: string;
    runtimeHint?: string;
    [k: string]: unknown;
  }>;
  remotes?: Array<{ url?: string; type?: string; transport_type?: string }>;
  [k: string]: unknown;
}

interface ListResponse {
  servers?: OfficialServerEntry[];
  next_cursor?: string | null;
  total?: number;
}

export async function fetchAllOfficial(
  http: HttpClient,
  log: Logger,
): Promise<McpServerNormalized[]> {
  const seen = new Map<string, McpServerNormalized>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url: string =
      `${BASE}/servers?limit=${PAGE_LIMIT}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const { data }: { data: ListResponse } = await http.json<ListResponse>(url, { timeoutMs: 20_000 });
    const servers = Array.isArray(data.servers) ? data.servers : [];
    for (const s of servers) {
      const norm = normalizeOfficial(s);
      if (!norm) continue;
      // Registry returns one row per published version. Keep the first
      // occurrence per name — the API returns newest-first.
      if (!seen.has(norm.name)) seen.set(norm.name, norm);
    }
    cursor = data.next_cursor ?? null;
    if (!cursor || servers.length === 0) break;
  }
  const out = Array.from(seen.values());
  log.debug({ count: out.length }, 'official mcp registry fetch complete');
  return out;
}

export function normalizeOfficial(entry: OfficialServerEntry): McpServerNormalized | null {
  const s: OfficialServerCore = entry.server ?? (entry as unknown as OfficialServerCore);
  const name = s.name?.trim();
  if (!name) return null;

  const githubUrl = pickGithubUrl(s);
  const owner = githubOwner(githubUrl) ?? ownerFromName(name);
  const pkg = pickPackage(s.packages ?? []);
  const title = s.title?.trim() || name;

  return {
    source: 'official',
    source_id: name,
    name: title,
    owner,
    qualified_name: name,
    package_name: pkg?.name ?? null,
    package_registry: pkg?.registry ?? null,
    github_url: githubUrl,
    github_stars: null,
    downloads_total: null,
    popularity_signal: 0,
    security_grade: null,
    is_remote: Array.isArray(s.remotes) && s.remotes.length > 0,
    description: s.description?.trim() ?? null,
    raw: entry as unknown as Record<string, unknown>,
  };
}

function pickGithubUrl(s: OfficialServerCore): string | null {
  const url = s.repository?.url;
  if (typeof url === 'string' && /github\.com/i.test(url)) return url;
  return null;
}

function ownerFromName(name: string): string | null {
  // Registry names are like "ac.inference.sh/mcp" or "io.github.foo/bar".
  // Take the segment before the first "/" as a coarse owner. Mainly useful
  // when there's no github_url to derive from.
  if (!name.includes('/')) return null;
  const head = name.split('/')[0]!;
  // io.github.<user>.<repo> shape
  const ghMatch = head.match(/^io\.github\.([^.]+)$/i);
  if (ghMatch) return ghMatch[1]!.toLowerCase();
  return head.toLowerCase();
}

function githubOwner(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\/+/, '').split('/');
    return parts[0]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

interface PickedPackage {
  registry: PackageRegistry;
  name: string;
}

function pickPackage(pkgs: NonNullable<OfficialServerCore['packages']>): PickedPackage | null {
  // Prefer npm > pypi > docker > others. The registry uses both `registryType`
  // (newer schema) and `registry_name` (older); each entry's name field can be
  // `identifier` or `name` depending on schema version.
  const order: Array<[string, PackageRegistry]> = [
    ['npm', 'npm'],
    ['pypi', 'pypi'],
    ['docker', 'docker'],
    ['go', 'go'],
    ['cargo', 'cargo'],
  ];
  for (const [match, normalized] of order) {
    const found = pkgs.find((p) => {
      const reg = (p.registryType ?? p.registry_name ?? '').toLowerCase();
      const id = p.identifier ?? p.name;
      return reg.includes(match) && id;
    });
    if (found) {
      const id = found.identifier ?? found.name;
      if (id) return { registry: normalized, name: id };
    }
  }
  const fallback = pkgs.find((p) => p.identifier ?? p.name);
  if (fallback) {
    const id = fallback.identifier ?? fallback.name;
    if (id) return { registry: 'unknown', name: id };
  }
  return null;
}

