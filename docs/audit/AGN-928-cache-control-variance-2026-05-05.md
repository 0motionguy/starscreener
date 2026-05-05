# AGN-928 — Cache-Control variance audit (shrink the matrix)

- Date: 2026-05-05
- Owner: SRE (bot/sre/AGN-819 working tree)
- Ticket: [QUE-25][PERF] Cache-Control variance audit — shrink the matrix
- Related: ADR-0003 (cache tiers), AGN-670, `src/lib/api/cache.ts`

## TL;DR

The matrix today carries **15 distinct `Cache-Control` strings** across ~75 emitting sites. `src/lib/api/cache.ts` already defines a four-profile contract (`READ_FAST`, `READ_MEDIUM`, `READ_SLOW`, `READ_HEAVY`), but it is bypassed by inline strings in roughly 40 routes — the canonical lib has been re-imported in only a handful of places. The fix is mostly migration, not new policy.

The ticket asks for a 3-bucket public/edge axis (hot 60s / warm 1800s / cold 86400s). I recommend **3 public buckets + 2 non-public buckets**, mapped tightly to the existing `cache.ts` profiles, and a strict allow-list to keep new routes from inventing variants.

## 1. Current matrix (variance survey)

Frequency = number of emit sites I counted; "T2 source" = ADR-0003 tier this implies.

| # | Cache-Control string | Where defined | Sites | T2 source |
|---|---|---|---|---|
| V1 | `public, s-maxage=30, stale-while-revalidate=60` | `lib/api/cache.ts:READ_FAST` + inline copies | 9 | hot |
| V2 | `public, s-maxage=60, stale-while-revalidate=300` | `lib/api/cache.ts:READ_MEDIUM` + inline copies | 9 | warm |
| V3 | `public, s-maxage=300, stale-while-revalidate=3600` | `lib/api/cache.ts:READ_SLOW` + inline copies | 3 | warm/cold |
| V4 | `public, s-maxage=3600, stale-while-revalidate=86400` | `lib/api/cache.ts:READ_HEAVY` (declared, no current users) | 0 | cold |
| V5 | `public, s-maxage=300, stale-while-revalidate=300` | inline (`/api/repos/[owner]/[name]/mentions`) | 1 | warm |
| V6 | `public, s-maxage=300, stale-while-revalidate=60` | inline (`/api/repos/[owner]/[name]`, `/api/badge/...`) | 2 | warm — **inverted SWR<TTL** |
| V7 | `public, s-maxage=30, stale-while-revalidate=120` | inline (`/api/repos/[owner]/[name]/events`) | 1 | hot |
| V8 | `public, s-maxage=60, stale-while-revalidate=120` | inline (scoring engagement/consensus 5xx fallback) | 2 | warm |
| V9 | `public, s-maxage=1800, stale-while-revalidate=3600` | inline (RSS feeds) | 3 | warm/cold |
| V10 | `public, s-maxage=3600, stale-while-revalidate=3600` | inline (`/api/og/*` `CACHE_HEADER`) | 5 | cold |
| V11 | `public, s-maxage=60` | inline (OG fallback / `/portal`) | 3 | hot |
| V12 | `public, s-maxage=86400, stale-while-revalidate=172800` | inline (`/api/oembed`) | 1 | cold |
| V13 | `private, s-maxage=60, stale-while-revalidate=300` | inline (`/api/mcp/usage`) | 1 | warm-private |
| V14 | `private, max-age=60` | inline (`/api/export/csv`) | 1 | warm-private |
| V15 | `private, no-store` | inline (`/api/openapi.json`, `/api/model-usage/features`, `/api/watchlist/private`) | 3 | private |
| N1 | `no-store` (with/without `max-age=0`) | inline — admin, cron, x402, mcp/record, internal/signals, scan-log, drop-events | 17+ | bypass |
| N2 | `no-cache, no-transform` | inline (`/api/stream` SSE — both 200 and error) | 2 | bypass |

### Variance hot-spots

- **V6 inverts SWR < TTL** — `stale-while-revalidate=60` after `s-maxage=300` is a no-op (the SWR window ends inside the fresh window). `/api/repos/[owner]/[name]` and `/api/badge/[owner]/[name]` are silently equivalent to `s-maxage=300`. Likely a copy-paste bug.
- **V5** sets `swr=300` equal to `s-maxage=300` — same anti-pattern, less severe.
- **V8** is only used on the 5xx error path of `/api/scoring/{engagement,consensus}` — short success cache (V1/V2) but a *different* 5xx cache. Adds variance for no win; the success-path bucket should drive both.
- **V10 (`s-maxage=3600, swr=3600`) and V12 (`s-maxage=86400, swr=172800`)** pre-date the introduction of `READ_HEAVY` (which is wider on stale). OG endpoints + oembed should converge on `READ_HEAVY` unless we have a specific reason for shorter SWR (we do not — these are content-addressed by query).
- **V11 (`s-maxage=60`)** lacks SWR; under load, expiry causes a thundering-herd refetch. `READ_MEDIUM` (`s-maxage=60, swr=300`) is strictly better at the same hot point.
- **N1** is fragmented across at least 7 declaration patterns (`{ "Cache-Control": "no-store" }`, `NO_STORE_HEADERS`, `NO_STORE`, `as const` variants, mid-handler `response.headers.set`). Same value, but no single import. Easy to consolidate.
- **`READ_FAST`/`READ_MEDIUM`/`READ_SLOW` are inlined 9 + 9 + 3 times** — the lib export is not used by most call sites. Migrating these alone shrinks the inline string count by ~21.

