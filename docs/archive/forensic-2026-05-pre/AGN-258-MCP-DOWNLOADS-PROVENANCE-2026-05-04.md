# AGN-258 — mcp-downloads freshness writer provenance (2026-05-04)

## Scope
- Issue: `AGN-258`
- Area: worker fetchers + freshness state for `mcp-downloads`
- Goal: identify canonical/fallback writers, confirm workflow outcomes, document why row went `DEAD`, and provide remediation/validation.

## Canonical writers and fallback writers

### Canonical writers (current design)
1. `apps/trendingrepo-worker/src/fetchers/npm-downloads/index.ts`
- Fetcher name: `npm-downloads`
- Writes:
  - per-package cache: `mcp-downloads:<pkg>` (TTL 24h)
  - aggregate: `mcp-downloads`

2. `apps/trendingrepo-worker/src/fetchers/pypi-downloads/index.ts`
- Fetcher name: `pypi-downloads`
- Writes:
  - per-package cache merge: `mcp-downloads:<pkg>` (TTL 24h)
  - aggregate: `mcp-downloads-pypi`

### Workflow owners for canonical writers
- `.github/workflows/refresh-npm-downloads.yml` → `npx tsx src/index.ts npm-downloads`
- `.github/workflows/refresh-pypi-downloads.yml` → `npx tsx src/index.ts pypi-downloads`

### Fallback / auxiliary writer paths
- `scripts/backfill-meta.mjs`: can backfill missing `ss:meta:v1:<slug>` entries with `writer: "backfill"` for orphaned data keys.
- Data-store file fallback (`src/lib/data-store.ts`): read-only fallback path when Redis/meta is unavailable; does not produce canonical Redis writes for these keys.

## Last-7 workflow outcomes (owning workflows)

Direct `gh run list` is currently blocked in this local heartbeat (`HTTP 401 Bad credentials`), so last-7 outcomes are confirmed from the existing forensic capture:
- Source: `docs/forensic/07-LAST-7-WORKFLOW-CLASSIFICATION-2026-05-04.md`

From that capture:
- `refresh-collection-rankings.yml`: 7/7 success (not an owner here; included in same capture set).
- For AGN-258 owner workflows (`refresh-npm-downloads.yml`, `refresh-pypi-downloads.yml`), the same audit-era evidence in `docs/AUDIT-2026-05-04.md` recorded repeated successes during the sampled window. In this heartbeat, live re-query could not be re-run due `gh` auth failure.

## Redis key/meta behavior

Namespace contract:
- Payload: `ss:data:v1:<slug>`
- Meta: `ss:meta:v1:<slug>`

For this source family:
- `ss:data:v1:mcp-downloads`
- `ss:data:v1:mcp-downloads-pypi`
- `ss:meta:v1:mcp-downloads`
- `ss:meta:v1:mcp-downloads-pypi`

Meta shape now supports provenance object:
- `{ writtenAt, writer?, runId?, commit? }`

Freshness route now exposes per-source provenance:
- `lastWriter`
- `lastWriterRunId`
- `lastWriterCommit`

## Why the row was DEAD

Observed during earlier AGN-258 heartbeat:
- `mcp-downloads` row returned `DEAD` with null provenance.
- That proved missing key/meta signal rather than parser drift.

Contributing mechanism:
1. If neither aggregate key (`mcp-downloads`, `mcp-downloads-pypi`) is present/fresh in Redis/file fallback, row becomes `DEAD`.
2. Previous strict sibling behavior could also mark stale/dead when one side was missing; route now uses `redisGroupMode: "any"` for `mcp-downloads` to prevent false-dead from optional sibling absence.

Current heartbeat check (`npm run freshness:check` at `2026-05-04T15:38:03.233Z`):
- `mcp-downloads` is now `GREEN` (`last_update=2026-05-04T14:35:30.456Z`), confirming writer path is presently active.

## Patch-ready remediation checklist

1. Keep provenance visibility enabled in `/api/cron/freshness/state`.
- Done when `mcp-downloads` row shows non-null `lastWriter` whenever key exists.

2. Keep `mcp-downloads` sibling evaluation as `any`.
- Done when missing `mcp-downloads-pypi` alone does not force `mcp-downloads` to `DEAD`.

3. Ensure owner workflows stay green on schedule.
- Done when latest 7 runs for both owner workflows are all `success`.

4. Add emergency recovery runbook for missing key/meta.
- Action: trigger both workflows manually and, if needed, run `scripts/backfill-meta.mjs` for meta-only orphan repair.

## Validation commands

```bash
npm run freshness:check
npm run freshness:check -- --json
```

```bash
gh run list --workflow refresh-npm-downloads.yml --limit 7 --json status,conclusion,createdAt,headSha
gh run list --workflow refresh-pypi-downloads.yml --limit 7 --json status,conclusion,createdAt,headSha
```

```bash
rg -n "writeDataStore\\('mcp-downloads'|writeDataStore\\('mcp-downloads-pypi'|name: 'npm-downloads'|name: 'pypi-downloads'" apps/trendingrepo-worker/src/fetchers -S
```

