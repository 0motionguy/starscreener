---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# AGN-1509 CORS/CSP posture retry pass (2026-05-05)

## Scope
- Issue: `AGN-1509` (`[Sprint 1 audit] Platform Security CORS/CSP posture refresh`)
- Mode: read-only audit
- Goal: satisfy acceptance evidence with endpoint matrix + CSP verdict + remediation owners

## Mandatory opening + freshness
- Mandatory docs re-read in this heartbeat:
  - `CLAUDE.md`
  - `docs/ENGINE.md`
  - `docs/SITE-WIREMAP.md`
  - `docs/forensic/00-INDEX.md`
  - `tasks/CURRENT-SPRINT.md`
  - `tasks/BACKLOG.md`
- Note: `docs/AUDIT-2026-05-04.md` is absent in current workspace path.
- Freshness command:
  - `npm run freshness:check`
  - Result: timeout contacting `http://localhost:3023`.

## CORS matrix (15 public endpoints, hostile origin preflight)

Probe shape:
- `OPTIONS <url>`
- `Origin: https://evil.example`
- `Access-Control-Request-Method: <GET|POST>`

| Endpoint | Status | ACAO |
|---|---|---|
| `/api/health?soft=1` | `204` | `<none>` |
| `/api/cron/freshness/state` | `204` | `<none>` |
| `/api/repos/openai/gpt-4` | `204` | `<none>` |
| `/api/top10` | `404` | `<none>` |
| `/api/top10/latest` | `404` | `<none>` |
| `/api/trending` | `404` | `<none>` |
| `/api/signals` | `404` | `<none>` |
| `/api/funding/news` | `404` | `<none>` |
| `/api/revenue/startups` | `404` | `<none>` |
| `/api/ideas` | `204` | `<none>` |
| `/api/watchlist` | `404` | `<none>` |
| `/api/compare/share` | `204` | `<none>` |
| `/api/admin/pool-state` | `204` | `<none>` |
| `/portal` | `204` | `*` |
| `/portal/call` | `204` | `https://evil.example` |

Verdict:
- `/api/*` surfaces probed remain non-reflective (no ACAO observed).
- `/portal` and `/portal/call` remain permissive to hostile origins in production.

## CSP header verification (top pages)

GET probes:
- `/`
- `/signals`
- `/skills`
- `/mcp`
- `/twitter`

Result:
- `HTTP 200` for all 5 pages.
- `Content-Security-Policy` header missing on all 5 responses.

Verdict:
- CSP header is not present in live production responses for top pages (fail).

## Remediation list (owner + action)
1. Portal CORS drift remediation
   - Owner: Release/Deploy owner (CTO delegate)
   - Action: deploy route/runtime parity so hostile origins are denied or non-reflective for `/portal` and `/portal/call`.
   - Verification: rerun hostile-origin `OPTIONS` probes; require no wildcard and no hostile-origin reflection.
2. CSP production header gap
   - Owner: Platform/Release owner
   - Action: ensure production build/runtime emits `Content-Security-Policy` as configured in repo.
   - Verification: `curl -I` on `/`, `/signals`, `/skills`, `/mcp`, `/twitter` shows CSP header present.
3. Local freshness verification path
   - Owner: Platform engineer
   - Action: restore `localhost:3023` responsiveness so `npm run freshness:check` can complete.

## Acceptance status
- `>=15` endpoint CORS audit: met (15/15).
- CSP headers on top pages with pass/fail verdicts: met (5/5 checked, fail).
- Remediation list with owners/actions: met.
- Issue should remain blocked until production portal CORS and CSP header gaps are resolved and re-proven.
