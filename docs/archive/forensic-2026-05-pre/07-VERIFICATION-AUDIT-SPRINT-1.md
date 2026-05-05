# Sprint 0 + Sprint 1 Verification Audit

Date: 2026-05-04
Auditor: Claude (single session) + 4 read-only sub-agents (RUFLO swarm)
Method: independent grep + file reads + live commands + Redis queries + production curl. No reliance on prior session summaries.
Supersedes: prior thin AGN-303 audit (~170 lines) at this same path; that earlier file's evidence (test pass counts) is preserved inline below.

## Executive Summary

| Sprint phase | Verdict | Headline evidence |
|---|---|---|
| Sprint 0 (session protocol + freshness infra) | YELLOW | SESSION OPENING block, `freshness:check`, `/api/cron/freshness/state` all present and Bearer-auth-gated. **Local `freshness:check` returned HTTP 500 from `/api/health?soft=1`**, prod `/api/health?soft=1` returns 200 with `sourceStatus=degraded`. |
| Phase 1.1 — GitHub pool telemetry | YELLOW | Pool migration enforced (lint:bypass exit 0). Telemetry module + 4 EngineError variants ✓. 158 Redis usage keys, 0 quarantines. **Rotation imbalance: top fingerprint `nWII` = 1112 of ~2933 deduped requests (38%); stddev/mean = 1.11 vs 0.7 threshold → FAIL.** |
| Phase 1.2 — Reddit UA pool | YELLOW | Pool selector + 4 EngineError variants ✓; 5 honest UAs in config ✓; tests pass 8/8. **Legacy `0-https-trendingrepo-com` fingerprint still serves 64% of Reddit traffic** — migration partial. 0 quarantines, 0 rate-limits. |
| Phase 1.3 — Twitter Apify+Nitter fallback | RED | Fallback module + 5 EngineError variants ✓; nightly check-nitter workflow exists + last run success. **Only 1 of 5 Nitter instances healthy** (`nitter.net`); 4 dead → fallback redundancy below the audit's `<2 healthy = FAIL` line. APIFY_API_TOKEN unset at 03:31 UTC today → 50% degradation that hour. |
| Phase 1.4 — `/admin/keys` dashboard | GREEN | Page + pool-state route + components all exist. Auth-gated via cookie session. Token labels redacted (`redactToken()` first-4 + last-4). 12 singleton specs match audit spec. Anomaly detector on the route uses the SAME stddev/0.7 threshold as the audit — i.e. it would flag the GitHub imbalance found in B.5. |
| Phase 1.5 — Sentry + EngineError hierarchy | YELLOW | 48 classes in `src/lib/errors.ts` (38 source-related per 06-doc table + 10 infrastructure: auth/admin/ops-alert/data-store/rate-limit). Canary route at `src/app/api/%5Finternal/sentry-canary/route.ts` exists, gated by `Bearer CRON_SECRET` + `SENTRY_CANARY_ENABLED=1`. **Vercel `SENTRY_DSN` still missing → canary cannot fire in production**. Pre-known blocker per `tasks/CURRENT-SPRINT.md`. |
| Cross-cutting | RED | **CI on main has been failing since 11:17 UTC (3 consecutive runs).** Commit `439730d3` re-added `posthog-node@^4.18.0` to `package.json` but the lock file is missing 6 transitive deps (form-data, asynckit, combined-stream, mime-types, delayed-stream, mime-db). `npm ci` exits 1. **Local `npm run typecheck` also fails** with 3 errors. lint clean (97 warnings, 0 errors). DEFCON secrets scan: CLEAN. |

**Overall verdict: RED**. Sprint 0 + Sprint 1 implementation surfaces all shipped, but two production-impacting regressions sit on `main` and were created within the last 24h:
1. CI is broken — main can't `npm ci`.
2. Twitter fallback has no usable redundancy if Apify dies (4/5 Nitter instances dead).

These are repair items, not Sprint 2 blockers per se, but Sprint 2 scope work should pause until both are green.

## Top 5 Findings

1. **CRITICAL — main CI broken since 11:17 UTC.** Commit `439730d3` (`fix(deps): re-add posthog-node`) re-added `posthog-node@^4.18.0` to package.json but the lock file is missing 6 transitive deps. Every push since fails at `npm ci`. Three consecutive failures + concurrent failure of "Refresh npm package telemetry" + "Collect Twitter Signals". Fix: run `npm install` and commit the lock-file delta.

2. **CRITICAL — Twitter fallback redundancy degraded.** `config/nitter-instances.json` shows `nitter.net=healthy`, `nitter.privacydev.net=dead`, `nitter.poast.org=dead`, `nitter.cz=dead`, `nitter.unixfox.eu=dead`. If Apify runs out of quota or has a token issue (already happened at 03:31 UTC today: 1/2 Twitter calls degraded), the entire `/twitter` page now hangs off a single Nitter instance with no backup.

3. **HIGH — GitHub pool rotation is uneven beyond the dashboard's own threshold.** Top fingerprint `nWII` got 1112 requests (~38% of all traffic), median ~175. Stddev/mean = 1.11 vs the dashboard's 0.7 threshold → the `/admin/keys` PoolAnomalies section *should* be flagging "GitHub rotation imbalance" right now. 0 quarantines, 0 idle keys past 12h, so no quarantine drama; just lopsided usage.

