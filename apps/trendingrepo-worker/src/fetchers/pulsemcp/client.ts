import type { Logger } from 'pino';
import type { HttpClient } from '../../lib/types.js';
import type { McpServerNormalized, PackageRegistry } from '../../lib/mcp/types.js';

// PulseMCP implements the Generic MCP Registry API (same shape as the
// official registry), with PulseMCP-specific extensions under
// `_meta.com.pulsemcp/server`. Auth: X-API-Key. Pagination: count_per_page.
const BASE = 'https://api.pulsemcp.com/v0.1';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const PULSE_META_NS = 'com.pulsemcp/server';

// PulseMCP `_meta` extensions documented on https://www.pulsemcp.com/api
//
// As of 2026-04-29 the public docs only formally document
// `visitorsEstimateLastFourWeeks`; the page also says "more in the works".
// We additionally probe a handful of plausibly-emitted install/usage fields
// (useCount, activeInstalls, last24Hours/last7Days/last30Days) so that if/when
// PulseMCP enables them on a tenant key they'll flow through automatically.
// Fields not emitted by upstream stay `undefined` in the metrics subobject
// (we never fabricate values).
interface PulseMeta {
  visitorsEstimateLastFourWeeks?: number;
  isOfficial?: boolean;
  // Below are speculative — only forwarded if upstream emits them as numbers.
  useCount?: number;
  activeInstalls?: number;
  last24Hours?: number;
  last7Days?: number;
  last30Days?: number;
  // Security analysis varies by vendor; tolerated as a generic blob.
  [k: string]: unknown;
}

// Unified metrics subobject persisted at `trending_items.raw.pulsemcp.metrics`.
// Field names are the contract M4 (publish/projection) consumes.
export interface PulseMcpMetrics {
  /** _meta.com.pulsemcp/server.visitorsEstimateLastFourWeeks */
  visitors_4w?: number;
  /** _meta.com.pulsemcp/server.useCount, falling back to activeInstalls */
  use_count?: number;
  /** _meta.com.pulsemcp/server.last24Hours — undefined when upstream omits */
  popularity_24h?: number;
  /** _meta.com.pulsemcp/server.last7Days — undefined when upstream omits */
  popularity_7d?: number;
  /** _meta.com.pulsemcp/server.last30Days — undefined when upstream omits */
  popularity_30d?: number;
}

// Each entry in the servers array is wrapped: { server: {...}, _meta: {...} }
export interface PulseServerEnvelope {
  server?: PulseServerCore;
  _meta?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface PulseServerCore {
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
    [k: string]: unknown;
  }>;
  remotes?: Array<{ url?: string; type?: string; transport_type?: string }>;
  [k: string]: unknown;
}

interface ListResponse {
  servers?: PulseServerEnvelope[];
  next_cursor?: string | null;
  total?: number;
}

export interface PulseAuth {
  apiKey: string;
  /** Optional. Some PulseMCP plans require X-Tenant-ID alongside the key. */
  tenantId?: string;
}

export async function fetchAllPulseMcp(
  http: HttpClient,
  log: Logger,
  auth: PulseAuth,
): Promise<McpServerNormalized[]> {
  const headers: Record<string, string> = { 'X-API-Key': auth.apiKey };
  if (auth.tenantId) headers['X-Tenant-ID'] = auth.tenantId;

  const seen = new Map<string, McpServerNormalized>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url: string =
      `${BASE}/servers?count_per_page=${PAGE_SIZE}` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const { data }: { data: ListResponse } = await http.json<ListResponse>(url, {
      headers,
      timeoutMs: 20_000,
    });
    const servers = Array.isArray(data.servers) ? data.servers : [];
    for (const env of servers) {
      const norm = normalizePulse(env);
      if (!norm) continue;
      // Same dedup-by-name as official registry: keep first occurrence per name.
      if (!seen.has(norm.name)) seen.set(norm.name, norm);
    }
    cursor = data.next_cursor ?? null;
    if (!cursor || servers.length === 0) break;
  }
  const out = Array.from(seen.values());
  log.debug({ count: out.length }, 'pulsemcp fetch complete');
  return out;
}

