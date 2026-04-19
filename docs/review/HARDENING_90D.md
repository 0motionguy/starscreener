# 90-Day Hardening Roadmap — STARSCREENER

Companion to [`REVIEW_REPORT.md`](./REVIEW_REPORT.md) and [`PATCH_PLAN.md`](./PATCH_PLAN.md).
Input: the recurring bug-classes across the 11 subagent passes.
Output: a 3-horizon program that removes the classes, not the bugs.

Ground rule: every item has a **named owner** and a **metric-of-done**. "Improve X" is banned per protocol rule 4.

For STARSCREENER in its current shape, there is effectively one operator (Mirko). Ownership here = "whose name goes on the PR." External contributors can be swapped in as they arrive.

Review checkpoint: re-run this document on **2026-07-19** and mark items `done`, `slipping`, or `dropped (reason)`. The next red-team review should be able to read this file and see a real-world trajectory, not a wish-list.

---

## Horizon 1 — Next 14 days (stop the bleeding)

Goal: close the four P0s that landed in Phase 2 bugs get *completely* resolved, and land the handful of P1s that unblock every later item. At end of H1, shipping to a small audience beyond Mirko himself should be reasonable.

| # | Action | Owner | Done when |
| --- | --- | --- | --- |
| H1-1 | Rotate the `GITHUB_TOKEN` and `CRON_SECRET` values currently in `.env.vercel.prod`. Move the file outside the OneDrive sync root. Add explicit `.env.vercel.*` to `.gitignore` (belt + suspenders over the current `.env*` wildcard). | Mirko | New tokens deployed to Vercel env vars; old `.env.vercel.prod` deleted from disk and from OneDrive Recycle Bin; `git check-ignore -v .env.vercel.prod` returns the new rule. |
| H1-2 | Land **P-101b** — session-token auth for the 3 browser-reachable mutation routes (`/api/pipeline/recompute`, `/alerts`, `/alerts/rules`). Simplest design: a signed HTTP-only cookie minted at first UI load via a tiny `POST /api/session` handler that checks a per-env `SESSION_SECRET`. Adds one middleware, one cookie, one route. | Mirko | All 3 routes return 401 without the cookie; browser UI still works; `tests/api/pipeline-auth.test.ts` from P-001's original scope now passes. |
| H1-3 | Enable GitHub branch protection on `main`: CI required, at least 1 review (can be self-review while solo), no force-push, no direct pushes to `main`. | Mirko | `gh api repos/:owner/:repo/branches/main/protection` returns a non-empty ruleset. Attempt to `git push` to main without PR fails. |
| H1-4 | Add `npm run build` and `npm run lint` to `.github/workflows/ci.yml`. Keep the current lint scope broken-by-design but **fix lint to ignore `.next/` and `.claude/worktrees/`** so the new lint gate doesn't fail from pre-existing noise. | Mirko | A PR with a TypeScript build error fails CI (regression test). PR with no error passes all four jobs: typecheck, test, build, lint. |
| H1-5 | Land **P-112** — `withRecomputeLock()` + apply to cron ingest, cron seed, cron backfill-top, and `/api/pipeline/recompute`. | Mirko | Two parallel `curl -X POST /api/pipeline/recompute` calls result in one 200 + one 429 (or sequential execution, depending on policy), not two parallel recomputes. |
| H1-6 | Land **P-118** — wrap every naked GitHub `fetch()` in `timeoutSignal(FETCH_TIMEOUT_MS)`. | Mirko | A blocked-SYN test against a toxiproxy'd GitHub stand-in returns an error within 5s, not a hung request. |
| H1-7 | Rotate/verify the **`ALERT_EMAIL_TO` and `RESEND_API_KEY`** in prod. Run `/api/cron/ingest` against a known breakout and confirm the email arrives. Follow up with **P-119** (ring-buffer of last-N cron activity). | Mirko | At least one delivered email is visible in the Resend dashboard. `/api/health/cron-activity` returns the ring buffer with timestamps. |
| H1-8 | Land **P-110** (deleted-repo exclusion from scoring) and **P-111** (absolute-path assertion on `STARSCREENER_DATA_DIR`). | Mirko | `repoStore.getActive()` used in `recomputeAll` per F-DATA-001 verification. Starting the app with `STARSCREENER_DATA_DIR=../foo` throws at boot. |