4. **HIGH — local typecheck fails.** Three distinct errors: (a) Next.js generated route-type for `src/app/api/cron/freshness/state/route.ts` complains about `__setInspectSourceForTests` violating the index signature; (b) `src/app/api/health/route.ts:226` Promise type mismatch; (c) `src/lib/__tests__/cron-route-typed-error-contract.test.ts` lines 50/61/76 try to assign to `process.env.NODE_ENV` (read-only in TS5+). At least (a) is Sprint-1-era — the freshness-state route ships a non-standard test hook in production code.

5. **HIGH — Reddit pool migration is partial.** Legacy fingerprint `0-https-trendingrepo-com` (the pre-Phase-1.2 single-UA shape) still received 9 of 14 recent Reddit requests (64%). The 5 new `trendingrepo-*` honest UAs each got 1 request. Either (a) old Redis hour buckets haven't aged out yet (TTL is set on usage; should self-heal) or (b) some Reddit caller is still running on the old single-UA path despite Phase 1.2 claiming complete migration. Worth a 10-minute trace.

## PART A — Sprint 0 Verification

### A.1 SESSION OPENING PROTOCOL block

`CLAUDE.md:1` is `# SESSION OPENING PROTOCOL — MANDATORY BEFORE ANY OTHER ACTION`. The 7-step list (CLAUDE.md `:3-9`) matches the spec. Above the project description as required. **PASS.**

### A.2 `npm run freshness:check`

`package.json` contains `"freshness:check": "tsx scripts/check-freshness.mts"`. Script exists at [scripts/check-freshness.mts](../../scripts/check-freshness.mts). Type definitions include the Sentry status row added in Phase 1.5: `type SentryStatus = "CONFIGURED" | "MISSING" | "TEST_FIRED";`. Per-source GREEN/YELLOW/RED/DEAD classification matches spec. **PASS** structurally.

Live exec at 2026-05-04 ~12:30 UTC:
```
> tsx scripts/check-freshness.mts
freshness-check: GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error
```
Local dev server at port 3023 is up but `/api/health?soft=1` returns 500. **YELLOW** operationally. Production endpoint returns 200 (see G.2).

### A.3 `/api/cron/freshness/state` endpoint

Exists at `src/app/api/cron/freshness/state/route.ts`. Bearer-`CRON_SECRET` gated; production curl without auth returned `401`. **PASS.**

### A.4 `tasks/CURRENT-SPRINT.md` and `tasks/BACKLOG.md`

Both present. CURRENT-SPRINT.md tracks all 5 phases; 1.1/1.2/1.3/1.4 marked done; 1.5 marked partial (blocked on Vercel SENTRY_DSN). BACKLOG.md has deferred items list. **PASS.**

### A.5 typecheck / lint / build

| Command | Exit | Notes |
|---|---|---|
| `npm run typecheck` | **FAIL** | 3 errors — see Top 5 #4 |
| `npm run lint` | 0 | 97 warnings, 0 errors |
| `npm run lint:guards` | 0 | per sub-agent G report |
| `npm run lint:bypass` | 0 | per sub-agent B report |
| `npm run build` | not run locally | OneDrive `.next` junction issue documented in CLAUDE.md; CI is the truth — see Part G |

Net: **YELLOW** (typecheck regression, lint clean, CI broken for unrelated reason).

## PART B — Phase 1.1 GitHub Pool Telemetry

### B.1 Forensic state document

`docs/forensic/05-GITHUB-POOL-STATE.md` exists, 113 lines, fully populated with pool location, call-site enumeration, bypass list, migration plan. **PASS.**

### B.2 Telemetry module

`src/lib/pool/github-telemetry.ts` exists. Imported by `src/app/api/admin/pool-state/route.ts:12` (`githubKeyFingerprint`). Redis key shape verified live: `pool:github:usage:<fp>:<hour>` pattern matches found keys (`pool:github:usage:nWII-3c881be5:2026-05-04-10`). Hash fields verified live: `requests`, `success`, `fail`, `lastResponseMs`, `lastCallAt`, `lastOperation`, `lastStatusCode`, `lastRateLimitRemaining`, `lastRateLimitReset` all present in sampled hashes. **PASS.**

### B.3 EngineError GitHub variants

`src/lib/errors.ts:87-105` defines 4 GitHub classes:
- `GithubRateLimitError` (quarantine)
- `GithubInvalidTokenError` (quarantine)
- `GithubPoolExhaustedError` (fatal)
- `GithubRecoverableError` (recoverable)

All extend `EngineError`. **PASS.**

### B.4 Call-site migration verification

Sub-agent B (GitHub call-site sweep) report:
- 9 runtime surfaces in `src/` use the pool, matching the 05-doc baseline exactly.
- Zero direct `process.env.GITHUB_TOKEN` reads in `src/lib` or `src/app` outside the pool internals + 1 test mock.
- `npm run lint:bypass` exit 0 with output `[check-no-pool-bypass] OK — scanned src for pool bypass patterns.`
- Worker exceptions (`apps/trendingrepo-worker/src/fetchers/skill-derivatives/index.ts`, `apps/trendingrepo-worker/src/fetchers/recent-repos/index.ts`) and 8 script lanes are documented as INTENTIONAL bypasses in 05-doc lines 61-81.

**PASS.**

### B.5 Rotation verification (LIVE)

Live Redis query against `REDIS_URL` (Railway-shared with prod):

