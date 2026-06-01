import { writeDataStore } from './redis.js';

export interface DynamicOutputMarkerInput {
  fetcher: string;
  outputPattern: string;
  startedAt: string;
  candidates: number;
  updated: number;
  skipped?: number;
  failed?: number;
}

export function dynamicOutputMarkerSlug(fetcher: string): string {
  return `worker-health:${fetcher}`;
}

export async function writeDynamicOutputMarker(
  input: DynamicOutputMarkerInput,
): Promise<boolean> {
  const result = await writeDataStore(
    dynamicOutputMarkerSlug(input.fetcher),
    {
      status: input.updated > 0 ? 'ok' : 'degraded',
      dataAsOf: new Date().toISOString(),
      fetcher: input.fetcher,
      outputPattern: input.outputPattern,
      startedAt: input.startedAt,
      candidates: input.candidates,
      updated: input.updated,
      skipped: input.skipped ?? 0,
      failed: input.failed ?? 0,
    },
    { writer: input.fetcher },
  );
  return result.source === 'redis';
}
