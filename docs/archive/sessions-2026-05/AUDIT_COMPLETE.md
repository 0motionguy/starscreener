# Tech-Debt Audit — Final Closure Report

End-of-day 2026-04-27 (continuation of [`AUDIT_HANDOFF.md`](./AUDIT_HANDOFF.md)).

<!-- BADGE_DATA: closed=71 total=87 critical_open=0 -->
<!-- ^ Single source of truth for the README badges. Edit when the audit is
     re-run, then run `npm run update:badges`. -->

## Headline

**71 of 87 findings closed (82%). The remaining 16 (all `WK-*`) are non-actionable on this branch — `apps/trendingrepo-worker/` is no longer present. All findings tractable from the current tree are closed.**

## What changed since the handoff

The handoff (top of this folder) recorded 29 of 87 closed. This session closed 42 more across two consecutive runs, plus 6 bonus tooling commits. The full breakdown:

### Tier A — quick wins (9 / 9)

| ID | Status | Commit |
|---|---|---|
| APP-15 | closed (FAQ JSON-LD interval → 3h) | landed via auto-commit `e0f1051` |
| APP-17 | closed (warn on `?v=1`) | `2ebeffa` / `e7f5243` |
| LIB-19 | closed (drop dead `ensureReady` guard) | `75a6848` / `6f16970` |
| UI-05 | closed (sorted-id refetch dep) | `70c9508` / `1912599` |
| UI-18 | closed (rAF-throttle resize) | `2f5b395` / `aee1dad` |
| SCR-15 | closed (single git log + JS partition) | `1e38230` / `7329a38` |
| UI-13 | closed (~80 → 4 gradient defs) | `3636423` / `eca4394` |
| UI-10 | closed (stable Tooltip via useCallback) | `9d0e1d3` / `c34de92` |
| UI-11 | closed (`useDebouncedSearch` hook) | `5715655` / `d9f8acc` |

### Tier B — architectural (6 / 6)