## 2. Proposed canonical set

Five buckets — three public (matching ticket spec), two private/bypass. Names match `src/lib/api/cache.ts` so migration is mechanical.

### Public read tiers (the only edge-cacheable ones)

| Profile | Header | Use for |
|---|---|---|
| **`READ_HOT`** (was `READ_FAST`) | `public, s-maxage=60, stale-while-revalidate=300` | High-churn read endpoints refreshed by cron tick: mentions, freshness, events stream snapshot, scoring success path, model-usage. **Note**: ticket asked for s-maxage=60 hot tier; current `READ_FAST` is `s-maxage=30`. Round up to 60s — collector cadence supports it and cuts edge revalidate traffic by ~50%. |
| **`READ_WARM`** (was `READ_SLOW`) | `public, s-maxage=1800, stale-while-revalidate=3600` | Hourly-ish content: feeds (`funding.xml`, `breakouts.xml`, `agent-commerce.xml`), calibration histograms, GitHub compare overlays, repo profile (`/api/repos/...`), badges. Ticket spec value (`s-maxage=1800`). |
| **`READ_COLD`** (was `READ_HEAVY`) | `public, s-maxage=86400, stale-while-revalidate=172800` | Deploy-bundled / content-addressed payloads: `/api/openapi.json` (when public), OG images keyed on slug+date, oembed, llms.txt. Ticket spec value (`s-maxage=86400`). |

### Non-public buckets (kept distinct on purpose)

| Profile | Header | Use for |
|---|---|---|
| **`PRIVATE_NO_STORE`** | `private, no-store` | Authenticated user state: `/api/watchlist/private`, `/api/openapi.json` admin variant, `/api/model-usage/features`, `/api/export/csv`. |
| **`NO_STORE`** | `no-store` | All admin + all cron + all webhook + x402 + mcp/record-call + internal/signals candidates + SSE error fallback. Single string, single import. |

### Special cases (one-off, document and lock)

| Route | Header | Why |
|---|---|---|
| `/api/stream` (SSE 200) | `no-cache, no-transform` | Required by Server-Sent Events; cannot use `no-store` (breaks proxies). |
| `/api/og/*` static-asset variants | `READ_COLD` | Served by `static.trendingrepo.com` host (per `middleware.ts` allow-list) — long edge cache is correct. |

This collapses 15 strings → 5 + 1 SSE exception. Ticket says "3 buckets"; the extra two are `private`/`no-store` and the SSE special case, which the ticket's framing did not cover but the codebase already ships.

## 3. Migration list (per-route)

### Public reads — switch to `READ_HOT` (`public, s-maxage=60, stale-while-revalidate=300`)

| File | Current | Notes |
|---|---|---|
| `src/app/api/mentions/route.ts:13` | V1 | inline → `READ_HOT_HEADERS` |
| `src/app/api/repos/[owner]/[name]/aiso/route.ts:55` | V1 | GET path |
| `src/app/api/repos/[owner]/[name]/freshness/route.ts:25` | V2 | already medium; align to HOT (60s) |
| `src/app/api/repos/[owner]/[name]/events/route.ts:40` | V7 (`s=30 swr=120`) | normalize |
| `src/app/api/scoring/engagement/route.ts:78,113` | V1 (200) + V8 (5xx) | both → HOT, drop the 5xx-specific value |
| `src/app/api/scoring/consensus/route.ts:69,115` | V1 + V8 | same as above |
| `src/app/api/compare/route.ts:180` | V1 | inline → HOT |
| `src/app/api/worker/health/route.ts:252,264` | V1 | both branches → HOT |
| `src/app/api/model-usage/{overview,models,rankings,[modelId]}/route.ts` | V2 (4 sites) | already HOT-equivalent post-rename |
| `src/app/api/compare/payloads/route.ts:78` | V2 | → HOT |

### Public reads — switch to `READ_WARM` (`public, s-maxage=1800, stale-while-revalidate=3600`)

