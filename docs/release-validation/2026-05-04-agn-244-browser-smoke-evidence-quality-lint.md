# AGN-244 Browser Smoke Evidence Quality Lint (2026-05-04)

Issue: `AGN-244`  
Scope: QA lint of browser-smoke evidence quality for release acceptance readiness.

## Mandatory opening + freshness preflight
- Mandatory opening bundle re-read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Command: `npm run freshness:check`
- Checked at: `2026-05-04T10:22:58.006Z`
- Localhost status: `http://localhost:3023` reachable (not missing).
- Product freshness state: `health=ok sourceStatus=degraded` with `green=44 yellow=1 red=0 dead=5 blocking_non_green=5 advisory_non_green=1`.
- Gate verdict: **STALE / FAIL** (`Sentry: MISSING`; blocking non-green sources present).

## Evidence set linted
1. `docs/AUDIT-2026-05-04.md` section `Browser render issues observed`.
2. `docs/release-validation/2026-05-04-agn-164-browser-smoke-failure-taxonomy-update.md`.
3. `docs/release-validation/2026-05-04-agn-163-qa-matrix-source-freshness-critical-paths.md`.

## Quality rubric (binary)
| Check | Requirement | Result | Evidence |
|---|---|---|---|
| R1 | Route-level browser evidence exists (status/title/errors/failures) | GREEN | `docs/AUDIT-2026-05-04.md` includes per-route browser table with status/title/error counts |
| R2 | Failures classified as product vs environment blocker | GREEN | AGN-163 explicitly marks Environment blocker = NO and Product failure = YES |
| R3 | Release blockers enumerated with owner | GREEN | AGN-164 lists 5 release-blocking failures with escalation owners |
| R4 | Binary acceptance statements are explicit | GREEN | AGN-163/AGN-164 include GREEN/RED acceptance outcomes |
| R5 | Evidence freshness tied to same-heartbeat preflight | RED | AGN-164 evidence was produced under localhost `ECONNREFUSED`; no same-heartbeat rerun attached there |
| R6 | Browser artifacts linked for reproducibility | YELLOW | AGN-163 includes trace zips for critical-path test, but AGN-164 taxonomy table has no run artifact pointer |
| R7 | Residual risk explicitly stated | GREEN | Both AGN-163 and AGN-164 include residual risk sections |

## Lint verdict
- `R1`: GREEN
- `R2`: GREEN
- `R3`: GREEN
- `R4`: GREEN
- `R5`: RED
- `R6`: YELLOW
- `R7`: GREEN

Overall: **RED** (evidence quality not fully release-grade until freshness-aligned browser rerun evidence is attached).

## Required fix to clear lint
1. Re-run browser smoke/critical-path checks in a heartbeat where preflight is not stale (`blocking_non_green=0`).
2. Attach artifact pointers (trace/video/log path or run id) for each blocker row in taxonomy evidence.
3. Keep product-vs-environment classification and residual-risk statement in the same artifact revision.

## Residual risk (current state)
- Release decisions can be made from stale-adjacent evidence if browser taxonomy is not paired with same-heartbeat freshness-green proof.
- Missing per-row artifact links in taxonomy evidence reduces reproducibility under CTO audit.

## Latest 10 QA evidence runs/artifacts scored

Selection method:
- Latest 10 markdown evidence artifacts under `docs/release-validation` by `LastWriteTime`.
- Scoring dimensions required by AGN-244:
  - `C` (command trace): command + timestamp/run output present.
  - `R` (route coverage): explicit route/surface coverage for claimed scope.
  - `P` (pass/fail clarity): binary verdict (green/red/pass/fail/blocked) present.

| Evidence artifact | C | R | P | Notes |
|---|---|---|---|---|
| `2026-05-04-agn-289-sentry-readiness-verification-checklist.md` | GREEN | YELLOW | GREEN | Strong commands + verdict, route coverage partial because focus is readiness checks |
| `AGN-428-pipeline-ingest-timeout-2026-05-04.md` | GREEN | YELLOW | RED | Deep command packet, but binary pass/fail framing is weak |
| `2026-05-04-agn-378-github-token-pool-rotation-balance.md` | GREEN | YELLOW | RED | Command-rich infra audit, needs explicit pass/fail line |
| `2026-05-04-agn-353-browser-smoke-top-10-revenue-routes.md` | GREEN | GREEN | GREEN | Release-grade browser smoke evidence |
| `AGN-334-FRESHNESS-WATCHDOG-SNR-REVIEW-2026-05-04.md` | GREEN | YELLOW | GREEN | Good verdicting, limited direct route-level matrix |
| `2026-05-04-agn-312-sre-sentry-readiness-verification-packet.md` | GREEN | YELLOW | GREEN | Strong traceability, route coverage secondary |
| `2026-05-04-agn-305-browser-smoke-delta-priority-routes.md` | GREEN | GREEN | GREEN | Release-grade browser delta evidence |
| `AGN-311-workflow-failure-packet-2026-05-04.md` | GREEN | YELLOW | GREEN | Strong workflow evidence, not route-centric |
| `2026-05-04-agn-286-redis-writer-provenance-deploy-lane-split.md` | GREEN | YELLOW | RED | Good trace logs, verdict language not binary enough |
| `2026-05-04-agn-285-cron-overlap-duplicate-trigger-drift-check.md` | GREEN | YELLOW | RED | Clear commands, but no concise binary acceptance call |

### Score summary
- `C` (command trace): 10/10 GREEN.
- `R` (route coverage): 2/10 GREEN, 8/10 YELLOW.
- `P` (pass/fail clarity): 6/10 GREEN, 4/10 RED.

## Gaps list for future QA evidence comments
1. Add a one-line binary verdict block at the top: `Command trace: GREEN/RED`, `Route coverage: GREEN/RED`, `Pass/fail clarity: GREEN/RED`.
2. For route-facing audits, include a flat route table with one row per route and explicit pass/fail.
3. For infra/non-route audits, explicitly mark route coverage as `N/A` to avoid ambiguous YELLOW scoring.
4. Require every evidence comment to include exact run timestamp plus at least one reproducible command snippet.
5. Require a closing residual-risk line even when all checks pass.
