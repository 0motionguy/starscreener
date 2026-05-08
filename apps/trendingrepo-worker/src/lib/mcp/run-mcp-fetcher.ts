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
    // AUDIT-2026-05-04 followup: glama / pulsemcp / smithery / mcp-registry
    // sometimes return 0 items silently on an API change or auth expiry.
    // Without an explicit log, the only symptom is `last_seen_at` getting
    // stale on Supabase rows with no obvious culprit. Surface this loudly.
    if (itemsSeen === 0) {
      ctx.log.warn(
        { fetcher: fetcherName },
        'mcp fetcher returned ZERO items — upstream API empty or auth expired; trending_items.last_seen_at will not refresh',
      );
    }
  } catch (err) {
    const msg = (err as Error).message;
    // Log with full context — errors[] is preserved for the run summary
    // but a top-level error log makes Sentry / log search trivial.
    ctx.log.error(
      { fetcher: fetcherName, err: msg },
      'mcp fetcher fetch() threw — Supabase rows for this source will go stale',
    );
    errors.push({ stage: 'fetch', message: msg });
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

  // AUDIT-2026-05-04 followup: surface per-item upsert failures so a
  // partial-write (e.g. one row violates a unique constraint and stalls the
  // rest) is visible in Sentry/log search instead of buried in the
  // RunResult.errors[] array. Sample first 3 to keep log payload small.
  const processErrors = errors.filter((e) => e.stage === 'process');
  if (processErrors.length > 0) {
    ctx.log.warn(
      {
        fetcher: fetcherName,
        itemsSeen,
        itemsUpserted,
        processErrorCount: processErrors.length,
        sampleErrors: processErrors.slice(0, 3).map((e) => ({
          source_id: e.itemSourceId,
          message: e.message,
        })),
      },
      'mcp fetcher: some per-item upserts failed; trending_items rows may be incomplete',
    );
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
    const msg = (err as Error).message;
    ctx.log.error(
      { fetcher: fetcherName, err: msg },
      'mcp publishLeaderboard failed — /mcp page will fall back to stale Redis cache',
    );
    errors.push({ stage: 'publish-mcp', message: msg });
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