| File | Current | Notes |
|---|---|---|
| `src/app/api/repos/[owner]/[name]/route.ts:50` | V6 — **bug** (`swr=60 < ttl=300`) | fix while migrating |
| `src/app/api/badge/[owner]/[name]/route.ts` | V6 | same bug |
| `src/app/api/repos/[owner]/[name]/mentions/route.ts:21` | V5 (`swr=300=ttl`) | → WARM |
| `src/app/api/compare/github/route.ts:194,236` | V3 | → WARM |
| `src/app/api/predict/calibration/route.ts:45` | V3 | → WARM |
| `src/app/feeds/funding.xml/route.ts:93` | V9 | already WARM — keep, switch to import |
| `src/app/feeds/breakouts.xml/route.ts:112` | V9 | same |
| `src/app/feeds/agent-commerce.xml/route.ts:83` | V9 | same |
| `src/app/portal/route.ts:88` | V11 (`s-maxage=60`, no SWR) | → WARM (or HOT if we want freshness — currently 60s is intentional, but missing SWR is the actual bug; HOT is the safer target) |

### Public reads — switch to `READ_COLD` (`public, s-maxage=86400, stale-while-revalidate=172800`)

| File | Current | Notes |
|---|---|---|
| `src/app/api/og/top10/route.tsx:81` `CACHE_HEADER` | V10 | tighten SWR up |
| `src/app/api/og/mindshare/route.tsx:32` `CACHE_HEADER` | V10 | same |
| `src/app/api/og/star-activity/route.tsx:57,895,946` | V10 + V11 fallback | unify |
| `src/app/api/og/tier-list/route.tsx:130` | V10 | same |
| `src/app/api/oembed/route.ts:130` | V12 | already COLD |

### Private — switch to `PRIVATE_NO_STORE`

| File | Current | Notes |
|---|---|---|
| `src/app/api/watchlist/private/route.ts:58` | V15 | already correct, switch to import |
| `src/app/api/openapi.json/route.ts:99,172` | V15 + N1 | unify on PRIVATE_NO_STORE for the admin path |
| `src/app/api/model-usage/features/route.ts:16` | V15 | switch to import |
| `src/app/api/mcp/usage/route.ts:40` | V13 (`private, s-maxage=60, swr=300`) | this is genuinely cacheable per-user — KEEP as the only V13 user, but document. Or move to PRIVATE_NO_STORE if per-user cache turns out to be unsafe (worth a follow-up). |
| `src/app/api/export/csv/route.ts:352` | V14 (`private, max-age=60`) | → PRIVATE_NO_STORE (CSV exports shouldn't sit in any cache; 60s saves nothing meaningful). |

### `NO_STORE` — single import, replace ad-hoc copies

All of `src/app/api/admin/**/route.ts`, `src/app/api/cron/**/route.ts`, `src/app/x402/route.ts`, `src/app/api/mcp/record-call/route.ts`, `src/app/api/internal/signals/twitter/v1/candidates/route.ts`, `src/app/api/compare/share/route.ts` (5 inline N1 emit sites). Replace with `NO_STORE_HEADERS` import.

### Special cases — leave as-is, add comment + lock via test

- `src/app/api/stream/route.ts:99,162` — keep `no-cache, no-transform`. Document as the only allowed deviation.

### `next.config.ts`

No `Cache-Control` rules in `headers()` today (only security headers). No change required, but consider adding a default `Cache-Control: no-store` for `/api/admin/:path*` as defense-in-depth so a future route handler that forgets to set headers is still safe. Out of scope for this audit.

### `middleware.ts`

No header injection — only rate-limit, blocklist, and host redirect. No change.

## 4. Recommended rollout

1. Land this audit doc (this PR).
2. Add named constants `READ_HOT_HEADERS`, `READ_WARM_HEADERS`, `READ_COLD_HEADERS`, `PRIVATE_NO_STORE_HEADERS`, `NO_STORE_HEADERS` to `src/lib/api/cache.ts` (keep the old names as deprecated aliases for one release). Update the doc comment to point at this file.
3. Per-route migration in 4 PRs grouped by tier (HOT, WARM, COLD, NO_STORE). Each PR ships its own e2e header assertion under `tests/cache-control-policy.test.ts`.
4. Add an ESLint rule (or a pre-commit grep) banning literal `Cache-Control` strings outside `src/lib/api/cache.ts` and `src/app/api/stream/route.ts`.
5. Update ADR-0003 to cite this audit.

## 5. Immediate fixes flagged in scope

I am **not** committing changes (per ticket constraint — branch has unrelated work). The two routes that are functionally broken today (V6 inverted SWR<TTL on `/api/repos/[owner]/[name]` and `/api/badge/[owner]/[name]`) should be top of the migration PR queue — they are silently halving the intended cache hit rate.

## Acceptance status

- [x] Current matrix documented (15 variants, ~75 sites)
- [x] Canonical set proposed (3 public + 2 non-public + 1 SSE exception)
- [x] Per-route migration list provided
- [ ] `docs/perf/cache-policy.md` — this audit lives at `docs/audit/` per ticket Step 4; a follow-up can move/copy the canonical buckets into `docs/perf/cache-policy.md` once approved.
- [ ] Each route handler updated — out of scope (audit only).
- [ ] e2e header assertions — out of scope (audit only); recommended in §4.
