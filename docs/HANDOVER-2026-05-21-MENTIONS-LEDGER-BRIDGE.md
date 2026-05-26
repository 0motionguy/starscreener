# HANDOVER — Mentions Ledger Bridge (Phase A ↔ Phase B summary-blob gap)

**Status:** Phases A, B, C, D shipped (typecheck + tests green, build green). One small architectural gap remains. This is a **focused follow-up handover** to close it.

**Branch:** `fix/csp-clerk-cname-fonts`
**Parent handover:** `docs/HANDOVER-2026-05-21-MENTIONS-LEDGER.md`
**Estimate:** 30–45 min of focused work, single file modified + 1 test added.

---

## TL;DR

Phase A's worker fetcher writes the Redis primitives (SETs, hash, ZSET) but does NOT write the `mentions-ledger` summary blob. Phase B's lib reader (`src/lib/mentions-ledger.ts`) reads that blob via `readDataStore<MentionsLedgerStorePayload>("mentions-ledger")`. So today the lib reader returns an empty Map even after the worker runs — the storage primitives are populated, but the consumer can't see them.

**Fix:** add a single tail block to Phase A's `applyLedger()` that snapshots the touched-repo `_index` hashes + the leaderboard top-200 into one JSON blob and writes it via `writeDataStore("mentions-ledger", payload)`. Phase B's reader then works as-is.

Once this lands, the seed job (Phase D) automatically benefits — its final call to `applyLedger` produces the same summary blob.

---

## Current state (verified)

### Phase A — worker fetcher

File: `apps/trendingrepo-worker/src/fetchers/mentions-ledger/index.ts`

Writes per Redis tick:
- `SADD ss:mentions:v1:<owner>/<name>:<source> <mention-id>`
- `HINCRBY ss:mentions:v1:<owner>/<name>:_index <source> <delta>`
- `ZADD ss:mentions:leaderboard:v1 <total> <owner>/<name>`

Tests: 18 / 18 pass (incl. 3 spec contracts: idempotent SADD, delta-only HINCRBY, leaderboard reflects recomputed total).

### Phase B — lib reader

File: `src/lib/mentions-ledger.ts` (175 lines).

Reads via `readDataStore<MentionsLedgerStorePayload>("mentions-ledger")`.

Expected payload shape:
```ts
interface MentionsLedgerStorePayload {
  entries: Array<{
    fullName: string;
    perSource: Partial<Record<SocialPlatform, number>>;
    total: number;
  }>;
  writtenAt: string;
}
```

Tests: 7 / 7 pass (all driven by a fake-Redis seed; production path is empty).

### The gap

| What Phase A writes | What Phase B reads |
|---|---|
| 3 Redis primitives (per-repo SETs + hash + global ZSET) | one JSON blob at `ss:data:v1:mentions-ledger` |
| ❌ no `ss:data:v1:mentions-ledger` key | ❌ doesn't read primitives |

Symptom on production: lib reader's `getMentionsLedger()` returns an empty Map even after the worker has touched 500+ repos. UI continues to render via the decorator's legacy fallback (the `else` branch in `mentions-rollup.ts`) which uses the snapshot data. So the ledger architecture is in place but the cumulative counts never surface.

---

## Fix (single file, ~30 lines)

### File to modify

`apps/trendingrepo-worker/src/fetchers/mentions-ledger/index.ts`

### Change

In `applyLedger()`, after the existing per-repo `SADD` + `HINCRBY` + `ZADD` loop, add a tail block that:

1. Collects every repo that was touched in this tick.
2. For each, reads the `_index` hash back (via `HGETALL`) — this gives the authoritative cumulative perSource counts after the SADDs.
3. Computes `total = sum(perSource.values)`.
4. Builds the payload:
   ```ts
   const payload: MentionsLedgerStorePayload = {
     entries: touchedRepos.map(r => ({
       fullName: r.fullName,
       perSource: r._indexHash,  // already a Record<source, number>
       total: r.total,
     })).sort((a, b) => b.total - a.total).slice(0, 1000),
     writtenAt: new Date().toISOString(),
   };
   ```
   - Top 1000 cap is sufficient for the homepage table (50 visible + buffer). Re-evaluate if a "Top by mentions" full-page view ships later.
5. `await writeDataStore('mentions-ledger', payload);` — same Redis primitive the existing snapshot slugs use, so dual-write file+Redis works.

### Optional optimization (defer if tight on time)

Avoid the N `HGETALL` round-trips by keeping an in-memory accumulator of perSource deltas during the SADD loop. The accumulator is already implicit (you track `delta` per source to compute the HINCRBY). Snapshot it at end-of-tick. Saves N round-trips when N = 500 repos.

### Type definition

If `MentionsLedgerStorePayload` isn't already exported from `src/lib/mentions-ledger.ts`, add it there OR define it inline in the worker fetcher. Keep types in one place — preferred is `src/lib/mentions-ledger.ts` exports the type, worker imports it (small dependency arrow, but acceptable since the worker package already imports from `src/lib/` in other fetchers — verify with grep).

### Test to add

In `apps/trendingrepo-worker/src/fetchers/mentions-ledger/__tests__/index.test.ts`:

