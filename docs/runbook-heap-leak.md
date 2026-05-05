---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# Heap Leak Runbook (AGN-852 / OBS-7)

## Purpose

Capture repeatable browser heap snapshots, diff sessions, and isolate retention paths for suspected client leaks.

## 1) Capture snapshots

Use the scripted drill:

```bash
npm run perf:heap:drill
```

Optional scope controls:

- `STARSCREENER_BASE_URL` (default `https://trendingrepo.com`)
- `HEAP_DRILL_PATH_A` (default `/`)
- `HEAP_DRILL_PATH_B` (default `/search?q=react`)
- `HEAP_DRILL_LOOPS` (default `20`)
- `HEAP_DRILL_SCENARIO` (label stored in summary)

Artifacts are written to:

`qa-artifacts/agn-852/<timestamp>/`

Expected files:

- `before.heapsnapshot`
- `after.heapsnapshot`
- `summary.json`

## 2) Diff sessions in DevTools

1. Open Chrome DevTools.
2. Go to `Memory`.
3. Load `before.heapsnapshot`.
4. Load `after.heapsnapshot`.
5. Switch the second snapshot view to comparison mode against `before`.
6. Sort by `Retained Size Delta` descending.

## 3) Identify retention path

For top-growing constructors/classes:

1. Click the class row.
2. Inspect `Retainers`.
3. Walk up the chain to the app root reference (store, listener, closure, DOM node).
4. Confirm whether references should have been released after route churn.

Heuristics:

- Repeating listener arrays or subscription closures usually indicate missed cleanup.
- Store maps/arrays growing per navigation indicate stale state retention.
- Detached DOM trees indicate unmounted nodes still retained by JS references.

## 4) Dry-run practice (completed)

Suspected surface: Zustand-backed watchlist/compare UI state (`src/lib/store.ts`).

Command used on 2026-05-05:

```bash
STARSCREENER_BASE_URL=https://trendingrepo.com \
HEAP_DRILL_PATH_A=/watchlist \
HEAP_DRILL_PATH_B=/compare \
HEAP_DRILL_SCENARIO=zustand-watchlist-compare-churn \
HEAP_DRILL_LOOPS=10 \
npm run perf:heap:drill
```

Result (`qa-artifacts/agn-852/2026-05-04T22-23-31-155Z/summary.json`):

- `deltaMb: 0.68`
- `leakSuspected: false`

Initial conclusion: no obvious leak signal in this churn path under the current threshold (`>15 MB` after forced GC).

## 5) Next action when leak is suspected

If `leakSuspected: true`:

1. Capture a second reproducibility run with the same env values.
2. Compare top 5 retained-size deltas that appear in both runs.
3. Open a focused fix issue naming the constructor + retainer path.
