# STARSCREENER audit-2026-05-04 — FINAL STATUS

**Author:** agent E8 (final consolidation)
**Branch read:** `origin/main`
**Window:** `c4f02c27..origin/main` = **29 commits**
**Source artefacts:** `MAP.md`, `REPORT.md`, `AUDIT-RESPONSE.md`, `phase-logs/{A1,A2,A3,A4,A10,A14,A32,A33,A34,C5}.md`

---

## TL;DR

Four audit-driven PRs landed on `main` in the 2026-05-04 window — **#96** (9-commit swarm closing the bulk of P0/P1 findings + admin keys dashboard), **#97** (operator-page follow-up: `/about`, `/x402`, `/api/oembed`, Footer, llms-full, FreshnessBadge), **#99** (snapshot timeouts + secret-rotation runbook + arxiv ownership), and **#101** (D1 workflow Node 22 alignment + agentic.market 429 retry). Across the window: **29 commits**, **~25 sub-agents dispatched** across 5 waves (A-series + C-wave + layer2 + layer3 + wave4), **swarm/Ax-tagged commits = 4** (A6/A7/A8/A13) plus a Sprint 1.5 Sentry-verification chain (~13 commits) cherry-picked into the same window. Net audit findings closed: **~22 of ~30** catalogued; remainder are operator-only (Apify dashboard, Sentry org access, Vercel function timeouts, Supabase write-path triage). No source files were touched in this E8 finalize step — single Write is this report.

## PRs merged today

| PR   | SHA        | Summary                                                                                  | Files |
|------|------------|------------------------------------------------------------------------------------------|------:|
| #96  | `2f937dfa` | 9-commit swarm closes P0/P1 findings + admin/keys dashboard sprint                       |    42 |
| #97  | `1ddca17a` | `/about`, `/x402`, `/api/oembed` + Footer + llms-full + FreshnessBadge follow-up         |     6 |
| #99  | `1901fe1c` | Snapshot timeouts + secret rotation runbook + arxiv ownership                            |     7 |
| #101 | `23bccfb8` | `cron-agent-commerce.yml` retry + continue-on-error on agentic.market 429s; Node 22 align |    1 |

Aggregate: **56 files** across the four merged PRs (`git show --stat` per merge SHA).

## Findings shipped (per area)

### security/headers
- `pricing/page.tsx` JSON-LD safe-escape via `safeJsonLd()` — A8 (`9b7a17a6`), in PR #96. Closes A4-triage §"defense-in-depth".
- GET `/api/admin/scan` gated behind `verifyAdminAuth` (`82accffe`) — closes audit "unauth admin scan" finding.
- Token masking + EngineError Sentry tags wired across `github-token-pool.ts`, `github-fetch.ts`, `pool/twitter-fallback.ts` (`e548ea0a`). Reinforced by `a1073b4f feat(errors): consolidate + extend EngineError hierarchy`.
- Sentry DSN startup verification (`9ff3d3f7`) + canary endpoint `/api/_internal/sentry-canary` (`ad04e262`, scoped fix `cc322398`, typed throw `600a9227`/`6d242fc3`/`d9f21717`/`18f22309`/`2ea006a9`/`fd04ea5f`) — Sprint 1.5 observability landed in audit window.
- Secret-rotation runbook `docs/RUNBOOK-secret-rotation.md` (370 lines) added in PR #99 — closes the "no rotation runbook anywhere in repo" deferred finding.

### frontend/UI
- FeaturedCard star-rendering DOM split fix + `RelatedRepoCard` `★ 22.2K` rendering — A7 (`aae6b9c8`) in PR #96. Resolves 4 stable + 1 flaky vitest cases catalogued in `phase-logs/A10-test-baseline.md`.
- Sidebar `/githubrepo` 404 retargeted to `/` per WIREMAP §3a — A7 (`aae6b9c8`).
- Operator-only pages shipped in PR #97: `/about` (200), `/x402` (402 paywall hint), `/api/oembed` (200), Footer revamp, `llms-full.txt`, `FreshnessBadge` component.
- `home-page-honesty` consensus panel ≥8 slice preserved at `src/app/page.tsx:736` (verified by AUDIT-RESPONSE).

