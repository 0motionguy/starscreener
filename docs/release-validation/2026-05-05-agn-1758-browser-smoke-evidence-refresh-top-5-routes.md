---
last-verified: 2026-05-05
verified-by: paperclip-qa
status: in_review
issue: AGN-1758
---

# AGN-1758 Release QA Evidence - Browser smoke evidence refresh for top 5 routes

Issue: `AGN-1758`  
Scope: refresh release-tier browser smoke evidence for top 5 routes with console/request error capture.

## Mandatory opening + freshness preflight
- Mandatory opening bundle completed this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md` (fallback for missing `docs/AUDIT-2026-05-04.md`), `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Command: `npm run freshness:check`
- Checked at: `2026-05-05T07:10:xxZ`
- Localhost status: `http://localhost:3023` reachable (not missing)
- Freshness verdict: `RED` (command failed)
- Failure detail: `GET /api/health?soft=1 -> HTTP 500 Internal Server Error`

## Browser smoke execution (release-tier top 5)
Definition used for top 5: first five routes in `docs/regression-map.md` Release Smoke Tier.

- Base URL: `http://localhost:3023`
- Browser: Playwright Chromium (headless)
- Viewport: `1366x768`
- Checked at: `2026-05-05T07:14:02.820Z`
- Raw artifacts:
  - `qa-artifacts/agn-1758-browser-smoke-top5.json`
  - `qa-artifacts/agn-1758-top5-http-smoke.json`

| Route | HTTP | Body chars | Console errors | Request failures | First observed failure |
|---|---:|---:|---:|---:|---|
| `/` | 500 | 0 | 1 | 0 | `ENOENT .next/server/app/page/build-manifest.json` |
| `/consensus` | 200 | 5834 | 0 | 0 | none |
| `/skills` | 500 | 0 | 1 | 1 | `ENOENT .next/server/app/skills/page/server-reference-manifest.json` |
| `/mcp` | 500 | 0 | 1 | 0 | `ENOENT .next/server/app/mcp/page/server-reference-manifest.json` |
| `/agent-repos` | 200 | 5126 | 1 | 0 | hydration mismatch warning (gradient id drift) |

## QA classification
- Environment blocker: `NO` (localhost reachable; browser probe executed)
- Product failure: `YES` (3/5 routes returning HTTP 500 with runtime ENOENT in `.next/server/app/...` manifests)

## Acceptance decision for AGN-1758
- Top-5 browser smoke evidence delivered: `GREEN`
- Top-5 browser smoke acceptance: `RED`
- Release recommendation: `BLOCKED`

## Residual risk
- Route-level runtime instability persists on core release-tier surfaces (`/`, `/skills`, `/mcp`), so release evidence remains non-accepting.
- `npm run freshness:check` remains failing due to `/api/health?soft=1` 500; freshness gate is non-green.