```ts
test('applyLedger writes ss:data:v1:mentions-ledger summary blob', async () => {
  const work: LedgerWorkItem[] = [
    { fullName: 'vercel/next.js', source: 'hackernews', ids: ['hn-1', 'hn-2', 'hn-3'] },
    { fullName: 'vercel/next.js', source: 'reddit', ids: ['r-1'] },
  ];
  const fakeRedis = new FakeRedis();
  const fakeStore: Record<string, unknown> = {};
  const writeDataStore = async (k: string, v: unknown) => { fakeStore[k] = v; };

  await applyLedger(work, fakeRedis.ops(), { writeDataStore });

  const blob = fakeStore['mentions-ledger'] as MentionsLedgerStorePayload;
  expect(blob).toBeDefined();
  expect(blob.entries).toHaveLength(1);
  expect(blob.entries[0].fullName).toBe('vercel/next.js');
  expect(blob.entries[0].perSource.hackernews).toBe(3);
  expect(blob.entries[0].perSource.reddit).toBe(1);
  expect(blob.entries[0].total).toBe(4);
  expect(blob.writtenAt).toBeDefined();
});
```

(Adapt to the existing test harness — Phase A used vitest + a hand-rolled `FakeRedis`; mirror it.)

---

## Verification

1. `cd apps/trendingrepo-worker && npm run typecheck` — exit 0
2. `cd apps/trendingrepo-worker && npm test -- mentions-ledger` — **34 / 34** (was 33; +1 new test)
3. `cd ../.. && npm run typecheck` — exit 0 (next.js side)
4. `cd ../.. && npm test -- mentions-ledger` — **7 / 7** pass (Phase B tests unchanged)

End-to-end smoke (after operator runs the seed):
```bash
ssh toolbox 'cd ~/trendingrepo-worker && npm run job:seed-mentions-ledger'
ssh toolbox 'redis-cli GET ss:data:v1:mentions-ledger | jq .entries[0]'
```

Expected: returns an entry with cumulative perSource counts and a non-zero total.

After the smoke, the homepage at http://localhost:3023 should render mention logos on every popular repo row (HN, Reddit, Bluesky, etc. all visible, not just X). That's the user-facing proof.

---

## Out of scope (for this bridge)

- Phase E full visual sign-off — operator does that after the seed runs on toolbox.
- Toolbox cron registration for the recurring 15-min ledger update (already registered in Phase A).
- GitHub source icon decision — still deferred, prototype after the cumulative counts are live.
- Reddit OAuth restore — A3 from the parent handover, still operator-tracked separately.

---

## Role prompt for the bridge session

```
ROLE: Data Pipeline & Component Architect — Mentions Ledger Bridge

WORKSPACE: c:\dev\trendingrepo on branch fix/csp-clerk-cname-fonts.
REPO CONSTITUTION: read CLAUDE.md + CLAUDE.local.md before any edit.

YOUR JOB: close the Phase A ↔ Phase B summary-blob gap per
docs/HANDOVER-2026-05-21-MENTIONS-LEDGER-BRIDGE.md (this file).
Parent context lives in
docs/HANDOVER-2026-05-21-MENTIONS-LEDGER.md.

SINGLE FILE CHANGE:
  apps/trendingrepo-worker/src/fetchers/mentions-ledger/index.ts

Add a tail block to applyLedger() that writes a summary blob to
`ss:data:v1:mentions-ledger` matching the shape expected by
src/lib/mentions-ledger.ts (MentionsLedgerStorePayload).

ADD ONE TEST in the existing __tests__/index.test.ts proving:
- the blob is written after a multi-source apply
- the entries[].perSource counts match HGETALL of the _index hashes
- writtenAt is set

VERIFY:
- apps/trendingrepo-worker$ npm run typecheck → exit 0
- apps/trendingrepo-worker$ npm test -- mentions-ledger → 34/34
- (repo root)$ npm run typecheck → exit 0
- (repo root)$ npm test -- mentions-ledger → 7/7 (unchanged)

NON-NEGOTIABLE:
- K3 surgical: only the 1 file + the 1 test file.
- K2 simplicity: no new abstractions.
- TOOLBOX-ONLY for ingestion: this is worker code, correct location.
- NO commits without explicit operator "commit" greenlight.
- NO ssh to toolbox in this invocation — seed job runs operator-side.

ESTIMATED TIME: 30–45 min.

Start.
```

---

## File-by-file summary

| File | Change | Phase |
|------|--------|-------|
| `apps/trendingrepo-worker/src/fetchers/mentions-ledger/index.ts` | MODIFY — add summary-blob writer at tail of applyLedger() | BRIDGE |
| `apps/trendingrepo-worker/src/fetchers/mentions-ledger/__tests__/index.test.ts` | EXTEND — add 1 test for the new writer | BRIDGE |
| (nothing else) | — | — |

---

## After the bridge: full Phase E flow

1. Operator: `ssh toolbox 'cd ~/trendingrepo-worker && npm run job:seed-mentions-ledger'` (one-shot seed).
2. Operator: confirm via `ssh toolbox 'redis-cli GET ss:data:v1:mentions-ledger | jq .entries | length'` — expect ≥ 100.
3. Local: `npm run dev` on port 3023, hard-refresh http://localhost:3023.
4. Visual check: mention logos visible on most repo rows; counts are cumulative (3–4 digit on popular repos).
5. Operator: thumbs up → ready to push.

---

**End of bridge handover.**
