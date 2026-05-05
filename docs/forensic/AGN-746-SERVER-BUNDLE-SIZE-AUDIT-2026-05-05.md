---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# AGN-746 Server Bundle Size Audit (2026-05-05)

## Scope
- Issue: `AGN-746` (`[GAP-AUDIT-15] Server bundle size audit`)
- Repo: `C:/Users/mirko/OneDrive/Desktop/STARSCREENER`
- Auditor lane: Backend

## Mandatory opener status
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Freshness preflight (`npm run freshness:check`): **FAILED**
  - `freshness-check: local server not reachable at http://localhost:3023` (`ECONNREFUSED`)
  - Conclusion: localhost:3023 is missing in this heartbeat.

## Bundle-audit evidence

### 1) Bundle budget script wiring check
Command:
```powershell
npm run check:bundle-budget
```
Result:
- **FAILED**: missing script in `package.json`.
- Error: `Missing script: "check:bundle-budget"`

### 2) Direct bundle budget execution
Command:
```powershell
node scripts/check-bundle-size-budget.mjs
```
Result:
- **PASS**: `[bundle-budget] OK 415 chunk(s) checked, threshold=300KB`

Interpretation:
- Current built app chunks under `.next/static/chunks/app` have no single JS chunk above the configured 300KB threshold (`BUNDLE_SIZE_BUDGET_KB` default).

### 3) Analyze artifact refresh (`npm run analyze`)
Command:
```powershell
npm run analyze
```
Result:
- **FAILED before reports generated** due to route config parse error:
  - `Next.js can't recognize the exported config field in route "/.well-known/ai.txt/route": Unsupported node type "BinaryExpression" at "revalidate"`
- Blocked file: `src/app/.well-known/ai.txt/route.ts`
- Current code:
  - `export const revalidate = 60 * 60;`

Interpretation:
- The bundle budget pass above is valid for existing local build artifacts.
- A fresh analyzer report cannot be generated until the `revalidate` expression is changed to a static literal value accepted by Next.js route-config parser.

## Findings summary
1. `scripts/check-bundle-size-budget.mjs` exists and passes, but `package.json` has no `check:bundle-budget` script alias.
2. Bundle threshold status (local artifacts): **within budget** (`0` oversized chunk over `300KB`).
3. Fresh analyze run is currently blocked by an unrelated route-config parsing issue in `/.well-known/ai.txt/route` (`BinaryExpression` in `revalidate`).

## Recommended backend follow-up
1. Change `export const revalidate = 60 * 60;` to `export const revalidate = 3600;` in `src/app/.well-known/ai.txt/route.ts` to unblock `next build`/`npm run analyze`.
2. Add package script alias:
```json
"check:bundle-budget": "node scripts/check-bundle-size-budget.mjs"
```
3. Re-run:
```powershell
npm run analyze
node scripts/check-bundle-size-budget.mjs
```
and attach refreshed `.next/analyze/nodejs.html` evidence.
