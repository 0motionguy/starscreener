# AGN-587 Data-store Read-path Coverage Audit (2026-05-04)

## Scope
- Issue: `AGN-587` (`[Sprint 1 audit] Data-store read-path coverage audit`)
- Agent scope: Data Pipeline (collector/data-store/freshness ownership)
- Verification workspace: `C:\Users\mirko\OneDrive\Desktop\STARSCREENER`

## Mandatory opening + freshness evidence
- Mandatory docs re-read completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- `npm run freshness:check` result:
  - Exit code: `1`
  - Error: `freshness-check: request timed out while contacting http://localhost:3023`
  - Classification: localhost freshness endpoint unavailable/unresponsive in this heartbeat.

## Read-path coverage audit checks

### 1) Refresh/read path usage scan
Command used:
- `rg -n "readDataStore|refresh[A-Za-z0-9]+FromStore|createDataStoreBackedReader" src/lib src/app`

Result summary:
- Broad usage of `refreshXxxFromStore()` across app routes and data libs is present.
- Existing guard test already tracks API consumers: `src/lib/pipeline/__tests__/api-data-store-consumers.test.ts`.

### 2) Direct filesystem reads scan (exception inventory)
Command used:
- `rg -n "readFileSync\(|fs\.readFile|promises\.readFile" src/app src/lib`

Result summary:
- Filesystem reads still exist in selected modules (expected for snapshots/admin/static helpers), plus Twitter signal internals and some admin routes.
- Audit focus remained on data-store read-path preload coverage for active source surfaces.

### 3) Concrete read-path gap found + fixed
Gap identified:
- `src/app/twitter/page.tsx` used twitter getters (`getTwitterTrendingRepoLeaderboard`, `getTwitterLeaderboard`, `getTwitterOverviewStats`) without explicit `refreshTwitterSignalsFromStore()` preload.

Risk:
- Twitter page could rely on stale in-memory signal state after initial hydrate window.

Fix applied:
- Added explicit preload call:
  - `await refreshTwitterSignalsFromStore();`
  - plus import of `refreshTwitterSignalsFromStore` from `@/lib/twitter`.

Guardrail added:
- Added focused test assertion in `src/lib/pipeline/__tests__/api-data-store-consumers.test.ts`:
  - `Twitter page preloads twitter signals from data-store`
  - checks `src/app/twitter/page.tsx` contains `refreshTwitterSignalsFromStore(`.

## Verification evidence after patch
Command used:
- `node --test src/lib/pipeline/__tests__/api-data-store-consumers.test.ts`

Result:
- New targeted twitter-page test: `PASS`.
- Existing API compliance test remains `FAIL` due pre-existing route violations in repo (not introduced in this heartbeat).

## Files changed
- `src/app/twitter/page.tsx`
- `src/lib/pipeline/__tests__/api-data-store-consumers.test.ts`