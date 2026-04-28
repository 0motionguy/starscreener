import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSupabaseLocalEnv } from '../helpers/supabase-local.js';
import { composite, computeStats, type CompositeInput } from '../../src/lib/score.js';
import type { TrendingItemType } from '../../src/lib/types.js';

let db: SupabaseClient | null = null;
let supabaseUp = false;

beforeAll(async () => {
  const env = await readSupabaseLocalEnv();
  if (!env) return;
  supabaseUp = true;
  db = createClient(env.url, env.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
});

describe.skipIf(!process.env.SUPABASE_LOCAL || !supabaseUp)('SQL trending_score parity', () => {
  it('matches TypeScript composite() within 1e-6 per type', async () => {
    if (!db) throw new Error('db not initialized');
    const { error: rpcErr } = await db.rpc('trending_score');
    expect(rpcErr).toBeNull();

    const { data: items, error } = await db.from('trending_items').select('*');
    expect(error).toBeNull();
    expect(items).toBeTruthy();

    const byType = new Map<TrendingItemType, Array<Record<string, unknown>>>();
    for (const row of items as Array<Record<string, unknown>>) {
      const t = row.type as TrendingItemType;
      const arr = byType.get(t) ?? [];
      arr.push(row);
      byType.set(t, arr);
    }

    for (const [type, rows] of byType) {
      const ids = rows.map((r) => r.id as string);
      const { data: metrics } = await db
        .from('trending_metrics')
        .select('item_id, downloads_7d, velocity_delta_7d, captured_at')
        .in('item_id', ids)
        .order('captured_at', { ascending: false });
      const latest = new Map<string, { downloads_7d: number; velocity_delta_7d: number }>();
      for (const m of (metrics ?? []) as Array<Record<string, unknown>>) {
        const id = m.item_id as string;
        if (!latest.has(id)) {
          latest.set(id, {
            downloads_7d: Number(m.downloads_7d ?? 0),
            velocity_delta_7d: Number(m.velocity_delta_7d ?? 0),
          });
        }
      }

      const inputs: CompositeInput[] = rows.map((r) => {
        const m = latest.get(r.id as string) ?? { downloads_7d: 0, velocity_delta_7d: 0 };
        const lm = r.last_modified_at as string | null;
        return {
          downloads_7d: m.downloads_7d,
          velocity_delta_7d: m.velocity_delta_7d,
          absolute_popularity: Number(r.absolute_popularity ?? 0),
          last_modified: lm ? new Date(lm) : null,
          cross_source_count: Number(r.cross_source_count ?? 1),
        };
      });
      const stats = computeStats(inputs);
      const tsScores = inputs.map((i) => composite(i, stats));
      const sqlScores = rows.map((r) => Number(r.trending_score));

      for (let idx = 0; idx < tsScores.length; idx++) {
        expect(Math.abs(tsScores[idx]! - sqlScores[idx]!)).toBeLessThan(1e-6);
      }
      void type;
    }
  });
});