| Fingerprint (deduped legacy+sha) | 24h+ requests |
|---|---|
| `nWII` | **1112** |
| `fC8P` | 424 |
| `R7kM` | 303 |
| `39R2` | 301 |
| `FUUl` | 296 |
| `JYx1` | 175 |
| `tPqf` | 121 |
| `KPtO` | 65 |
| `UHB0` | 60 |
| `H3Dx` | 56 |
| `M5db` | 20 |

11 unique keys. Sum=2933, mean=266.6, stddev≈296.

**Stddev/mean = 1.11**, exceeding the dashboard's own anomaly threshold of 0.7 (`src/app/api/admin/pool-state/route.ts:605` uses `stddev > mean × 0.7` for "GitHub rotation imbalance"). The single hottest key absorbs 38% of all traffic.

No idle keys past 12h (every fingerprint in the table had activity in last 24h). No quarantines (`pool:github:quarantine:*` returned 0 keys).

**FAIL on rotation imbalance**, **PASS on quarantine + idle health**.

### B.6 Quarantine verification

`pool:github:quarantine:*` → 0 keys.
Per the 06-doc Sentry tag table, the alert tags exist (`alert=github-pool-key-invalid`, `alert=github-pool-rate-limit`); without Sentry API access I cannot count Sentry events. **UNVERIFIED — needs Sentry API**. The absence of quarantines is consistent with no key currently being invalid.

## PART C — Phase 1.2 Reddit UA Pool

### C.1 Configuration

`config/reddit-user-agents.json` exists, valid JSON, 5 entries:
```
trendingrepo-scanner/1.0     (+https://trendingrepo.com)
trendingrepo-discovery/1.0   (+https://trendingrepo.com)
trendingrepo-signals/1.0     (+https://trendingrepo.com)
trendingrepo-aggregator/1.0  (+https://trendingrepo.com)
trendingrepo-mentions/1.0    (+https://trendingrepo.com)
```
All carry honest identifier + version + RFC-7231 contact URL. **PASS.**

### C.2 Pool implementation

`src/lib/pool/reddit-ua-pool.ts` and `src/lib/pool/reddit-telemetry.ts` exist. `redditUserAgentFingerprint()` is imported by `src/app/api/admin/pool-state/route.ts:13`. **PASS.**

### C.3 EngineError Reddit variants

`src/lib/errors.ts:107-125` defines 4 classes (`RedditRateLimitError`, `RedditBlockedError`, `RedditPoolExhaustedError`, `RedditRecoverableError`). **PASS.**

### C.4 Call-site migration

Sub-agent C report:
- 6 unique files use `selectUserAgent` / `getRedditUserAgent`.
- 4 production fetch paths (scripts/_reddit-shared.mjs, apps/trendingrepo-worker/src/lib/sources/reddit.ts, two worker fetchers) are pool-aware.
- One diagnostic script (`scripts/probe-reddit-endpoints.mjs`) hardcodes a Chrome UA; it's explicitly diagnostic-only and does not write data. Acceptable per its own contract.

**PASS.**

### C.5 Rotation verification (LIVE)

| Fingerprint | 24h+ requests |
|---|---|
| `0-https-trendingrepo-com` (legacy single-UA fingerprint) | **9** |
| `trendingrepo-scanner-1-0-...` | 1 |
| `trendingrepo-mentions-1-...` | 1 |
| `trendingrepo-discovery-1-...` | 1 |
| `trendingrepo-aggregator-...` | 1 |
| `trendingrepo-signals-1-0-...` | 1 |

Total 14 requests across 6 fingerprints. Legacy fingerprint absorbs 64% of traffic; new pool fingerprints split the remainder evenly.

`pool:reddit:quarantine:*` → 0 keys. 0 rate-limit events recorded.

**Verdict**: structurally PASS, **operationally YELLOW** — legacy fingerprint dominance suggests either (a) bucket TTL hasn't aged out the pre-migration data yet (likely if migration was within the last ~7 days) or (b) some Reddit caller is still hitting Redis with the legacy fingerprint shape. Volume is too low (14 req/24h+) to draw rotation imbalance conclusions for the new pool itself.

## PART D — Phase 1.3 Twitter Apify+Nitter Fallback

### D.1 Configuration

`config/nitter-instances.json` exists with 5 entries. Each has `url`, `lastChecked`, `status`. `lastChecked` for all 5 is `2026-05-04T06:33:21.134Z` (today, ~6h ago). **PASS** structurally.

### D.2 Fallback module

`src/lib/pool/twitter-fallback.ts` exports `scrapeTwitterFor(repoFullName, options)`. Pattern: try Apify with retry (3 delays: 1s/2s/4s), catch on quota/token errors, fall through to `tryNitterScrape`, escalate to `TwitterAllSourcesFailedError` on full failure. Records `recordTwitterCall` for both sources, `recordDegradation` on fallback. Imports correct EngineError types. **PASS.**

### D.3 EngineError Twitter variants

`src/lib/errors.ts:127-150` defines 5 classes (`ApifyQuotaError`, `ApifyTokenInvalidError`, `NitterInstanceDownError`, `NitterAllInstancesDownError`, `TwitterAllSourcesFailedError`). **PASS.**

### D.4 Health check workflow

`scripts/check-nitter-health.mjs` exists. `.github/workflows/check-nitter.yml` exists. `gh run list --workflow=check-nitter.yml --limit 5` returns 1 run, `success` at 2026-05-04T06:32:47Z (~6h ago, matching the lastChecked timestamps in the config). **PASS** with one note: only 1 run since launch — workflow may have just landed; expand frequency check after 7 days.

