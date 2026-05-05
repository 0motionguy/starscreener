---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# AGN-590 Sidebar route visibility parity audit (2026-05-05)

## Mandatory opening + freshness
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` (this heartbeat): `localhost:3023` not reachable (`ECONNREFUSED`).

## Sidebar route parity (static)
Source: `src/components/layout/SidebarContent.tsx`.

Checked all sidebar destinations (href + push targets) against `src/app/**`:
- All targets map to implemented routes.
- `/huggingface` is implemented via `src/app/huggingface/route.ts` redirect (308 to `/huggingface/models`), so it is not orphaned.
- No dead sidebar destination found in code.

## Browser verification (runtime)
Playwright smoke over all sidebar targets at `http://localhost:3023`:
- all attempts failed with `status=0` / `chrome-error://chromewebdata/`
- cause: local server unreachable (matches freshness `ECONNREFUSED`)

## Current blocker and owner
- Blocked on: local runtime unavailable (`localhost:3023` down), so browser acceptance cannot be proven.
- Needs: platform engineer start/stabilize local runtime (`npm run dev` and resolve startup errors), then frontend reruns sidebar Playwright parity evidence and closes AGN-590.

## OPS reroute evidence (Release SRE heartbeat 2026-05-05T14:12+08:00)
- Re-routing comment handled: preflight incident treated as platform-health first.
- `npm run freshness:check` now reaches localhost and `/api/health`:
  - `target=http://localhost:3023`
  - `health=ok`
  - `sourceStatus=degraded`
  - command exit is non-zero due to stale sources (`blocking_non_green=18`), not connectivity.
- Direct health probes (3x) all passed HTTP 200:
  - `2026-05-05T14:11:50+08:00`
  - `2026-05-05T14:11:53+08:00`
  - `2026-05-05T14:11:55+08:00`
- Direct payload check confirms stable endpoint state:
  - `status=ok`, `sourceStatus=degraded` from `GET /api/health?soft=1`.

## SRE disposition
- Platform preflight blocker (`localhost:3023` and `/api/health`) is cleared in this heartbeat.
- Remaining failures are data freshness/staleness, outside AGN-590 sidebar parity scope.
- Hand-off action: return AGN-590 to prior frontend assignee for sidebar route parity acceptance rerun.
