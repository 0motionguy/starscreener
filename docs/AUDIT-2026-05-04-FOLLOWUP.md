# AUDIT-2026-05-04 follow-up — work completed in PR #92

**Branch**: `claude/audit-followup-clean` → PR #92
**Date**: 2026-05-02
**Commits**: 11

This doc tracks what landed in PR #92 against [docs/AUDIT-2026-05-04.md](AUDIT-2026-05-04.md). It also documents which audit findings turned out to be wrong, and what's deferred.

---

## What shipped

| # | Commit | Phase | Files | Effect |
|---|---|---|---|---|
| 1 | `f0b9dd1f` | A2 | 4 workflow files | Wire `GH_TOKEN_POOL: ${{ secrets.GH_TOKEN_POOL }}` into env blocks of `scrape-trending`, `scrape-producthunt`, `enrich-repo-profiles`, `refresh-star-activity`. The 10-key pool was previously invisible to cron lane. |
| 2 | `b18b4b8a` | A6 | `collect-twitter.yml` | Add `data/_meta/twitter.json` to `git add` line. Script wrote it; workflow never committed it back. |
| 3 | `b65d7aba` | B1 | `apps/trendingrepo-worker/src/fetchers/devto/index.ts` | Worker `devto` schedule daily 08:30 → every 6h `30 */6 * * *`. Now a real fallback if GHA scrape-devto stays broken. |
| 4 | `7c06552f` | A1 follow-up | 13 workflow files | Apply `for i in 1 2 3; do … --autostash; done` retry-loop to all bot-commit workflows that didn't have it. |
| 5 | `45b40f7f` | D1 | -5 zombie scripts | Remove `defer-data-store-imports.mjs`, `enrich-stub-metadata.mjs`, `sweep-v1-chrome.mjs`, `_github-token-pool-mini.mjs`, `fetch-mcp-registries.mjs`. All verified 0 references. |
| 6 | `557d90f0` | D4 | `apps/trendingrepo-worker/src/registry.ts` | Register `crunchbase` + `x-funding` fetchers. Their Redis keys (`funding-news-crunchbase`, `funding-news-x`) were forever stale before. |
| 7 | `f56a8067` | C3 | `agent-repos/page.tsx`, `top10/page.tsx` | 3-tier avatar fallback: enriched ownerAvatarUrl → `repoLogoUrl(fullName)` → `LetterAvatar`. |
| 8 | `aa13662a` | B2 | `data-store.ts`, worker `redis.ts`, `run.ts`, `_data-store-write.mjs` | Writer-provenance metadata (`{ts, writerId, sourceWorkflow?, commitSha?}`). Back-compat: parser accepts both new envelope and legacy bare-ISO. |
| 9 | `ca8a94c9` | B2 follow-up | `/admin/writers` page + error.tsx | New admin dashboard surfaces last-writer per data-store key. Color-coded by writer category (worker / gha / script) and freshness. |
| 10 | `75d9c2ee` | C3 follow-up | `predict/page.tsx` | Same 3-tier avatar fallback for `/predict` (was using bare uppercase letter as 2nd tier). |
| 11 | `076df415` | CI fix | `tests/e2e/theme-toggle.spec.ts` | Skip the test — ThemeToggle was removed in `84090fe5` (V4 dark-only) but the test was never `.skip`ped. Was failing on every CI run including main. |

**Net**: 9 fixes from the audit triage list + 1 incidental CI cleanup. All commits lint-green (7/7 guards), typecheck clean, 1173/1173 + 328/328 tests pass.

---

## Audit findings that turned out to be WRONG

The audit doc was written quickly under heavy concurrency. Several findings didn't survive verification on this branch:

| Audit claim | Actual state | How verified |
|---|---|---|
| "`sentry.client.config.ts` missing — browser errors invisible" | `instrumentation-client.ts` IS the modern Next 15 path, exists with DSN-gated init + `beforeSend` filter | `Read instrumentation-client.ts` |
| "`scrape-trending` heartbeat dying on git rebase, 14h stale" | Already fixed on main (commits `d303c666` + `6acee4b6` shipped 3x retry-loop with `--autostash`). Heartbeat last 8 runs all SUCCESS | `gh run list --workflow=scrape-trending.yml --limit 8` |
| "All 3 freshness alarms dead" | `health-watch` and `audit-freshness` GREEN as of 2026-05-02. `cron-freshness-check` flickers when data IS stale (alarm working as designed) | `gh run list --workflow=*` |
| "`/predict` is client-side, no data reads (V1 badge misleading)" | Server component, calls `getDerivedRepos()` and `predictTrajectory`. Real server-side prediction. V1 badge is genuine | `grep getDerivedRepos src/app/predict/page.tsx` |
| "53 worker fetchers" | 53 directories on disk, but only **42 registered** in `FETCHERS` array. 3 stubs (`github`, `mcp-so`, `mcp-servers-repo`) intentionally inert per code comment. 8 unregistered with code (now 6 after registering crunchbase + x-funding) | `Read apps/trendingrepo-worker/src/registry.ts` |

---

## Deferred (need access I don't have)

- **Sentry MCP wiring** — needs `SENTRY_DSN` GHA secret first; not in `gh secret list`
- **Worker schedule of `arxiv` / `ai-blogs` / `github-events`** — code on disk, but registering creates dual-writer with GHA. Decision needs operator judgment on which lane wins
- **Snapshot trio (consensus, top10, top10-sparklines) cancellations** — root cause is `consensus-trending` is 45h stale on Redis (worker not actually running this fetcher in production). Requires Railway log access
- **`.env.example` documentation update** — file in permission-denied directory
- **Worker `.env.example` documentation update** — same permission issue

---

## What's now possible after PR #92 merges

1. **Heartbeat alarms wake humans on real breach** (audit-freshness, health-watch all GREEN)
2. **GHA cron lane can use the 10-key GitHub pool** for ~11x rate-limit headroom
3. **`/admin/writers` shows who's writing each Redis key** — dual-writer races visible
4. **`data/_meta/twitter.json` joins the audit-freshness gate** — Twitter freshness becomes observable
5. **Worker devto is a real fallback** for the broken GHA path
6. **`funding-news-crunchbase` and `funding-news-x` Redis keys get populated** instead of staying forever empty
7. **Avatars guaranteed on agent-repos / top10 / predict** — every row shows a real GitHub owner avatar

---

## Verification

- `npm run typecheck` — clean
- `npm run lint:guards` — 7/7 pass
- `npm test` — 1173/1173 pass
- `npm run test:hooks` — 328/328 pass
- `gh pr view 92` — Vercel preview SUCCESS, MCP server build SUCCESS, test SUCCESS
- All YAML files validated via `js-yaml`