### D.5 Call-site migration

Sub-agent G secrets sweep + grep confirmed: every Apify-scrape entry point in production routes goes through `scrapeTwitterFor()`. **PASS.**

### D.6 Live data verification

Redis `pool:twitter:*`:
```
pool:twitter:usage:apify:2026-05-04-03    => requests=1 fail=1 lastResponseMs=1
pool:twitter:degradation:2026-05-04-03    => count=1 lastFrom=apify lastError="APIFY_API_TOKEN unset"
pool:twitter:usage:nitter:2026-05-04-03   => requests=1 success=1 lastStatusCode=200 lastResponseMs=1115
```

One Twitter call recorded all day. Apify failed (token unset on the runner that fired); Nitter succeeded as fallback. Hour 03:31 UTC degradation rate = **50%**.

The very low call count (1 across 24h) plus the "Collect Twitter Signals" workflow showing FAILURE in `gh run list` (today 10:53 UTC) suggests the Twitter collector isn't running successfully on its 3h cadence. Expected ~8 runs/day at 3h spacing.

**FAIL** on volume + degradation rate. The fallback module works; the upstream is degraded.

### D.7 Nitter instance health

| URL | Status |
|---|---|
| nitter.net | **healthy** |
| nitter.privacydev.net | dead |
| nitter.poast.org | dead |
| nitter.cz | dead |
| nitter.unixfox.eu | dead |

**1 of 5 healthy. Audit's `<2 healthy = FAIL` line: FAIL.** Single point of failure: if `nitter.net` blocks scraping or rate-limits, the fallback chain has nothing left and Twitter falls through to `TwitterAllSourcesFailedError`. Operator action: refresh the instance list (the Nitter ecosystem has been shrinking in 2026; many of the still-running instances aren't in this 5-entry config).

## PART E — Phase 1.4 `/admin/keys` Dashboard

### E.1 Route + components

`src/app/admin/keys/page.tsx` (66 lines). Imports `AdminKeysDashboard` from `./PoolAnomalies` (the components live in the `keys/` directory). API route at `src/app/api/admin/pool-state/route.ts` (678 lines). **PASS.**

### E.2 Authentication

`page.tsx:24-29`: cookie-based admin session via `verifyAdminSession`, redirects to `/admin/login?next=/admin/keys` on failure.
API route `pool-state/route.ts:673-674`: `adminAuthFailureResponse(verifyAdminAuth(request))`.

Production curl `GET /admin/keys` without cookie returned **HTTP 200** — but reading `page.tsx:42-62`, an unauthenticated user gets the same 200 response with body "Pool telemetry unavailable" (the redirect is server-side via `redirect()`, which yields a 307 in raw HTTP but `curl -L`-style follows; in `-o /dev/null` mode the final status of the redirect-target login page is 200). This is fine — no telemetry data leaks. **PASS.**

### E.3 Section coverage

Pool-state route returns:
- `anomalies` array (PoolAnomalies)
- `github` (GithubPoolSection): rows w/ fingerprint, requests24h, lastRateLimitRemaining, lastRateLimitReset, quarantine, idle, status
- `reddit` (RedditPoolSection): rows w/ fingerprint, userAgentLabel, last429At, quarantine, status; rateLimitedLastHour
- `twitter` (TwitterSection): apify state, sources[apify, nitter], nitterInstances, degradationRate24h
- `singletons`: 12 entries — BLUESKY, DEVTO, PRODUCTHUNT, SMITHERY, LIBRARIES_IO, TRUSTMRR, AA, RESEND, KIMI, ANTHROPIC, HF, FIRECRAWL — exactly matches the audit spec list.

**PASS.**

### E.4 No secret leakage

Sub-agent G-S DEFCON sweep: CLEAN. No `ghp_*`, `github_pat_*`, `sk-*`, `xoxb*`, `apify_api_*`, AWS, JSON `"token":"value"`, or Bearer literals found anywhere in source, docs, commit messages, or rendered HTML paths. Token labels are produced by `redactToken()` (`src/lib/github-token-pool.ts`) — first 4 + last 4 chars only. **PASS.**

### E.5 Auto-refresh + responsive

Not directly verified (no admin cookie in this audit shell). The `dynamic = "force-dynamic"` on the page (line 22) means each request hits the API; client-side polling/refresh, if any, lives in component `PoolAnomalies.tsx`/`AdminKeysDashboard`. **UNVERIFIED — needs admin browser session.**

### E.6 Anomaly detection accuracy (cross-check)

Pool-state route's anomaly detector (`src/app/api/admin/pool-state/route.ts:594-647`):
- Idle key: any GitHub fingerprint unused >12h → RED ("GitHub key X idle")
- GitHub rotation imbalance: `stddev(requests24h) > mean × 0.7` → YELLOW
- Reddit rotation imbalance: same threshold
- Reddit 429 pressure: `rateLimitedLastHour > 5` → RED
- Dead Nitter >24h: YELLOW
- Twitter degradation >50%: YELLOW

Cross-check against live Redis state (Parts B.5 / C.5 / D.6 / D.7):
- GitHub rotation imbalance: 1.11 vs 0.7 → **dashboard SHOULD render this anomaly right now**.
- No Reddit 429 events → dashboard should NOT render Reddit pressure. ✓
- Dead Nitter instances are 6h since last check — under the 24h threshold → dashboard would NOT render them as anomalies despite the 1/5 healthy ratio. **This is a detector gap**: the predicate is "dead AND >24h since check" but the *count* of dead instances (4/5) is not part of the predicate. The anomaly detector should fire when a majority of Nitter instances are dead, regardless of check age.
- Twitter degradation 24h: 1 degraded / (1 apify + 1 nitter) = 50% — at threshold; the predicate is `> 0.5` (strictly greater). With only 2 calls total it's barely meaningful.

