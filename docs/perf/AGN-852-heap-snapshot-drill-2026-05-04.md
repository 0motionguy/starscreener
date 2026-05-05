# AGN-852 [OBS-7] Heap Snapshot Drill (Client Memory Leaks)

Date: 2026-05-04  
Owner: [ENG] Frontend Polish

## Goal

Capture a repeatable client-memory drill that produces before/after heap snapshots plus a numeric delta after route churn.

## Command

```bash
npm run perf:heap:drill
```

Optional environment overrides:

- `STARSCREENER_BASE_URL` (default `https://trendingrepo.com`)
- `HEAP_DRILL_LOOPS` (default `20`)

Example:

```bash
STARSCREENER_BASE_URL=http://localhost:3023 HEAP_DRILL_LOOPS=30 npm run perf:heap:drill
```

## Output Artifacts

The script writes to:

`qa-artifacts/agn-852/<timestamp>/`

Files:

- `before.heapsnapshot`
- `after.heapsnapshot`
- `summary.json`

## Binary Acceptance

- Pass: command exits 0 and all 3 artifacts exist.
- Investigate leak: `summary.json.leakSuspected === true` (current threshold: `deltaMb > 15` after GC).

## Next Action

If leak is suspected, open both snapshots in Chrome DevTools Memory panel and diff retained-size growth by constructor/class between `before` and `after`.
