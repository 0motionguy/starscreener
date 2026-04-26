// TrustMRR catalog sweep + revenue overlay derivation.
//
// Modes (driven by current UTC hour, mirrors sync-trustmrr.yml decision):
//   - hour 02 → full sweep (~130 paginated API requests)
//   - any other hour → incremental (zero external API requests; re-derives
//     overlays from the cached catalog against the latest repo-metadata +
//     repo-profiles in Redis)
//
// Slug:
//   - `trustmrr-startups`         (catalog payload, large)
//   - `trustmrr-startups:meta`    (size sidecar, cheap reads)
//   - `revenue-overlays`          (repo-fullName -> RevenueOverlay map)
//
// Cadence: every hour @ :27 (matches sync-trustmrr.yml). Hour 02 is the
// only run that actually hits TrustMRR's API.
//
// Auth: TRUSTMRR_API_KEY required for full mode; missing key on a non-:02
// tick is fine (incremental skips the API).

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore } from '../../lib/redis.js';
import {
  fetchAllStartups,
  buildOverlays,
  type TrustmrrStartup,
  type RepoHomepage,
  type RevenueOverlay,
} from '../../lib/sources/trustmrr.js';

interface CatalogPayload {
  generatedAt: string;
  version: number;
  total: number;
  startups: TrustmrrStartup[];
}

interface CatalogMetaPayload {
  generatedAt: string;
  startupCount: number;
  totalReported: number;
  totalSize: number;
  fetchedAt: string;
}

interface OverlaysPayload {
  generatedAt: string;
  version: number;
  source: 'trustmrr';
  catalogGeneratedAt: string | null;
  overlays: Record<string, RevenueOverlay>;
}

interface RepoMetadataPayload {
  items?: Array<{ fullName?: string; homepageUrl?: string | null }>;
}

interface RepoProfilesPayload {
  profiles?: Array<{ fullName?: string; websiteUrl?: string | null }>;
}

interface ManualMatchesPayload {
  [fullName: string]: string;
}

function selectMode(hourUtc: number): 'full' | 'incremental' {
  return hourUtc === 2 ? 'full' : 'incremental';
}

async function collectRepoHomepages(): Promise<RepoHomepage[]> {
  const [metadata, profiles] = await Promise.all([
    readDataStore<RepoMetadataPayload>('repo-metadata'),
    readDataStore<RepoProfilesPayload>('repo-profiles'),
  ]);
  const map = new Map<string, string>();
  for (const item of metadata?.items ?? []) {
    if (!item || typeof item.fullName !== 'string') continue;
    const homepage = typeof item.homepageUrl === 'string' ? item.homepageUrl : null;
    if (!homepage) continue;
    map.set(item.fullName, homepage);
  }
  for (const profile of profiles?.profiles ?? []) {
    if (!profile || typeof profile.fullName !== 'string') continue;
    if (map.has(profile.fullName)) continue;
    const website =
      typeof profile.websiteUrl === 'string' ? profile.websiteUrl : null;
    if (!website) continue;
    map.set(profile.fullName, website);
  }
  return Array.from(map.entries()).map(([fullName, homepage]) => ({ fullName, homepage }));
}

async function deriveOverlays(
  ctx: FetcherContext,
  catalogGeneratedAt: string | null,
): Promise<{ matched: number; redisPublished: boolean }> {
  const catalog = await readDataStore<CatalogPayload>('trustmrr-startups');
  const startups = catalog?.startups ?? [];
  if (startups.length === 0) {
    ctx.log.warn('trustmrr-startups catalog empty in Redis; nothing to derive');
    return { matched: 0, redisPublished: false };
  }
  const manualMatches =
    (await readDataStore<ManualMatchesPayload>('revenue-manual-matches')) ?? {};
  const repos = await collectRepoHomepages();
  const generatedAt = new Date().toISOString();
  const overlays = buildOverlays({
    startups,
    repos,
    manualMatches,
    generatedAt: catalogGeneratedAt ?? generatedAt,
  });
  const payload: OverlaysPayload = {
    generatedAt,
    version: 1,
    source: 'trustmrr',
    catalogGeneratedAt: catalogGeneratedAt ?? null,
    overlays,
  };
  const result = await writeDataStore('revenue-overlays', payload);
  return {
    matched: Object.keys(overlays).length,
    redisPublished: result.source === 'redis',
  };
}

const fetcher: Fetcher = {
  name: 'trustmrr',
  schedule: '27 * * * *', // matches sync-trustmrr.yml
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('trustmrr dry-run');
      return done(startedAt, 0, false);
    }

    const apiKey = process.env.TRUSTMRR_API_KEY;
    const mode = selectMode(new Date().getUTCHours());
    let itemsSeen = 0;
    let redisPublished = false;
    const errors: RunResult['errors'] = [];

    if (mode === 'full') {
      if (!apiKey) {
        const msg = 'TRUSTMRR_API_KEY not set; full sweep skipped (deriving overlays only)';
        ctx.log.warn(msg);
        errors.push({ stage: 'auth', message: msg });
      } else {
        ctx.log.info('trustmrr full sweep starting');
        try {
          const fetchedAt = new Date().toISOString();
          const { startups, total, pages } = await fetchAllStartups({
            apiKey,
            onPage: ({ page, received }) => {
              ctx.log.info({ page, received }, 'trustmrr page');
            },
          });
          const catalog: CatalogPayload = {
            generatedAt: fetchedAt,
            version: 1,
            total,
            startups,
          };
          const serialized = JSON.stringify(catalog);
          const catalogResult = await writeDataStore('trustmrr-startups', catalog);
          const meta: CatalogMetaPayload = {
            generatedAt: fetchedAt,
            startupCount: startups.length,
            totalReported: total,
            totalSize: serialized.length,
            fetchedAt,
          };
          // The colon in the slug is intentional and matches the source script.
          const metaResult = await writeDataStore('trustmrr-startups:meta', meta);
          itemsSeen = startups.length;
          redisPublished = catalogResult.source === 'redis' || metaResult.source === 'redis';
          ctx.log.info(
            {
              startups: startups.length,
              total,
              pages,
              size: serialized.length,
              catalog: catalogResult.source,
              meta: metaResult.source,
            },
            'trustmrr catalog published',
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push({ stage: 'catalog-fetch', message });
          ctx.log.error({ err: message }, 'trustmrr full sweep failed');
        }
      }
    } else {
      ctx.log.info('trustmrr incremental run (no API call)');
    }

    const cachedCatalog = await readDataStore<CatalogPayload>('trustmrr-startups');
    const overlayResult = await deriveOverlays(
      ctx,
      cachedCatalog?.generatedAt ?? null,
    );
    if (overlayResult.redisPublished) redisPublished = true;
    ctx.log.info(
      { matched: overlayResult.matched, mode },
      'revenue-overlays derived',
    );

    return {
      fetcher: 'trustmrr',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: Math.max(itemsSeen, overlayResult.matched),
      itemsUpserted: 0,
      metricsWritten: 0,
      redisPublished,
      errors,
    };
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'trustmrr',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