**PASS** on the rotation/idle/429 predicates, **YELLOW** on the Nitter health predicate (count-not-considered).

## PART F — Phase 1.5 Sentry + Error Hierarchy

### F.1 Verification doc

`docs/forensic/06-SENTRY-VERIFICATION.md` exists, 100 lines, includes table of surface→result→evidence (Vercel MISSING / Railway worker CONFIGURED / canary BLOCKED). Documents 38-class hierarchy in a table. **PASS** structurally; the doc itself documents Phase 1.5 as not fully verified (BLOCKED on Vercel DSN).

### F.2 Startup instrumentation

Two instrumentation files:
- `instrumentation.ts` (root, 28 lines) — has `register()` that logs `[STARTUP] SENTRY_DSN not configured` or `[STARTUP] Sentry DSN present (length: N)`. Also exports `onRequestError = Sentry.captureRequestError`.
- `src/instrumentation.ts` (20 lines) — duplicate of the same logic with the same startup log. (Next 15 prefers root; the src/ duplicate is per the 06-doc note about sprint contract.)

Both correct. Local boot (per 06-doc evidence) logged `[STARTUP] SENTRY_DSN not configured`. **PASS** structurally; **YELLOW** operationally (DSN unset locally and on Vercel).

### F.3 Canary endpoint

`src/app/api/%5Finternal/sentry-canary/route.ts` (49 lines). Verified contract:
- Auth: `verifyCronAuth(request)` — Bearer CRON_SECRET (line 16-17).
- Gate: returns `404` unless `SENTRY_CANARY_ENABLED === "1"` (line 19-24). Production curl with no auth and gate off returned **404** ✓.
- Body: creates a local `SentryCanaryError extends EngineError` with `category=fatal`, `source=sentry-canary`. Captures with tags `canary=true`, `route=...`, plus `engineErrorTags(error)` (which adds `source` + `category`). Flushes for 2s. Throws the same error so Next 15's `onRequestError` instrumentation fires.

**PASS.**

### F.4 EngineError completeness

Counted classes in `src/lib/errors.ts`:

| Group | 06-doc claim | actual | delta |
|---|---|---|---|
| Base abstract | 1 | 1 (line 1: `EngineError`) | ✓ |
| GitHub | 4 | 4 (lines 87-105) | ✓ |
| Reddit | 4 | 4 (lines 107-125) | ✓ |
| Twitter/Apify/Nitter | 5 | 5 (lines 127-150) | ✓ |
| Hacker News | 3 | 3 | ✓ |
| Bluesky | 3 | 3 | ✓ |
| Dev.to | 3 | 3 | ✓ |
| Lobsters | 3 | 3 | ✓ |
| Product Hunt | 3 | 3 | ✓ |
| Hugging Face | 3 | 3 | ✓ |
| npm | 3 | 3 | ✓ |
| arXiv | 3 | 3 | ✓ |
| **Subtotal (06-doc table)** | **38** | **38** | ✓ |
| Auth (recoverable/quarantine/fatal) | (not in table) | 3 | +3 |
| RateLimit | (not in table) | 1 | +1 |
| Admin | (not in table) | 3 | +3 |
| OpsAlert | (not in table) | 2 | +2 |
| DataStore | (not in table) | 1 | +1 |
| **Total in errors.ts** | — | **48** | +10 |

The 06-doc's 38-class target is met. errors.ts ALSO has 10 additional infrastructure classes (auth/admin/ops-alert/data-store/rate-limit) not enumerated in the 06-doc table. The 06-doc should be updated to list these for accuracy. Not a regression — extra classes are good, they cover failure modes the 06-doc didn't enumerate.

`SentryCanaryError` is defined locally in the canary route file (line 10), not in `errors.ts`. That's a deliberate scope choice (canary-only) and matches what the 06-doc says.

**PASS** with a documentation gap (06-doc undercount).

### F.5 Sentry events flowing

**UNVERIFIED — needs Sentry API access.** No `SENTRY_AUTH_TOKEN` in local env; Vercel `SENTRY_DSN` not set, so production capture path is non-functional regardless. Per the 06-doc, Railway worker side IS configured and DOES emit events.

### F.6 Freshness check Sentry status row

`scripts/check-freshness.mts:6` defines `type SentryStatus = "CONFIGURED" | "MISSING" | "TEST_FIRED";`. The freshness output (per CURRENT-SPRINT.md heartbeats and the partial-success run earlier today) reports `Sentry: MISSING` when DSN is absent. **PASS** structurally; **YELLOW** operationally pending Vercel DSN.

## PART G — Cross-Cutting Concerns

### G.1 Production deployment / CI verification

**`gh run list --workflow=ci.yml --limit 10`** (most recent first):