**H1 exit signal:** The app can be pointed at by a trusted handful of external users without any of the Phase 2 P0s being exploitable. There is a working audit trail for cron + alerts.

---

## Horizon 2 — Next 30 days (systemic, kill whole bug classes)

Goal: stop finding the *same* shape of bug next quarter. Each item below replaces a repeated pattern with a primitive that enforces the contract, so new code written against the primitive inherits correctness.

| # | Action | Owner | Done when |
| --- | --- | --- | --- |
| H2-1 | **Zod at every HTTP edge.** Build `src/lib/api/parse.ts` with `parseJsonBody<T>(req, schema)` and `parseSearchParams<T>(nextUrl, schema)`. Refactor `/api/pipeline/ingest` + `/api/pipeline/alerts/rules` to use them (P-101). Add an ESLint custom rule or a CI grep check that fails on `request.json()` without a subsequent `parseAsync`/`safeParse`. | Mirko | Grep for `await request.json()` on any `app/api/**/*.ts` matches only files that immediately call the parse helper. Every route covered by a validation test in `tests/api/validation/`. Bug class killed: F-CONT-001, F-SENT-012, F-AGENT-002 / 003 / 007 all re-occur as *type-check* errors. |
| H2-2 | **Centralized external-call wrapper.** `src/lib/external-fetch.ts` exports `fetchWithTimeoutAndRetry(url, { timeoutMs, retries, backoffMs, jitter })`. Refactor GitHub adapter, Nitter, HN, Reddit, Resend client. Kills F-RES-001/004/007/008 in one stroke. | Mirko | Zero direct `fetch(` calls outside `external-fetch.ts`, enforced by a CI grep. 4 resilience tests pass: hung upstream → timeout; 5xx → retry with jitter; 4xx → no retry; rate-limit 429 → respect `Retry-After`. |
| H2-3 | **Structured logger with levels + redact list.** Adopt `pino` with `transport: pino-pretty` in dev, raw JSON in prod. Module: `src/lib/log.ts` exports `log.info/warn/error` with a fixed set of redacted fields (`userId`, `email`, `authorization`, `token`, `apiKey`). Replace every `console.*` call repo-wide (68 sites). | Mirko | Grep for `console\\.` on `src/` returns 0 hits. Every log line is valid JSON with `{ level, time, scope, msg, ... }`. PII-test: log an object containing `{ email: "x@y.z" }` → output contains `[Redacted]`. |
| H2-4 | **Request-level correlation IDs.** `src/lib/log.ts` provides `withRequestContext(req)` that generates `requestId = crypto.randomUUID()` and binds it via AsyncLocalStorage so every log line carries it. Same for `batchId` in cron jobs (P-120 generalized). | Mirko | A single `requestId` can be grepped to trace an ingest from route entry → adapter fetch → store write → alert fire → email send. Tests: `logs.test.ts` spins up a handler under `withRequestContext` and asserts consecutive log lines share the same id. |
| H2-5 | **JSONL → Postgres migration**, **rehearsed**. Drizzle + Neon/Supabase. Reconcile the schema drift in §3.4 of the report BEFORE cutover. Include a dry-run script that reads all JSONL, writes to a staging Postgres, and runs a cross-check. | Mirko | Dry-run script succeeds on a sample of 10 repos with zero field loss. Rehearsal migration on a branch: app runs against staging Postgres, all 138+ tests pass, scoring output matches JSONL output to within `|Δ| < 0.1` per repo. |
| H2-6 | **Idempotency-Key middleware.** Single helper `withIdempotencyKey(handler)` reads the `Idempotency-Key` header, stores `(key → response)` in a bounded LRU, short-circuits on replay. Apply to `/api/pipeline/alerts/rules` POST and any future money-path. (Kills F-CONT-006.) | Mirko | Two identical POSTs with the same `Idempotency-Key` produce one rule; the second POST returns the cached 200 body (not 409). |
| H2-7 | **Projection DTOs** for every public list endpoint — `/api/repos`, `/api/search`, `/api/compare` (P-116). Stop leaking `score.components`, `score.modifiers`, `archived`, `deleted` to unauthenticated clients (F-CONT-003/004/009, F-PERF-008). | Mirko | Response body of `/api/repos?limit=100` is ≤12 KB gzipped (from ~35 KB). A separate admin endpoint gated by H1-2 auth exposes the full `Repo` shape. |
| H2-8 | **SIGTERM / graceful shutdown** — handler in the Next.js custom server or a top-level `process.on('SIGTERM', ...)` wrapper. Flush `flushPendingPersist()`, close SSE streams, wait up to 10s then `process.exit(0)`. | Mirko | Railway deploy in flight → mid-ingest → redeploy triggers SIGTERM → restart → JSONL shows the pending write landed (not lost). |
| H2-9 | **Retention / eviction** for unbounded stores (F-PERF-003): `alertEventStore`, `mentionStore`, `reasonStore`. Config: keep last 90 days, purge older daily via `/api/cron/cleanup`. Document retention in `docs/DATABASE.md`. | Mirko | After a simulated 1-year run, in-memory `alertEventStore.byId.size < 10k`. Oldest retained event ≥ `now - 90d`. |
| H2-10 | **SBOM + supply-chain CI gate.** `npm audit --audit-level=high` as a CI step; add `overrides` in root `package.json` so transitive CVEs can be pinned without waiting for upstream. Run `npm prune` and remove extraneous packages (F-SUPPLY-004). | Mirko | CI fails on any new high-severity CVE in a dep. `npm ls --all` shows no "extraneous" entries. |