export function normalizePulse(envelope: PulseServerEnvelope): McpServerNormalized | null {
  const s: PulseServerCore = envelope.server ?? (envelope as unknown as PulseServerCore);
  const name = s.name?.trim();
  if (!name) return null;

  const meta = readPulseMeta(envelope);
  const githubUrl = pickGithubUrl(s);
  const owner = githubOwner(githubUrl) ?? ownerFromName(name);
  const pkg = pickPackage(s.packages ?? []);
  const title = s.title?.trim() || name;

  const visitors = typeof meta.visitorsEstimateLastFourWeeks === 'number'
    ? meta.visitorsEstimateLastFourWeeks
    : null;

  const metrics = buildMetrics(meta);

  // Preserve the upstream envelope verbatim AND add a normalized `metrics`
  // sibling. Downstream readers that already poke at _meta keep working;
  // M4's publish/projection layer reads `raw.pulsemcp.metrics.*` instead.
  const rawWithMetrics: Record<string, unknown> = {
    ...(envelope as unknown as Record<string, unknown>),
    metrics,
  };

  return {
    source: 'pulsemcp',
    source_id: name,
    name: title,
    owner,
    qualified_name: name,
    package_name: pkg?.name ?? null,
    package_registry: pkg?.registry ?? null,
    github_url: githubUrl,
    github_stars: null,
    downloads_total: visitors,
    popularity_signal: visitors !== null ? Math.min(Math.log10(1 + visitors) / 6, 1) : 0,
    security_grade: null,
    is_remote: Array.isArray(s.remotes) && s.remotes.length > 0,
    description: s.description?.trim() ?? null,
    raw: rawWithMetrics,
  };
}

// Build the unified metrics subobject. Each field is only set when the
// upstream payload contains a finite number — we never coerce nulls/strings.
// Missing fields stay `undefined`, NOT 0, so consumers can distinguish
// "PulseMCP doesn't expose this for this tenant" from "metric is zero".
export function buildMetrics(meta: PulseMeta): PulseMcpMetrics {
  const out: PulseMcpMetrics = {};
  if (isFiniteNumber(meta.visitorsEstimateLastFourWeeks)) {
    out.visitors_4w = meta.visitorsEstimateLastFourWeeks;
  }
  // useCount preferred; fall back to activeInstalls (some integrations name
  // it that). Only one of the two will land in `use_count`.
  if (isFiniteNumber(meta.useCount)) {
    out.use_count = meta.useCount;
  } else if (isFiniteNumber(meta.activeInstalls)) {
    out.use_count = meta.activeInstalls;
  }
  if (isFiniteNumber(meta.last24Hours)) {
    out.popularity_24h = meta.last24Hours;
  }
  if (isFiniteNumber(meta.last7Days)) {
    out.popularity_7d = meta.last7Days;
  }
  if (isFiniteNumber(meta.last30Days)) {
    out.popularity_30d = meta.last30Days;
  }
  return out;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

interface PickedPackage {
  registry: PackageRegistry;
  name: string;
}

function pickPackage(pkgs: NonNullable<PulseServerCore['packages']>): PickedPackage | null {
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

function readPulseMeta(env: PulseServerEnvelope): PulseMeta {
  const m = env._meta;
  if (!m || typeof m !== 'object') return {};
  // Two shapes seen in registry-spec implementations:
  //   { "com.pulsemcp/server": { visitorsEstimate...: 123 } }   (nested)
  //   { "com.pulsemcp/server.visitorsEstimateLastFourWeeks": 123 } (flat)
  const nested = (m as Record<string, unknown>)[PULSE_META_NS];
  if (nested && typeof nested === 'object') return nested as PulseMeta;

  // Fallback: flat dotted keys
  const flat: PulseMeta = {};
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    if (k.startsWith(`${PULSE_META_NS}.`)) {
      flat[k.slice(PULSE_META_NS.length + 1)] = v;
    }
  }
  return flat;
}

function pickGithubUrl(s: PulseServerCore): string | null {
  const url = s.repository?.url;
  if (typeof url === 'string' && /github\.com/i.test(url)) return url;
  return null;
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

function ownerFromName(name: string): string | null {
  if (!name.includes('/')) return null;
  const head = name.split('/')[0]!;
  const ghMatch = head.match(/^io\.github\.([^.]+)$/i);
  if (ghMatch) return ghMatch[1]!.toLowerCase();
  return head.toLowerCase();
}