| Created (UTC) | Conclusion | Branch | HeadSha |
|---|---|---|---|
| 2026-05-04 11:17 | **failure** | main | 439730d3 |
| 2026-05-04 11:02 | **failure** | main | d0a95433 |
| 2026-05-04 10:51 | **failure** | main | e05cc39e |
| 2026-05-04 09:52 | failure | main | (older) |
| 2026-05-04 09:52 | cancelled | main | — |
| 2026-05-04 09:51 | cancelled | main | — |
| 2026-05-04 09:49 | failure | main | — |
| 2026-05-04 09:49 | cancelled | main | — |
| 2026-05-04 09:48 | cancelled | main | — |
| 2026-05-04 09:48 | cancelled | main | — |

Failure root cause (from `gh run view 25315955516 --log-failed`):
```
npm error code EUSAGE
npm error `npm ci` can only install packages when your package.json and
   package-lock.json or npm-shrinkwrap.json are in sync.
npm error Missing: form-data@4.0.5 from lock file
npm error Missing: asynckit@0.4.0 from lock file
npm error Missing: combined-stream@1.0.8 from lock file
npm error Missing: mime-types@2.1.35 from lock file
npm error Missing: delayed-stream@1.0.0 from lock file
npm error Missing: mime-db@1.52.0 from lock file
```
Offending commit: `439730d3 fix(deps): re-add posthog-node — was dropped in a merge but still imported`. The commit message acknowledges the squash-merge that dropped `posthog-node`; the re-add wired package.json + the top-level lock entry for `posthog-node` but not its 6 transitive deps that `form-data` brings in. Same shaped failure on adjacent workflows: "Refresh npm package telemetry" (2026-05-04 11:18 UTC, failure on same sha) and "Collect Twitter Signals" (2026-05-04 10:53 UTC, failure on `e05cc39e`).

**FAIL** — main is broken. Fix is single command: `npm install` then commit the lock delta.

### G.2 Production smoke test (READ-ONLY)

| Endpoint | Status |
|---|---|
| `GET https://trendingrepo.com/` | 200 |
| `GET https://trendingrepo.com/api/health` | 200 |
| `GET https://trendingrepo.com/api/health?soft=1` | 200, `sourceStatus=degraded`, `coverageQuality=cold` |
| `GET https://trendingrepo.com/admin/keys` | 200 (redirect-followed; auth gate intact per E.2) |
| `GET https://trendingrepo.com/api/cron/freshness/state` (no auth) | 401 |
| `GET https://trendingrepo.com/api/_internal/sentry-canary` (no auth) | 404 (gate off) |

`/api/health?soft=1` body shows producthunt as the warning source (`"warning":"degraded sources: producthunt - freshness is live but one or more scanners are below expected quality"`). **PASS** at HTTP layer; **YELLOW** at content layer (producthunt degraded).

### G.3 Data freshness real-world

Local `npm run freshness:check` failed at HTTP 500 on `/api/health?soft=1`. Production `/api/health?soft=1` returns 200 with degraded coverage. The localhost dev server is running but hitting an internal error path; without a stack trace from the server logs I cannot pinpoint the cause from this audit shell. The 500 is local-only — production is reachable.

Per CURRENT-SPRINT.md heartbeat at 11:08 UTC today: production summary `green=45 yellow=0 red=0 dead=5 blocking_non_green=4 advisory_non_green=1`, with blocking dead rows `category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`. These are pre-existing (carried over from the heartbeat sequence in `tasks/CURRENT-SPRINT.md`); not Sprint-1-caused.

### G.4 Error class usage (sub-agent G report consolidated)

- `npm run lint:guards` exit 0.
- 0 bare `throw new Error(...)` in production paths (`src/lib/**`, `src/app/api/**`); all hits in test files (`__tests__/`) which are exempt by AGN-189.
- 22 worker-side files contain bare Errors but worker isn't covered by AGN-189. Optional Sprint 2 lint expansion.
- 0 truly empty catch blocks across the entire monorepo. 0 commented-silent catches.
- 130 `Sentry.captureException` / `captureMessage` sites across `src/` + `apps/trendingrepo-worker/src/`. Pool-related captures use typed `EngineError` subclasses with structured tags (`pool=github|reddit`, `alert=...`, `category=fatal|quarantine|recoverable`, `source=...`). Generic `Error` is only captured at React error.tsx boundaries (94 sites).
- All capture sites are gated by meaningful conditions (status code, exhaustion predicate, error boundary). No fire-on-every-request anti-patterns.

**PASS.**

### G.5 Git hygiene

`git log --oneline --all | head -50` reviewed. Sprint 1 commits use conventional-commit format (e.g. `feat(observability):`, `fix(deps):`, `docs(forensic):`). Phase branches (`sprint-1/phase-1.1-...`) ship merged to main. No suspicious `git add -A`-shaped commits visible. Commit `439730d3` correctly targets only package.json + package-lock.json, and is honest about the regression cause in its message. **PASS** (despite the bad lock-file content — hygiene of *how* it was committed is correct).

### G.6 Secrets exposure

Sub-agent G-S DEFCON sweep: **CLEAN**. No PAT, API key, Bearer literal, or Redis URL with embedded credentials in any tracked file, doc, commit message, or rendered HTML output. The one `ghp_very_secret_value` literal (in `src/__tests__/...masking.test.ts:32`) is a deliberate test fixture for verifying the redaction code itself works. **PASS.**

### G.7 Downtime SLO

Production root `/` returns 200 right now. The 24h Vercel deployment history and PostHog uptime-monitor logs are not directly inspectable from this shell (would need `vercel logs` + PostHog API). Most recent CI failures (G.1) are *push* events on main; they do not auto-deploy to Vercel because the failing step is `npm ci` before the build artifact is produced. Vercel itself has its own build pipeline; need to check Vercel's most recent deploy status separately. **UNVERIFIED — needs Vercel API**, but live prod returning 200 means the last successful deploy artifact is still serving.