### worker/data
- Worker GitHub token-pool wiring — A6 (`be477069`) at `apps/trendingrepo-worker/src/lib/util/github-token-pool.ts`. Closes ENGINE Tier-2 #5 (PAT double-billing). Caller migration across `apps/trendingrepo-worker/src/fetchers/**` is **flagged for follow-up** in REPORT.md (the new module may be partially dead until callers are migrated).
- `arxiv` worker fetcher ownership decision documented in PR #99 — script remains primary writer; worker fetcher stays unregistered with explicit doc.
- Funding-fetcher freshness registration (`b741ddd9`) — pre-swarm, in window.

### workflows/CI
- Freshness-gate advisory-vs-blocking distinction at `/api/cron/freshness/state` — A8 (`9b7a17a6`).
- Snapshot workflows hardened with `timeout-minutes` caps (was 6.1h hangs) in PR #99.
- `cron-agent-commerce.yml` retry+continue-on-error for agentic.market 429s and Node 22 pin (PR #101).
- D1 workflows aligned to Node 22 in same PR.
- Shared `.github/actions/git-commit-data/action.yml` with 6-attempt rebase backoff (cherry-pick `13cced72`/`d303c666`/`4140acfc` already on branch) — fixes Twitter/Devto/collection-rankings/fast-discovery push-race failures.
- `check-freshness` extended to include Sentry status (`17d39f7a`).

### docs
- Cadence claim drift consolidation to "20m" in user-facing surfaces (`llms.txt`, `llms-full.txt`, home page) — A13 (`6ebcb4b0`) in PR #96. Note: `docs/ARCHITECTURE.md`/`INGESTION.md`/`DEPLOY.md` themselves were **not** touched (REPORT.md §A1).
- Sentry verification proof + alignment notes (`c13f8c7e`, `1ac66690`, `57507e69`).
- `docs/RUNBOOK-secret-rotation.md` new — quarterly cadence for `GH_TOKEN_POOL`, `APIFY_API_TOKEN`, `CRON_SECRET`, Bluesky, ProductHunt, Reddit (PR #99).
- `tasks/CURRENT-SPRINT.md` updated (`294d3d99`).
- 5 doc contradictions (DEPLOY.md, ENGINE.md, SITE-WIREMAP.md cadence) addressed via `cf3b2a95 docs(A25)` + `c308ad6f docs(A25)` + A13 + workflow-side `8da042c0 chore(workflows/A20)` (cherry-picked from sprint branch into PR #96).

## Findings still deferred (operator-only)

1. **`/api/pipeline/ingest` 504 timeouts (Vercel)** — production runtime issue; not fixable from this workspace under the no-`vercel --prod` rule. Operator must investigate Vercel function timeout, chunk the route, or migrate ingest to the Railway worker.
2. **Apify Twitter actor cost / dataset metrics** — no `APIFY_API_TOKEN` in workspace. Operator must check `apidojo~tweet-scraper` actor in Apify dashboard for runs/day, dataset rows, $/run vs $8/day budget.
3. **Sentry event-flow verification on `agnt-pf` (de.sentry.io)** — Sentry MCP not authorised for the EU org in this session. Operator must verify last 5 events for `trendingrepo` (app) and `trendingrepo-worker` (project id 4511285393686608); confirm DSNs in Vercel + Railway env.
4. **`trending-mcp` / `mcp-dependents` / `mcp-smithery-rank` Redis null metadata** — writers exist and recent workflow runs reported success, but live Redis probe is needed (no token in session). Operator runs `npm run verify:data-store` against prod.
5. **Supabase `last_seen_at` lag** — domain-level lag of 2-4 days behind worker `updated_at`. Investigation requires Supabase write to confirm fix won't break ranking. Operator-owned.
6. **`Refresh agent-commerce pipeline` repeated failures (since 2026-05-03T12:51Z)** — multi-script orchestration; failure mode invisible from `gh run view --log-failed`. Needs targeted follow-up swarm or operator deep-dive. (Mitigated partially by PR #101 retry/Node 22 pin; needs end-to-end verification.)
7. **Frontend external-image blocks** (`dev.to` ORB, ProductHunt unavatar.io block, `hackernews/trending` 404 resources, `bluesky/trending` 22 console errors, `compare`/`skills` 503) — runtime image-host issues; require browser-replicated debug per route.
8. **No unified `cross-mentions:{repo}` aggregator key** — product decision, not a bug. Needs Phase-2 design in `tasks/` before any worker change.
9. **Complexity hotspot `src/app/agent-commerce/...`** at cyclo 45 / cogni 111 / **2238 LOC** — 3× next-worst LOC. No refactor agent assigned; needs operator-owned scope + plan.
10. **11 MEDIUM dependency CVEs** (`@sentry/nextjs`, `@vitest/mocker`, `esbuild`, `next`, `postcss`, `resend`, `svix`, `uuid`, `vite`, `vite-node`, `vitest`) — `npm audit --json` was never run cleanly. Half are dev-only and bumpable in isolation; `next` + `@sentry/nextjs` carry framework-bump risk.
11. **Worker fetcher caller migration** to the new `github-token-pool` module — `be477069` adds the module but diff shows no caller migration in `apps/trendingrepo-worker/src/fetchers/**`. If callers still read `process.env.GITHUB_TOKEN` directly, ENGINE Tier-2 #5 remains effectively open.
12. **Pre-existing dirty workspace tree** — 30+ paths modified (`.gitignore`, `data/*.json`, `.data/**`, etc.) belonging to another agent / in-flight branch. Hard rule: don't touch. Operator commits/stashes/reverts intentionally.

## Final swarm metrics

- **Agents dispatched:** ~25 across 5 waves (A1-A14 audit, C-wave deps follow-up, layer2 layer3 wave4 dispatch shells in `.audit/2026-05-04-swarm/`).
- **Agent-commits with `swarm/Ax` tag landed:** 4 (A6 `be477069`, A7 `aae6b9c8`, A8 `9b7a17a6`, A13 `6ebcb4b0`).
- **Total commits in audit window** (`c4f02c27..origin/main`): **29** — including 4 PR merges, 13 Sentry observability fixes, 5 `chore(data)` data refreshes, 2 Sentry doc updates, 1 sprint update, 4 ops/health.
- **Audit deliverables produced:** `MAP.md`, `REPORT.md`, `AUDIT-RESPONSE.md`, 17 phase-logs (`A1-A14`, `A32-A34`, `C5`), 5 dispatch shells, `wave2-pr-body.md`, `audit-queen-objective.txt`, `orchestration.log`, this `AUDIT-FINAL.md`.
- **Swarm runtime:** initialised `2026-05-04T05:37Z` (Phase 0 MAP), this E8 finalize step `2026-05-04T07:50Z`.

## Production verify (curl spot-checks)

Recommended (operator to execute against `https://trending.report` or current canonical prod URL):

```
curl -sI https://<prod>/about              # expect HTTP/2 200
curl -sI https://<prod>/x402               # expect 402 (paywall hint, PR #97)
curl -sI https://<prod>/api/oembed         # expect 200 (PR #97 oembed responder)
curl -sI https://<prod>/api/health         # expect 200 + freshness JSON
curl -sI https://<prod>/api/_internal/sentry-canary  # expect 200 + Sentry event captured
curl -sI https://<prod>/twitter            # expect 200; client hydrates fresh ts
curl -sI https://<prod>/githubrepo         # expect 308/redirect to / (sidebar fix)
curl -sI https://<prod>/llms.txt           # expect 200, "20m" cadence (A13)
curl -sI https://<prod>/llms-full.txt      # expect 200, full surface map (PR #97)
```

Spot-checks not run from this E8 step (no network egress in finalize). REPORT.md notes A14 `npm run typecheck && npm run lint:guards && npm test && npm run test:hooks && npm run freshness:check -- --timeout-ms 30000` should be the gating pre-merge sequence; AUDIT-RESPONSE confirmed `npx vitest run` against `FeaturedCard.test.tsx` + `v4-home-repo.test.tsx` + `home-page-honesty.test.ts` = **30/30 passing** locally on the resolved branch state.

---

**Status:** audit-2026-05-04 wave **closed for code work** on `origin/main`. Remaining items are operator/runtime/infra-owned and explicitly out of swarm scope. Next operator action: execute the curl spot-checks above and tick off deferred items #1–#6 in priority order.