**H2 exit signal:** the *next* red-team review's SENTINEL + CONTRACT + RESILIENCE passes should not find anything in the same class as today's findings. They'll find new classes — that's fine.

---

## Horizon 3 — Next 90 days (platform)

Goal: make the *third* red-team review boring.

| # | Action | Owner | Done when |
| --- | --- | --- | --- |
| H3-1 | **Pre-commit pipeline.** `husky` + `lint-staged`, running `eslint --fix`, `tsc --noEmit -p .` on staged files, and `gitleaks protect --staged`. Blocks commits that fail. | Mirko | `git commit` with a `process.env.STRIPE_KEY="sk_live_..."` string in the diff is rejected by gitleaks. Same for a type error. |
| H3-2 | **CI mutation sample.** Add `stryker-mutator` configured to run a 10% random sample of mutations on `src/lib/pipeline/scoring/` on every PR touching that tree. Full run weekly. | Mirko | A PR that deletes a mutation-testable branch in `engine.ts` without updating a test fails CI. Stryker report posted to the PR. Initial mutation score baseline published in `docs/review/STRYKER_BASELINE.md`. |
| H3-3 | **Runtime observability.** Sentry wired via the official Next.js integration, sampling at 1.0 in dev / 0.1 in prod. Add `/api/health/throughput` driven by the ring-buffer from P-119: reports repos-ingested-per-hour for the last 24h. Grafana Cloud free-tier dashboard fed by Vercel log drains OR OpenTelemetry. | Mirko | Sentry project active; a synthetic 500 error is captured within 60s. Dashboard shows cron fire rate + ingest throughput + alert delivery stats over the last 24h. |
| H3-4 | **SLOs documented and monitored.** `docs/SLO.md` with 4 SLOs: (a) cron fire success ≥ 90% per 24h, (b) ingest batch p95 ≤ 60s, (c) alert delivery rate = 100% within 5 min of fire, (d) `/api/health` availability ≥ 99%. Alert rules in BetterStack/UptimeRobot referencing these. | Mirko | When cron fails 3 times in a row, a page fires. A synthetic breakout alert that never lands in the inbox triggers an alert within 5 min. |
| H3-5 | **Chaos drill weekly (self-paced).** A scripted scenario: kill Nitter DNS resolution, observe degradation; kill the GitHub token, observe 401 handling; fill disk to 100%, observe persist failure mode; kill the process mid-batch, observe restart-recovery. Results logged in `docs/review/CHAOS_LOG.md`. | Mirko | At least 4 chaos drills executed in 90 days. Any finding from a drill is tracked as a new P-NNN patch in `PATCH_PLAN.md` or accepted as documented risk. |
| H3-6 | **Multi-tenant-safe foundations.** Replace `DEFAULT_USER_ID = "local"` everywhere with a typed `UserId` that is never constructible from a raw string. `userId` becomes a required field on every route that mutates, enforced by the Zod schema from H2-1. Closes F-SENT-007. | Mirko (only ship when multi-tenant rollout is on the roadmap). | It is type-impossible for a handler to call `pipeline.listAlertRules()` without an authenticated `userId`. |
| H3-7 | **Postgres in production.** Flip the `STARSCREENER_PERSIST` path from JSONL → Drizzle/Postgres, guarded by a feature flag so rollback is a single flag flip. Postgres-specific tests added to CI. | Mirko | Production running off Postgres; `.data/` JSONL backups retained for 30 days post-cutover; a manual rollback drill succeeds in <15 min. |
| H3-8 | **Prompt-injection fence — proper version.** Replace the H1 band-aid with per-field MCP annotations (`annotations.trusted = false`) on every string field sourced from GitHub/Nitter/HN/Reddit. Requires SDK support — verify before committing. Closes F-AGENT-001's "proper fix" path. | Mirko | Tool response for `get_repo` on an injection-laden fixture repo has the malicious string in a field with `trusted: false` annotation, and the MCP client (Claude Desktop ≥ current version) renders it as untrusted content. |

