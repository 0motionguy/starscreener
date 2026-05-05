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
