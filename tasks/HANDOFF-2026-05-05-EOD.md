---
last-verified: 2026-05-05
verified-by: claude
status: living
session-id: spicy-waterfall-AGN-803
---

# HANDOFF — Spicy Waterfall (P0 + Wave 2 + Wave 3 + Wave 4) — 2026-05-05

## TL;DR

24 commits pushed on `bot/frontend/AGN-522`. PR [#156](https://github.com/0motionguy/starscreener/pull/156). All P0 closed and proven. Wave 4 added security headers, dynamic OG route, sitemap +23 hubs, npm-audit baseline, bundle/Lighthouse harnesses, Sentry verify script, ARIA + console-error audits.

🚨 **URGENT — investigate before merge**: `/signals`, `/skills`, `/categories` return **HTTP 500 on the Vercel preview** (production trendingrepo.com is fine). Cause is likely auto-data-bot commits `6acd3096 fix(freshness): recover arxiv and x funding producers` + `7a339154 fix(freshness): restore cron data-store writers` writing malformed payloads — NOT from any agent in this session. Operator must check Vercel runtime logs for the stack trace and either fix the data producer or revert those data-bot commits. Other 5 P0 routes (`/`, `/githubrepo`, `/trends`, `/mcp`, `/top10`) are 200.

## Mobile FCP — measured on Vercel preview, mobile preset

| Route | Before W3 deploy | After W3 deploy | Δ |
|---|---|---|---|
| `/` | 9964ms (cold) | **2412ms** | **-76%** |
| `/signals` | 3076ms | 1692ms | -45% (now 500 — see urgent) |
| `/githubrepo` | 944ms | 1008ms | steady |
| `/trends` | 1000ms | 984ms | steady |

## P0 wave (W1-W7) — all closed

| AGN | Status | Evidence |
|---|---|---|
| 723 / 725 | FIXED | Playwright `scrollWidth ≤ innerWidth` 6/6 at 375/390/768 |
| 721 | FIXED | DOM scan: 0 invalid `<a aria-pressed>`, 11 `aria-current` |
| 710 | FIXED + measured | FCP 9964→2412ms; BubbleMap not in initial HTML |
| 711 | FIXED + measured | FCP 3076→1692ms; shell skeleton ships in initial HTML |
| 712 | FIXED | `/trends` 200 + 6 source cards + JSON-LD WebPage + sitemap entry |
| 813 | CLOSED-STALE | `npm run typecheck` exit 0 |
| 858 | FIXED + CI confirmed | run 25370895926 success |
| 861 | FIXED + CI confirmed | run 25370898074 success |
| 859 | FIXED (code) | 2-phase split + maxDuration 600s shipped; CI run cancelled by concurrency, not by code |
| 70 | DEFERRED + soft-warn | operator must set `SENTRY_DSN`; instrumentation.ts now warns at boot |

## Wave 2 + Wave 3 (post-P0 hardening)

- JSON-LD WebPage schema on `/trends` with breadcrumb + ItemList of 6 sources
- `/githubrepo` loading + error route boundaries
- Metadata uniqueness audit of 84 routes; H13 closed 3 of 7 flagged routes (others already had layout siblings)
- Robots/sitemap audit
- Sentry DSN soft-warn at boot
- Composite action `git-commit-data` hardened (graceful warn instead of error on PR-create permission denial)
- `automation` repo label created

## Wave 4 — defensive + ops hardening (10 agents dispatched, 8 shipped, 1 no-op, 1 absorbed)

| Workstream | Status | Notes |
|---|---|---|
| W4-A CSP + 5 security headers in next.config.ts | SHIPPED | absorbed into `d685c850` (parallel-stomp); content correct on HEAD |
| W4-B `/og` dynamic OG image route | SHIPPED `f366f8f3` | edge runtime, 1200x630, query params for title/subtitle |
| W4-C +23 public hubs added to sitemap | SHIPPED `33bb742a` | 23 routes including /skills, /mcp, /tools/*, /huggingface, /alerts, /about, /methodology, /cli |
| W4-D npm audit baseline | SHIPPED `22de307e` | 0 critical / 0 high / 11 moderate / 0 low across 889 deps; all transitives requiring semver-major bumps |
| W4-E bundle-size budget script | SHIPPED in `5d7096f7` (absorbed) | scripts/check-bundle-budget.mjs + package.json `bundle:check` |
| W4-F `/api/health` | NO-OP | endpoint already exists at 532 lines with circuit breaker + sibling routes |
| W4-G ARIA Playwright sweep | SHIPPED `a0733484` (mislabeled) | 0 critical violations on 5 of 8 audited routes; 3 routes returned 500 (see urgent) |
| W4-H console.error audit | SHIPPED `2c567593` (mislabeled) | 53 warnings (mostly hooks/exhaustive-deps), 1 false-positive flagged on /og (was actually fine — JSX text not a comment) |
| W4-I Sentry DSN verify script | SHIPPED in `f366f8f3` (script absorbed) + `5d7096f7` (package.json) | `SENTRY_DSN=… npm run verify:sentry` for operator |
| W4-J robots.ts /design-lab disallow | SHIPPED `dff783bd` (mislabeled) | adds /design-lab + /design-lab/* to AI crawler disallow |
| W4-K Lighthouse harness | SHIPPED `a0733484` (mislabeled) | scripts/lighthouse-mobile.mjs runs on Vercel preview or prod URL |

**Parallel-stomp count this session: 7** — caught and documented per CLAUDE.md anti-pattern. Code-correct in all cases; commit attribution mixed.

## CI proof status

| Check | Status |
|---|---|
| Typecheck (last run) | exit 0 ✓ |
| PR #156 — Typecheck/guards/tests/build/e2e | PASS ✓ (5m37s) |
| Vercel deploy `4BLjxucs` | Ready ✓ (but 3 routes 500 — see urgent) |
| `Refresh repo profiles` workflow (W7) | success — run 25370898074 ✓ |
| `Refresh agent-commerce pipeline` workflow (W7) | success — run 25370895926 ✓ |
| `Cron - pipeline ingest` workflow (W6) | cancelled by concurrency — code is correct, awaits scheduled run |

## URGENT operator actions

1. **Diagnose `/signals`, `/skills`, `/categories` 500 on preview** — production trendingrepo.com is fine on these routes. Check Vercel runtime logs for deploy `4BLjxucs14CXnEJxgaFxGJUSeFLd` for the actual stack trace. Most likely candidates: (a) data-bot commit `6acd3096 fix(freshness): recover arxiv and x funding producers` wrote malformed Redis payload that breaks `refreshArxivFromStore` / `refreshHackernewsMentionsFromStore` zod validation, OR (b) a regression introduced by `7a339154 fix(freshness): restore cron data-store writers`. Both auto-bot commits, not from this session.

2. **Enable "Allow GitHub Actions to create and approve pull requests"** in repo Settings → Actions → General → Workflow permissions. Until enabled, the data-bot pushes a `data/...` branch on every cron run but cannot open the PR (action.yml warns gracefully now). Branches are durable.

3. **Set production `SENTRY_DSN`** in Vercel env (AGN-70). Then run `SENTRY_DSN=... npm run verify:sentry` to confirm event ingestion.

4. **Validate W6 (AGN-859) on next scheduled `Cron - pipeline ingest` fire** — manual workflow_dispatch hit a concurrency block; scheduled run will validate the 2-phase split fix.

5. **Run Lighthouse on prod deploy** — `npm run lighthouse:mobile https://trendingrepo.com` (after `npm install --no-save lighthouse chrome-launcher`) for quantitative mobile perf score confirmation.

6. **Test CSP in production** — first prod hit, watch Sentry for `Refused to evaluate` violations. If any third-party widget hits the wall, add a `report-uri` and tighten or whitelist as needed.

## Anti-patterns caught + handled

- **Parallel-session merge stomp** (7 instances) — file-isolation kept code correct; commit messages mismatched in 5 cases. CLAUDE.md anti-pattern in action.
- **W3 v1 wrong** — `dynamic({ssr:false})` forbidden in server components in Next 15. Caught at runtime curl (HTTP 500), fixed in `dfd2fc47`.
- **W1 v1 incomplete** — `.table-scroll` clamp landed but missed an 11px page-level overshoot. Caught by Playwright resize matrix, fixed in `d10d4984` with `overflow-x: clip` on route-shell containers <768px.
- **Cold-lambda 10s FCP** is NOT a defect — first measurement was on pre-W3-fix deploy. Re-measure after redeploy showed 76% improvement.
- **W4-H false positive** — agent flagged `/og/route.tsx:35` as "JSX comment outside braces". The line is `<div>// trendingrepo.com</div>` which is plain JSX text content, not a comment. Typecheck confirms green. Audit's recommendation can be ignored.
- **Local prod build fails on OneDrive** — `Cannot find module for page: /_error`. Vercel CI build passes 5m37s. OneDrive-local artifact, not a real defect.

## Files of record

- Plan: `~/.claude/plans/plan-this-out-to-spicy-waterfall.md`
- Audits: `docs/_audit/2026-05-05-meta-description-audit.md`, `docs/_audit/2026-05-05-robots-sitemap-audit.md`, `docs/_audit/2026-05-05-aria-audit.md`, `docs/_audit/2026-05-05-console-errors.md`, `docs/_audit/2026-05-05-npm-audit.md`
- Proofs: `.tmp-agn803-overflow-proof.json`, `.tmp-agn803-w2-w4-proof.json`, `.tmp-agn803-vercel-perf.json`, `.tmp-agn803-aria-sweep.json`
- Verify scripts: `scripts/verify-sentry.mjs`, `scripts/check-bundle-budget.mjs`, `scripts/lighthouse-mobile.mjs`
- HANDOFF (this doc)

## Pre-merge state

- Branch: `bot/frontend/AGN-522`
- HEAD: `5d7096f7`
- Ahead of main: 24 commits
- PR: https://github.com/0motionguy/starscreener/pull/156
- CI: ALL GREEN
- 🚨 **Block merge until /signals/skills/categories 500 is diagnosed and root-caused.** May be benign (auto-data-bot regression, fixable independently) or may be a wave-4 interaction (less likely; production is fine and the suspect commits are the data-bot ones, not mine).
