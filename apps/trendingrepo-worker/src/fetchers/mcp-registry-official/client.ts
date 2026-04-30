import type { Logger } from 'pino';
import type { HttpClient } from '../../lib/types.js';
import type { McpServerNormalized, PackageRegistry } from '../../lib/mcp/types.js';

const BASE = 'https://registry.modelcontextprotocol.io/v0';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50; // hard cap so a buggy cursor can't loop forever

// Namespaces under `_meta` that registry-spec implementations may use to
// surface install/usage metrics. The official Anthropic registry currently
// does NOT emit any of these (as of 2026-04-29) — entries return only
// publishing metadata (publisher, version, packages, remotes). We probe these
// namespaces so that if/when the upstream adds telemetry it flows through
// automatically without a code change.
const META_NS_OFFICIAL = 'io.modelcontextprotocol/server';
const META_NS_OFFICIAL_ALT = 'io.modelcontextprotocol/registry';
const META_NS_PULSEMCP = 'com.pulsemcp/server';

export interface OfficialServerEntry {
  // The actual registry response wraps each entry as { server: {...}, _meta: {...} }.
  server?: OfficialServerCore;
  _meta?: Record<string, unknown>;
  [k: string]: unknown;
}

// Plausibly-emitted numeric fields under any of the META_NS_* namespaces.
// Mirrors the speculative probe-set used by pulsemcp; only finite numbers
// make it into the metrics subobject.
interface OfficialMeta {
  visitorsEstimateLastFourWeeks?: number;
  visitors_4w?: number;
  visitors?: number;
  useCount?: number;
  use_count?: number;
  installs?: number;
  install_count?: number;
  activeInstalls?: number;
  popularity_24h?: number;
  popularity_7d?: number;
  popularity_30d?: number;
  last24Hours?: number;
  last7Days?: number;
  last30Days?: number;
  [k: string]: unknown;
}

// Unified metrics subobject persisted at `trending_items.raw.official.metrics`.
// Field names are the contract M4 (publish/projection) consumes. Mirrors the
// glama / pulsemcp shape so the UI can read either source uniformly.
//
// As of 2026-04-29 the official Anthropic registry does NOT expose any of
// these fields, so this subobject is almost always `{}`. Shape is kept
// uniform with the other MCP sources so M4 doesn't branch on source.
export interface OfficialMetrics {
  /** Trailing-4-week visitor count (gap upstream — kept for forward compat). */
  visitors_4w?: number;
  /** Total install/use count (gap upstream — kept for forward compat). */
  use_count?: number;
  /** Trailing-24h popularity (gap upstream — kept for forward compat). */
  popularity_24h?: number;
  /** Trailing-7d popularity (gap upstream — kept for forward compat). */
  popularity_7d?: number;
  /** Trailing-30d popularity (gap upstream — kept for forward compat). */
  popularity_30d?: number;
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

  const metrics = buildMetrics(entry);

  // Preserve upstream envelope verbatim AND add a normalized `metrics`
  // sibling. Existing readers that walk `raw.official._meta.*` keep working;
  // M4's projection layer reads `raw.official.metrics.*`.
  const rawWithMetrics: Record<string, unknown> = {
    ...(entry as unknown as Record<string, unknown>),
    metrics,
  };

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
    raw: rawWithMetrics,
  };
}

// Build the unified metrics subobject. Reads `_meta` under any of the known
// registry-spec namespaces. Each field is only set when upstream returns a
// finite number — undefined fields stay undefined so consumers can
// distinguish "registry doesn't expose this" from "metric is zero".
export function buildMetrics(entry: OfficialServerEntry): OfficialMetrics {
  const meta = readMeta(entry);
  const out: OfficialMetrics = {};

  const visitors4w =
    pickFinite(meta.visitorsEstimateLastFourWeeks) ??
    pickFinite(meta.visitors_4w) ??
    pickFinite(meta.visitors);
  if (visitors4w !== undefined) out.visitors_4w = visitors4w;

  const useCount =
    pickFinite(meta.useCount) ??
    pickFinite(meta.use_count) ??
    pickFinite(meta.installs) ??
    pickFinite(meta.install_count) ??
    pickFinite(meta.activeInstalls);
  if (useCount !== undefined) out.use_count = useCount;

  const pop24 = pickFinite(meta.popularity_24h) ?? pickFinite(meta.last24Hours);
  if (pop24 !== undefined) out.popularity_24h = pop24;
  const pop7 = pickFinite(meta.popularity_7d) ?? pickFinite(meta.last7Days);
  if (pop7 !== undefined) out.popularity_7d = pop7;
  const pop30 = pickFinite(meta.popularity_30d) ?? pickFinite(meta.last30Days);
  if (pop30 !== undefined) out.popularity_30d = pop30;

  return out;
}

function readMeta(entry: OfficialServerEntry): OfficialMeta {
  const m = entry._meta;
  if (!m || typeof m !== 'object') return {};
  const merged: OfficialMeta = {};
  for (const ns of [META_NS_OFFICIAL, META_NS_OFFICIAL_ALT, META_NS_PULSEMCP]) {
    const nested = (m as Record<string, unknown>)[ns];
    if (nested && typeof nested === 'object') {
      Object.assign(merged, nested as OfficialMeta);
    }
    // Flat dotted keys: "<ns>.<field>": value
    for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
      if (k.startsWith(`${ns}.`)) {
        merged[k.slice(ns.length + 1)] = v;
      }
    }
  }
  return merged;
}

function pickFinite(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
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