## PART H — Red Flags + Recommended Repairs

### H.1 CRITICAL (block Sprint 2 work; fix in next session)

1. **Repair main CI** — run `npm install` (NOT `npm ci`), commit the resulting `package-lock.json` diff. Verify by running `npm ci` locally first to confirm exit 0. Should pull in `form-data@4.0.5` + 5 transitive deps. Single commit, single file changed.

2. **Refresh `config/nitter-instances.json`** — survey current 2026-05 alive Nitter instances (community-maintained list at e.g. https://github.com/zedeus/nitter/wiki/Instances), replace the 4 dead entries with currently-up alternatives, run `node scripts/check-nitter-health.mjs` once locally to confirm `lastChecked` + `status=healthy` for ≥3 of them, commit. The instance ecosystem has churned heavily in 2026; this list will need quarterly review.

### H.2 HIGH (next sprint — Sprint 1.6 hotfix or Sprint 2 day-1)

3. **GitHub rotation imbalance** — top key `nWII` has 1112 of 2933 deduped requests (38%). Investigate why `getNextToken()` keeps picking it: per 05-doc line 16, the selector picks "highest remaining first, round-robin on ties". If `nWII` simply has the highest reset window, the imbalance is mathematically expected. Either (a) accept as designed and remove the >0.7 anomaly threshold, or (b) shift to weighted round-robin once total quota is sufficient. The dashboard should be flagging this anomaly *now* — verify by loading `/admin/keys` with admin cookie.

4. **Local typecheck regressions** —
   - `src/app/api/cron/freshness/state/route.ts` exports `__setInspectSourceForTests` that violates Next 15's route module type. Move the test hook to a sibling `_test-hooks.ts` or use a module-level `if (process.env.NODE_ENV === "test")` guard. (Sprint 0 / 1.5 era.)
   - `src/app/api/health/route.ts:226` Promise type mismatch — typecheck currently fails. (Sprint 0 era.)
   - `src/lib/__tests__/cron-route-typed-error-contract.test.ts` lines 50/61/76 assign to readonly `process.env.NODE_ENV` (TS5+ readonly). Use `Object.defineProperty` or `vi.stubEnv()`. (Sprint 1.5 era — added with the typed-error contract test.)

5. **Reddit pool migration completeness** — verify whether the `0-https-trendingrepo-com` legacy fingerprint traffic comes from (a) bucket TTL not yet expired (expected to self-heal in N hours where N = telemetry TTL) or (b) a still-untouched caller. Inspect `src/lib/pool/reddit-telemetry.ts` for the TTL setting and grep production-path Reddit fetches for any that pass a hardcoded UA literal.

6. **Sentry DSN on Vercel** — pre-existing known blocker per CURRENT-SPRINT.md. Operator action: add `SENTRY_DSN` to Vercel production env. Then trigger `/api/_internal/sentry-canary` once with `SENTRY_CANARY_ENABLED=1` and `Bearer CRON_SECRET` to capture the proof event. Update 06-doc with the event ID + URL. Sprint 1.5 cannot close without this.

7. **Twitter collector reliability** — collect-twitter workflow showed FAILURE in `gh run list` today, and Redis shows only 1 Twitter call all day. Check whether the workflow run failed on the same `npm ci` lock-file regression (likely) — if so, H.1 #1 will fix this implicitly.

### H.3 MEDIUM (BACKLOG candidates)

8. **Anomaly detector — Nitter count predicate**: The current rule fires only on `dead AND >24h since check`. Add a "majority dead" predicate: if >50% of configured Nitter instances are dead at *any* check age, fire YELLOW. This would have caught today's 4/5 dead state immediately.

9. **06-doc EngineError table coverage**: Update the table at `docs/forensic/06-SENTRY-VERIFICATION.md:55-73` to enumerate the 10 infrastructure classes (auth/admin/ops-alert/data-store/rate-limit) currently in `src/lib/errors.ts`. Doc currently undercounts.

10. **Sentry API verification path** — wire a CI-only step that uses `SENTRY_AUTH_TOKEN` to query event counts per `source=` tag for the past 24h. If any source pool is clearly active (per Redis usage telemetry) but emits zero Sentry events for >24h, fail the check. This turns "is Sentry capturing?" into a gate.

11. **Worker bare-Error lint expansion** — extend AGN-189 lint to `apps/trendingrepo-worker/src/**`. 22 files there throw bare `Error`. Sub-agent G suggested this and it makes sense as Sprint 2 quality work.

### H.4 LOW (cosmetic)

12. lint produces 97 warnings (0 errors). `npm run lint -- --fix` would resolve ~18 automatically. Not blocking.

13. Two duplicate instrumentation files (`instrumentation.ts` at root + `src/instrumentation.ts`). 06-doc says both intentional but they share identical logic. Document the rationale for the duplication or consolidate to one.

14. `scripts/probe-reddit-endpoints.mjs` hardcodes a Chrome UA. The script is explicitly diagnostic-only and never writes data, so it's not a regression — but adding `// pool-bypass: diagnostic-only, not used in production` per the lint:bypass opt-out convention would make the intent explicit at scan time.

## Evidence Appendix

### A. lint:bypass output
```
[check-no-pool-bypass] OK — scanned src for pool bypass patterns.
```
Exit code: 0.

### B. lint:guards output
Exit code: 0. `lint:tokens && lint:err-message && lint:zod-routes && lint:runtime && lint:err-envelope && lint:v3-budget && lint:bypass` all pass.

### C. EngineError class count (errors.ts)
Manual count: 48 classes (1 abstract base + 47 concrete). Method: `grep ^export.class src/lib/errors.ts | wc -l = 47` plus the abstract base.

### D. Redis pool state snapshot (2026-05-04 ~12:30 UTC)
- `pool:github:usage:*` keys: 158
- `pool:github:quarantine:*`: 0
- `pool:github:tokens:*`: present (snapshot/published-state keys)
- `pool:reddit:usage:*`: 14
- `pool:reddit:quarantine:*`: 0
- `pool:twitter:usage:apify:2026-05-04-03`: requests=1, fail=1 (APIFY_API_TOKEN unset)
- `pool:twitter:usage:nitter:2026-05-04-03`: requests=1, success=1, statusCode=200
- `pool:twitter:degradation:2026-05-04-03`: count=1

### E. Recent commits (last 10 on this branch)
```
58ffcaba test(derived-repos/F14): cover twitter decorator immutability + mapping
ba594d0c test(api/E5): cover oEmbed route — SSRF guard + matrix of url shapes
90ec33b5 test(api/F2): cover admin/scan 10 req/min rate-limit envelope
22d25330 test(api/F13): cover error-envelope shape contract
23da3214 fix(roi): harden source logos and submit layout
77551445 fix(admin): disambiguate key pool telemetry
6c30774a fix(workflows/D1): retry+continue-on-error agentic.market 429s and align Node 22
2ea006a9 fix(observability): publish sentry canary route
fd04ea5f fix(observability): publish sentry canary route
1901fe1c audit-2026-05-04 followup: snapshot timeouts + secret rotation runbook + arxiv ownership (#99)
```

### F. Tests previously confirmed passing (preserved from prior 07-doc)
- `npx tsx --test src/lib/__tests__/github-token-pool.test.ts` → pass 23, fail 0
- `node --test scripts/__tests__/reddit-shared.test.mjs` → pass 8, fail 0
- `npx tsx --test src/lib/__tests__/twitter-fallback.test.ts` → pass 4, fail 0

### G. typecheck failure tail
```
.next/types/app/api/cron/freshness/state/route.ts(12,13): error TS2344: ... 'OmitWithTag<...>' does not satisfy the constraint '{ [x: string]: never; }'.
  Property '__setInspectSourceForTests' is incompatible with index signature.
src/app/api/health/route.ts(226,51): error TS2345: Argument of type 'Promise<void> | Promise<RefreshResult> ...' is not assignable to parameter of type 'Promise<void>'.
src/lib/__tests__/cron-route-typed-error-contract.test.ts(50,17): error TS2540: Cannot assign to 'NODE_ENV' because it is a read-only property.
src/lib/__tests__/cron-route-typed-error-contract.test.ts(61,17): error TS2540: ...
src/lib/__tests__/cron-route-typed-error-contract.test.ts(76,15): error TS2540: ...
```

### H. CI failure tail (run 25315955516)
```
npm error code EUSAGE
npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync.
npm error Missing: form-data@4.0.5 from lock file
npm error Missing: asynckit@0.4.0 from lock file
npm error Missing: combined-stream@1.0.8 from lock file
npm error Missing: mime-types@2.1.35 from lock file
npm error Missing: delayed-stream@1.0.0 from lock file
npm error Missing: mime-db@1.52.0 from lock file
##[error]Process completed with exit code 1.
```

### I. Production smoke
```
GET / => 200
GET /api/health => 200
GET /api/health?soft=1 => 200 (sourceStatus=degraded, warning: producthunt)
GET /admin/keys => 200 (auth gate intact)
GET /api/cron/freshness/state (no auth) => 401
GET /api/_internal/sentry-canary (no auth) => 404
```

### J. Sub-agent reports (read-only, summaries only)
- **Sub-agent B** (GitHub call-site sweep): 9 runtime surfaces all pool-aware; 0 src/ bypasses; lint:bypass exit 0. PASS.
- **Sub-agent C** (Reddit UA sweep): 6 files use `selectUserAgent`; 4 prod paths pool-aware; 1 diagnostic script hardcodes UA (acceptable); 5 honest UAs in config. PASS.
- **Sub-agent G** (cross-cutting hygiene): 0 bare Errors in guarded zones; 0 empty catches; 130 Sentry capture sites all gated; lint:guards exit 0. PASS.
- **Sub-agent G-S** (DEFCON secrets): 0 hits across all surfaces. CLEAN.

## Recommended Next Action

**Run a targeted Sprint 1.6 hotfix sprint addressing CRITICAL items 1–2 within the next 24h, before any Sprint 2 source expansion.** Specifically:

1. Sync the lock file (`npm install`, commit, push). Single commit; should unblock ALL workflows on main.
2. Refresh `config/nitter-instances.json` so ≥3 instances are healthy. Single config-file commit.
3. Once CI is green, address HIGH items 3–5 on a feat branch before Sprint 2 kickoff.
4. Sprint 1.5 close (item 6) requires Mirko/CTO to set Vercel `SENTRY_DSN` — that's an operator action, not an engineering action.

Sprint 2 source expansion was the implied next step; **defer it 1 day**. Ship the Sprint 1.6 hotfix sprint first.
