// Minimal in-memory stand-in for the SupabaseClient surface used by
// src/lib/mcp/merger.ts. Just enough fluent API to support:
//   from(table).select(cols).eq(col,val).overlaps(col,arr).limit(n)
//   from(table).upsert(row, opts).select('id').single()
//   from(table).update(patch).eq(col, val)
// Returns { data, error } shaped responses.

import type { SupabaseClient } from '@supabase/supabase-js';

interface Row {
  id: string;
  type: string;
  source: string;
  source_id: string;
  slug: string;
  title: string;
  description: string | null;
  url: string;
  author: string | null;
  vendor: string | null;
  cross_source_count: number;
  absolute_popularity: number;
  merge_keys: string[];
  last_seen_at: string;
  raw: Record<string, unknown>;
}

export interface FakeStore {
  rows: Row[];
}

export function createFakeSupabase(): { db: SupabaseClient; store: FakeStore } {
  const store: FakeStore = { rows: [] };
  let nextId = 1;

  function trendingItemsBuilder() {
    const filters: Array<(r: Row) => boolean> = [];
    let limit = Infinity;
    let pendingUpsert: { row: Partial<Row>; opts?: { onConflict?: string } } | null = null;
    let pendingUpdate: Partial<Row> | null = null;
    let returnId = false;
    let returnSingle = false;

    const builder: Record<string, unknown> = {
      select(_cols: string) {
        if (pendingUpsert && _cols === 'id') returnId = true;
        return builder;
      },
      eq(col: keyof Row, val: unknown) {
        if (pendingUpdate) {
          const ids = store.rows.filter((r) => r[col] === val).map((r) => r.id);
          for (const id of ids) {
            const row = store.rows.find((r) => r.id === id)!;
            Object.assign(row, pendingUpdate);
          }
          pendingUpdate = null;
          return Promise.resolve({ data: null, error: null });
        }
        filters.push((r) => r[col] === val);
        return builder;
      },
      overlaps(col: keyof Row, arr: string[]) {
        filters.push((r) => {
          const v = r[col];
          if (!Array.isArray(v)) return false;
          return v.some((x) => arr.includes(x));
        });
        return builder;
      },
      limit(n: number) {
        limit = n;
        return builder;
      },
      upsert(
        row: Partial<Row>,
        opts?: { onConflict?: string; ignoreDuplicates?: boolean },
      ) {
        pendingUpsert = { row, opts: opts ?? {} };
        return builder;
      },
      update(patch: Partial<Row>) {
        pendingUpdate = patch;
        return builder;
      },
      single() {
        returnSingle = true;
        if (pendingUpsert) {
          const newRow: Row = {
            id: String(nextId++),
            cross_source_count: 1,
            absolute_popularity: 0,
            merge_keys: [],
            description: null,
            author: null,
            vendor: null,
            last_seen_at: new Date().toISOString(),
            raw: {},
            ...(pendingUpsert.row as Row),
          };
          // Conflict resolution by onConflict cols.
          const conflict = pendingUpsert.opts?.onConflict?.split(',') ?? [];
          if (conflict.length > 0) {
            const idx = store.rows.findIndex((r) =>
              conflict.every((k) => r[k as keyof Row] === newRow[k as keyof Row]),
            );
            if (idx >= 0) {
              store.rows[idx] = { ...store.rows[idx]!, ...newRow, id: store.rows[idx]!.id };
              const data = returnId ? { id: store.rows[idx]!.id } : store.rows[idx];
              pendingUpsert = null;
              return Promise.resolve({ data, error: null });
            }
          }
          store.rows.push(newRow);
          const data = returnId ? { id: newRow.id } : newRow;
          pendingUpsert = null;
          return Promise.resolve({ data, error: null });
        }
        // Plain SELECT -> first match
        const matches = store.rows.filter((r) => filters.every((f) => f(r)));
        const first = matches[0] ?? null;
        return Promise.resolve({ data: first, error: null });
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        // Awaiting the builder without single() = SELECT path
        const matches = store.rows.filter((r) => filters.every((f) => f(r))).slice(0, limit);
        if (pendingUpsert) {
          // upsert(...).select() without .single() — return array
          const insertResult = builder.single as () => Promise<unknown>;
          return insertResult().then(resolve as never);
        }
        resolve({ data: matches, error: null });
      },
    };
    void returnSingle;
    return builder;
  }

  function trendingAssetsBuilder() {
    const builder: Record<string, unknown> = {
      upsert(_row: unknown, _opts?: unknown) {
        // Track count if needed; for merger tests we don't read assets.
        return builder;
      },
      then(resolve: (v: { data: null; error: null }) => void) {
        resolve({ data: null, error: null });
      },
    };
    return builder;
  }

  function trendingMetricsBuilder() {
    const builder: Record<string, unknown> = {
      upsert(_row: unknown, _opts?: unknown) {
        return builder;
      },
      then(resolve: (v: { data: null; error: null }) => void) {
        resolve({ data: null, error: null });
      },
    };
    return builder;
  }

  const db = {
    from(table: string) {
      if (table === 'trending_items') return trendingItemsBuilder();
      if (table === 'trending_assets') return trendingAssetsBuilder();
      if (table === 'trending_metrics') return trendingMetricsBuilder();
      throw new Error(`fake supabase: unknown table ${table}`);
    },
  } as unknown as SupabaseClient;

  return { db, store };
}