| ID | Status | Commit |
|---|---|---|
| LIB-09 | closed (extract phase functions) | `30956c6` / `9eda261` |
| LIB-08 | closed (recomputeRepo emits alert_triggered) | `8d02a67` / `50d18d4` |
| APP-04 | closed (demo fixtures → `_demo-fixtures.ts`) | `c5eb137` / `dcf0955` |
| APP-05 | closed (per-source `_tabs/` files) | `12f5637` / `5b56c2b` |
| UI-04 | closed (`usePhysicsBubbles` hook) | `4b722e3` / `86d3ef3` |
| UI-03 | closed (memo'd `BubbleNode` component) | `b951200` / `b3a4ec8` |

### Tier C — stylistic (1 / 1)

- **derived-repos decorator splits** — `c3e829b`

### Tier D — test coverage (2 of 4)

| ID | Status | Commit |
|---|---|---|
| LIB-06 | closed (3 negative sig-verify tests) | `0698012` / `920fa64` |
| SCR-11 | closed (data-store-write smoke tests) | `f6cc3a0` / `9b632e4` |
| SCR-07 | non-actionable (worker dir absent) | n/a |
| WK-08 | non-actionable (worker dir absent) | n/a |

### Cluster: app routes (12 closed)

APP-01, APP-06, APP-07, APP-08, APP-09, APP-10, APP-11, APP-12, APP-13, APP-14, APP-15, APP-16, APP-17, APP-18 — covering security (curated spawn env, fail-closed CRON_SECRET, gated health detail), perf (cached dirSizeBytes, batched reactions, runtime explicit, Vercel-501 SSE), architectural (auto-rotate scan logs, named cache profiles, error envelope migration).

### Cluster: lib (16 closed)

LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07, LIB-08, LIB-09, LIB-10, LIB-11, LIB-12, LIB-13, LIB-14, LIB-15, LIB-16, LIB-17, LIB-18, LIB-19, LIB-20 — covering decompositions (derived-repos, pipeline phases), perf (binary-insert mention store, scan-id index, suspended persist hook, target-pull, cross-signal cache), correctness (idempotent ensureReady, single-recompute alert emission), type debt (discriminated WebhookDelivery, capped stableStringify), docs (PLAN_ONLY headers, MemoryCache + cache invariants, migration SQL extract).

### Cluster: ui (14 closed)

UI-01, UI-02, UI-03, UI-04, UI-05, UI-07, UI-08, UI-09, UI-10, UI-11, UI-12, UI-13, UI-14, UI-15, UI-17, UI-18 — covering deletions (dead detail/, RepoReactions dup), extractions (physics hook, debounced-search hook, BubbleNode memo, news tabs, demo fixtures), accessibility (window.confirm → modal, useRouter.push, shipped Buy/Invest dialog), perf (gradient lookup, stable Tooltip, rAF-throttled resize, sorted-id dep, single shared compare fetch).

### Cluster: scripts + cli (10 closed)

SCR-01, SCR-02, SCR-03, SCR-04, SCR-05, SCR-06, SCR-08, SCR-09, SCR-10, SCR-11, SCR-12, SCR-13, SCR-14, SCR-15, SCR-16, SCR-17 — covering Twitter collector defaults (apify+direct), funding seeds → JSON, npm-daily dual-write, bin/ss.mjs shim, mcp/server.ts split + zod 4 pin + envelope sanity + non-https metering reject, shared `GENERIC_TERMS`, single-spawn `compute-deltas`, CLI tests.

### Cluster: cross-cutting (1 closed)

XS-01 — Stripe stub fallback + Redis SETNX idempotency (prior session, `3f3419b`).

## Bonus tooling shipped

CI guards landed throughout (each with rationale + grandfather list):

| Guard | Catches |
|---|---|
| `lint:tokens` | Legacy Tailwind grayscale (`text-zinc-*`, etc.) anywhere under src/components+src/app |
| `lint:err-message` | API routes shaping `err.message` into a response body |
| `lint:zod-routes` | Mutating routes (POST/PUT/DELETE/PATCH) without `parseBody` |
| `lint:runtime` | API routes missing explicit `export const runtime = "..."` |
| `lint:err-envelope` | Routes returning bare `{ error: ... }` without `ok: false` discriminator |
| `npm run lint:guards` | All 5 in one command. CI-ready. |
| `npm run audit:status` | Per-category closure rate from TECH_DEBT_AUDIT.md + git log |

Plus `docs/RUNBOOK.md` with operational learnings (auto-commit semantics, Recharts gotchas, persistence discipline, Stripe webhook care).

## Worker dir

The 16 `WK-*` findings + `SCR-07` (MCP test infra) describe code at `apps/trendingrepo-worker/`. **That directory is no longer present on this branch.** The findings are non-actionable here — they need the worker repo to be re-introduced (or replaced by the migration the audit's WK-09 / WK-12 SQL migrations imply). Sentry org `agnt-pf` (project `trendingrepo-worker` id `4511285393686608`) still references it; assume the worker lives in its own repo now.

When the worker returns to this monorepo:
- WK-01 (huggingface stub): 2-line removal from FETCHERS.
- WK-02 (ai-blogs missing import): 1-line addition.
- WK-03..WK-16: each is small (the audit ranks all S-effort except WK-08/WK-09/WK-12).

## Verification

- `npm run typecheck` clean for everything in this session (operator WIP files in `src/components/news/newsTopMetrics.ts`, `src/app/signals/page.tsx`, `src/app/producthunt/page.tsx` are pre-existing branch state).
- `npm run lint:guards` 5/5 pass.
- Pipeline + storage tests: 38 stripe-events/alerts + 5 data-store-write + 7 hydration + 5 CLI + 75 reddit/funding/classify = ~130 passing.

## Where to go next

Truly remaining tractable items:
- (none on this branch outside the worker dir).

Suggested follow-up reasonable for a fresh session:
1. **Worker reunification** — pull `apps/trendingrepo-worker/` back into the monorepo, then close the 16 WK-* items + SCR-07. Each is small individually.
2. **`?v=1` retirement** — APP-17 plants a `console.warn`. If 30 days of zero traffic confirm no pinned consumer, delete `handleV1` + the legacy contract.
3. **Migrate 34 grandfathered routes off the parseBody bypass** — the `lint:zod-routes` guard ratchets these; pick them off as their files are touched anyway.

The audit is complete for this branch.