**H3 exit signal:** a new engineer can be added to the project and cause an incident only via intentionally malicious behavior, not via not-knowing-the-rules. CI enforces the conventions; dashboards catch the drift.

---

## Metrics we will watch (populate as instrumentation lands)

| Metric                                          | Current | H1 target       | H2 target        | H3 target       |
| ---                                             | ---     | ---             | ---              | ---             |
| **P0+P1 finding count per review**              | 27 (today) | ≤ 15         | ≤ 8              | ≤ 3             |
| **Mean time to detect (MTTD) — cron stopped**   | ~days (manual) | ≤ 2h   | ≤ 30m            | ≤ 5m            |
| **Mean time to respond (MTTR) — alert not delivered** | undefined (never measured) | logged  | paged via Sentry | auto-retry + paged |
| **Coverage on critical paths** (`scoring/`, `api/`) | ~0% (scoring) + N/A (routes) | scoring 60% | 80% scoring, 60% routes | 80% across both |
| **Dep CVE aging (days from disclosure)**        | unknown | ≤ 7 for high+  | ≤ 7 for medium+  | ≤ 1 for high+   |
| **Deploy rollback rate**                         | N/A (no rollback tested) | rehearsed once | rehearsed monthly | auto-rollback on failed health |

---

## Things this roadmap deliberately does NOT do

- **Add observability tooling before the fixes that make observability meaningful.** Sentry on a system where alerts silently fail is noise.
- **Migrate to Postgres as a first move.** The JSONL layer is fine for the current scale; migration without schema-drift reconciliation loses data.
- **Build user accounts.** Multi-tenancy is H3-only because the risk/reward for a single-operator product isn't there yet. Better to ship the single-tenant correctly.
- **Replace Next.js or the MCP SDK.** Both are serving the product well; the issues are how they're used, not the choice.

---

*Roadmap signer: Claude Opus 4.7 (1M) — 2026-04-19. Re-review checkpoint: 2026-07-19.*
