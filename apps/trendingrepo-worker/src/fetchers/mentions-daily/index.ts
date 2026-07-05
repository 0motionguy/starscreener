// mentions-daily — daily per-source cumulative mention snapshot.
//
// The /market-signals "Mention volume" chart needs a real per-day series. The
// spine only had a current total, so the chart flat-distributed one value over
// 30 days (a rectangle) and tag momentum clamped to a fake +96%. This fetcher
// appends ONE dated row per day summing the cumulative per-source counts from
// `mentions-ledger` (HN, X, Bluesky, Dev.to, Lobsters). The app diffs
// consecutive days into real "new mentions/day" bands + real week-over-week
// deltas — see src/lib/mentions-daily.ts.
//
// Slug: mentions-daily  { days: [{ date, perSource, total }], writtenAt }
// Cadence: daily 06:17 UTC (after the mentions-ledger :52 sweep). Zero-write
// guard: an empty ledger preserves prior days rather than writing a zero row.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';

const SLUG = 'mentions-daily';
const MAX_DAYS = 30;

export const DAILY_SOURCES = ['hackernews', 'twitter', 'bluesky', 'devto', 'lobsters'] as const;
export type DailySource = (typeof DAILY_SOURCES)[number];

interface LedgerEntry {
  fullName: string;
  perSource?: Record<string, number>;
  total?: number;
}
interface LedgerSnapshot {
  entries?: LedgerEntry[];
}

export interface MentionsDailyRow {
  date: string; // YYYY-MM-DD (UTC)
  perSource: Record<DailySource, number>;
  total: number;
}
export interface MentionsDailyFile {
  days: MentionsDailyRow[];
  writtenAt: string;
}

/** Sum cumulative per-source counts across all ledger entries. Pure. */
export function sumLedgerPerSource(ledger: LedgerSnapshot | null): Record<DailySource, number> {
  const out: Record<DailySource, number> = {
    hackernews: 0,
    twitter: 0,
    bluesky: 0,
    devto: 0,
    lobsters: 0,
  };
  for (const e of ledger?.entries ?? []) {
    for (const s of DAILY_SOURCES) {
      const n = Number(e.perSource?.[s] ?? 0);
      if (Number.isFinite(n) && n > 0) out[s] += n;
    }
  }
  return out;
}

/** Upsert today's row (dedupe by date), keep the most recent MAX_DAYS. Pure. */
export function upsertDaily(
  existing: MentionsDailyFile | null,
  row: MentionsDailyRow,
): MentionsDailyRow[] {
  const byDate = new Map<string, MentionsDailyRow>();
  for (const d of existing?.days ?? []) if (d?.date) byDate.set(d.date, d);
  byDate.set(row.date, row);
  return Array.from(byDate.values())
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-MAX_DAYS);
}

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

const fetcher: Fetcher = {
  name: 'mentions-daily',
  schedule: '17 6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('mentions-daily dry-run');
      return done(startedAt, 0, false, errors);
    }

    const ledger = await readDataStore<LedgerSnapshot>('mentions-ledger').catch((err) => {
      errors.push({ stage: 'read:mentions-ledger', message: (err as Error).message });
      return null;
    });
    const perSource = sumLedgerPerSource(ledger);
    const total = DAILY_SOURCES.reduce((s, k) => s + perSource[k], 0);

    if (total === 0) {
      ctx.log.warn('mentions-daily: ledger empty - preserving prior days, no write');
      return done(startedAt, 0, false, errors);
    }

    const row: MentionsDailyRow = { date: utcDate(new Date()), perSource, total };
    const existing = await readDataStore<MentionsDailyFile>(SLUG).catch(() => null);
    const days = upsertDaily(existing, row);
    const payload: MentionsDailyFile = { days, writtenAt: new Date().toISOString() };

    const writeRes = await writeDataStore(SLUG, payload).catch((err) => {
      errors.push({ stage: 'write', message: (err as Error).message });
      return null;
    });

    ctx.log.info({ days: days.length, total, perSource }, 'mentions-daily written');
    return done(startedAt, total, writeRes?.source === 'redis', errors);
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
    fetcher: 'mentions-daily',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
