import { upsertAsset, writeMetric } from '../db.js';
import { publishLeaderboard } from '../publish.js';
import { detectVendor } from './vendor-detect.js';
import { resolveLogo } from './logo-resolver.js';
import { mergeAndUpsert } from './merger.js';
import type { FetcherContext, RunResult } from '../types.js';
import type { McpServerNormalized } from './types.js';

// Shared runner used by all four MCP fetchers. Takes a fetch function that
// returns a flat array of normalized servers, then performs the per-server
// merge + vendor detection + logo write + metric write.

export interface RunMcpFetcherOpts {
  ctx: FetcherContext;
  fetcherName: string;
  startedAt: string;
  fetch: () => Promise<McpServerNormalized[]>;
}

export async function runMcpFetcher(opts: RunMcpFetcherOpts): Promise<RunResult> {
  const { ctx, fetcherName, startedAt, fetch } = opts;
  const errors: RunResult['errors'] = [];
  let itemsSeen = 0;
  let itemsUpserted = 0;
  let metricsWritten = 0;

  let normalized: McpServerNormalized[] = [];
  try {
    normalized = await fetch();
    itemsSeen = normalized.length;
  } catch (err) {
    errors.push({ stage: 'fetch', message: (err as Error).message });
    return finish(fetcherName, startedAt, itemsSeen, itemsUpserted, metricsWritten, false, errors);
  }

  for (const n of normalized) {
    try {
      const vendor = detectVendor(n);
      const merge = await mergeAndUpsert(ctx.db, n, vendor);
      itemsUpserted += 1;

      const logo = resolveLogo(vendor.vendor_slug);
      if (logo) {
        await upsertAsset(ctx.db, {
          item_id: merge.id,
          kind: 'logo',
          url: logo.url,
          alt: vendor.vendor_slug ?? n.name,
          simple_icons_slug: logo.simple_icons_slug,
          brand_color: logo.brand_color,
          raw: { source: logo.source, strategy: vendor.strategy },
        });
      }

      if (vendor.is_official_vendor) {
        await upsertAsset(ctx.db, {
          item_id: merge.id,
          kind: 'badge',
          url: 'verified-official-vendor',
          alt: 'Official vendor',
          brand_color: logo?.brand_color ?? null,
        });
      }

      await writeMetric(ctx.db, merge.id, {
        ...(n.downloads_total !== null ? { downloads_total: n.downloads_total } : {}),
        ...(n.downloads_total !== null ? { downloads_7d: n.downloads_total } : {}),
        ...(n.github_stars !== null ? { stars_total: n.github_stars } : {}),
        raw: { source: n.source, popularity_signal: n.popularity_signal },
      });
      metricsWritten += 1;
    } catch (err) {
      errors.push({
        stage: 'process',
        message: (err as Error).message,
        itemSourceId: n.source_id,
      });
    }
  }

  // Publish the merged top-N for the `mcp` type to Redis. Without this, the
  // /mcp page (which reads ss:data:v1:trending-mcp via getDataStore) returns
  // 503 — Supabase rows exist but no consumer can find them. Mirrors the
  // huggingface fetcher's per-type publishLeaderboard pattern.
  let redisPublished = false;
  try {
    const result = await publishLeaderboard(ctx.db, 'mcp');
    redisPublished = result.redisPublished;
  } catch (err) {
    errors.push({ stage: 'publish-mcp', message: (err as Error).message });
  }

  await ctx.signalRunComplete(
    finish(fetcherName, startedAt, itemsSeen, itemsUpserted, metricsWritten, redisPublished, errors),
  );

  return finish(fetcherName, startedAt, itemsSeen, itemsUpserted, metricsWritten, redisPublished, errors);
}

function finish(
  fetcher: string,
  startedAt: string,
  itemsSeen: number,
  itemsUpserted: number,
  metricsWritten: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher,
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen,
    itemsUpserted,
    metricsWritten,
    redisPublished,
    errors,
  };
}
