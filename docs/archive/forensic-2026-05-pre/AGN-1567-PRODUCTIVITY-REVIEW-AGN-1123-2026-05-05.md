# AGN-1567 Productivity Review for AGN-1123 (2026-05-05)

## Reviewed artifact
- `docs/forensic/AGN-1123-SIDEBAR-ROUTE-VISIBILITY-PARITY-2026-05-05.md`

## Verdict
- Status: **PARTIAL / NEEDS FOLLOW-UP**
- Productivity grade: **B-**

## What was productive
- Followed mandatory opening protocol and recorded freshness context.
- Enumerated sidebar destinations from `SidebarContent.tsx`.
- Verified static route parity claim with file-level existence checks.
- Explicitly separated static parity from runtime/browser parity.

## Gaps reducing acceptance value
1. Runtime evidence is weakly reproducible
- The artifact reports many `ERR` route outcomes but does not include command outputs, timestamps per route, or a deterministic failure matrix.

2. Route check method lacks acceptance precision
- It uses raw local HTTP probes for page routes but does not verify visible user paths in browser context (Playwright) as required for UI-surface acceptance.

3. Failure mode attribution is incomplete
- It flags runtime instability but does not classify whether failures are auth-gated (`401`), app exceptions (`500`), or timeout/network conditions per route.

4. No direct linkage to current freshness failure mode
- It does not connect the route failures to concrete health endpoint evidence (`/api/health?soft=1`, `/api/cron/freshness/state`) for the same heartbeat.

## CTO replay evidence in this heartbeat
- `npm run freshness:check` => `request timed out while contacting http://localhost:3023`
- `Get-NetTCPConnection -LocalPort 3023 -State Listen` => listener present (process bound)
- `GET /api/cron/freshness/state` => `401 Unauthorized`
- `GET /api/health?soft=1` => server-side null-reference error message

Interpretation: this is **product/runtime failure**, not "localhost server missing".

## Required follow-up to close AGN-1123 cleanly
1. Produce deterministic route matrix
- For each sidebar route: timestamp, HTTP status, latency, failure class (`ok|401|500|timeout|network`), and command output snippet.

2. Add browser-visible parity pass
- Run Playwright smoke on all sidebar routes and capture: navigation success, console errors, failed requests, and title/body-presence checks.

3. Tie failures to root runtime health
- In same heartbeat, include `/api/health?soft=1` and `/api/cron/freshness/state` outcomes and classify whether blocker is auth-path, app exception, or freshness-policy gate.

4. Acceptance threshold
- Do not mark runtime parity done until all enabled sidebar routes are either HTTP 200 or explicitly accepted as auth-gated with documented expected behavior.
