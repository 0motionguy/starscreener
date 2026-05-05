# AGN-753 Sitemap Completeness Audit (2026-05-05)

## Mandatory opening + freshness
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran `npm run freshness:check`.
- Result: **localhost:3023 is reachable (not missing), but stale/degraded** because `/api/cron/freshness/state` returned `HTTP 500 Internal Server Error`.

## Live sitemap endpoint status (production)
- `https://trendingrepo.com/sitemap.xml` -> `200` (length 645)
- `https://trendingrepo.com/sitemap-pages.xml` -> `200` (length 23826)
- `https://trendingrepo.com/sitemap-repos.xml` -> `200` (length 427105)
- `https://trendingrepo.com/sitemap-news.xml` -> `200` (length 166029)
- `https://trendingrepo.com/sitemap-digest.xml` -> `200` (length 476)

## Verified gap and fix shipped in this heartbeat
### Gap
`/brief/[owner]/[name]` pages exist and are user-reachable, but sitemap indexing was incomplete:
- `src/app/brief/sitemap.ts` existed, but production `https://trendingrepo.com/brief/sitemap.xml` was returning `404`.
- `/sitemap.xml` did not reference any brief sitemap URL.

### Fix
1. Added concrete route handler: `src/app/brief/sitemap.xml/route.ts`
   - Emits `<urlset>` entries for all `listRepoBriefRefs()` items.
2. Wired sitemap index: `src/app/sitemap.xml/route.ts`
   - Added `https://trendingrepo.com/brief/sitemap.xml` in `<sitemapindex>` output list.
3. Removed dead/conflicting metadata sitemap file:
   - Deleted `src/app/brief/sitemap.ts`.

## Additional completeness observations (audit notes)
- `src/app/sitemap-pages.xml/route.ts` includes `/collections`, but `src/app/collections/route.ts` currently `308` redirects to `/categories` and sets `X-Robots-Tag: noindex, nofollow`; this should be reviewed as a policy mismatch (index sitemap vs explicit noindex redirect).
- Dynamic detail surfaces intentionally are not in static hubs and are covered by other maps/patterns (`/repo/*`, `/digest/*`, now `/brief/*`).

## Local verification after code change
- Ran: `npm run typecheck`
- Result: **failed due to pre-existing unrelated errors** in other areas (`scripts/scrape-funding-crunchbase.ts`, alerts/backfill API typing, tests, and `MobileDrawer` props). No new type error tied to sitemap file changes was introduced by this heartbeat.

## Changed files
- `src/app/sitemap.xml/route.ts`
- `src/app/brief/sitemap.xml/route.ts`
- `src/app/brief/sitemap.ts` (deleted)
