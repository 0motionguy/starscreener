// mcp-smithery-rank fetcher.
//
//   API           https://registry.smithery.ai/servers (paginated)
//   Auth          SMITHERY_API_KEY (Bearer)
//   Rate limit    No published cap; we paginate at pageSize=100, < 100 pages
//   Cache TTL     None — the aggregate key is overwritten each run
//   Aggregate key mcp-smithery-rank
//   Cadence       6h (refresh-mcp-smithery-rank.yml)
//
// Smithery doesn't expose an explicit per-server rank field. We derive rank
// from list-order in their default sort: page 1 item 0 = global rank 1, and
// rank/total is the inverse-ranking input the MCP scorer wants.
//
// The merged-MCP roster (`trending-mcp`) keys by qualified_name (lowercased)
// or by the merged Supabase slug. We index by Smithery's own qualifiedName
// (lowercased) plus the package-style namespace/slug, so the app-side
// buildMcpItem can join on the qualifiedName carried in raw.smithery.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { loadEnv } from '../../lib/env.js';
import { writeDataStore } from '../../lib/redis.js';

const BASE = 'https://registry.smithery.ai';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

interface SmitheryServerEntry {
  id?: string;
  qualifiedName?: string;
  namespace?: string;
  slug?: string;
  displayName?: string;
  [k: string]: unknown;
}

interface ListResponse {
  servers?: SmitheryServerEntry[];
  pagination?: {
    currentPage?: number;
    pageSize?: number;
    totalPages?: number;
    totalCount?: number;
  };
}

interface SmitheryRankEntry {
  rank: number;
  total: number;
  qualifiedName: string;
}

interface SmitheryRankPayload {
  fetchedAt: string;
  total: number;
  // Keyed by qualifiedName.toLowerCase() (the merge key buildMcpItem uses).
  // The same entry is also written under any alternate slugs we see for the
  // server (id, namespace/slug) so the app-side join has multiple fallbacks.
  summary: Record<string, SmitheryRankEntry>;
}

const fetcher: Fetcher = {
  name: 'mcp-smithery-rank',
  schedule: '11 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('mcp-smithery-rank dry-run');
      return done(startedAt, 0, false, []);
    }

    const env = loadEnv();
    if (!env.SMITHERY_API_KEY) {
      ctx.log.warn('mcp-smithery-rank skipped: SMITHERY_API_KEY not set');
      return done(startedAt, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const headers = { authorization: `Bearer ${env.SMITHERY_API_KEY}` };

    const ordered: SmitheryServerEntry[] = [];
    let total = 0;
    try {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const url = `${BASE}/servers?page=${page}&pageSize=${PAGE_SIZE}`;
        const { data } = await ctx.http.json<ListResponse>(url, { headers, timeoutMs: 20_000 });
        const servers = data.servers ?? [];
        for (const s of servers) ordered.push(s);
        const totalPages = data.pagination?.totalPages ?? 1;
        total = data.pagination?.totalCount ?? ordered.length;
        if (servers.length === 0 || page >= totalPages) break;
      }
    } catch (err) {
      errors.push({ stage: 'fetch', message: (err as Error).message });
      return done(startedAt, ordered.length, false, errors);
    }

    if (total <= 0) total = ordered.length;

    const summary: Record<string, SmitheryRankEntry> = {};
    ordered.forEach((s, idx) => {
      const rank = idx + 1;
      const qn = (s.qualifiedName ?? s.displayName ?? s.id ?? '').trim().toLowerCase();
      if (!qn) return;
      const entry: SmitheryRankEntry = { rank, total, qualifiedName: qn };
      summary[qn] = entry;
      // Alternate join keys (helps when buildMcpItem joins by Supabase slug
      // which is itself qualifiedName.toLowerCase() — already covered — but
      // some sources slug differently. These extras are cheap fallbacks.)
      if (typeof s.id === 'string' && s.id.trim()) summary[s.id.trim().toLowerCase()] = entry;
      if (typeof s.namespace === 'string' && typeof s.slug === 'string') {
        const composite = `${s.namespace}/${s.slug}`.toLowerCase();
        if (composite && composite !== qn) summary[composite] = entry;
      }
    });

    const payload: SmitheryRankPayload = {
      fetchedAt: new Date().toISOString(),
      total,
      summary,
    };
    const result = await writeDataStore('mcp-smithery-rank', payload);
    ctx.log.info(
      { ranked: ordered.length, total, indexed: Object.keys(summary).length, redisSource: result.source },
      'mcp-smithery-rank published',
    );

    return {
      fetcher: 'mcp-smithery-rank',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: ordered.length,
      itemsUpserted: 0,
      metricsWritten: Object.keys(summary).length,
      redisPublished: result.source === 'redis',
      errors,
    };
  },
};

export default fetcher;

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'mcp-smithery-rank',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
