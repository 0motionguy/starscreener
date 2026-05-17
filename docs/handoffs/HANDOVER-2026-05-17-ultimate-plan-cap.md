# SESSION HANDOVER — 2026-05-17 (session context near full)

## TL;DR for operator

This session shipped **8 PRs across Stage 1 (Close FIXING) + Stage 2 (Onboarding Phase 1)** of the ULTIMATE PLAN at `~/.claude/plans/go-buzzing-seal.md`. Production smoke is 29/29 green. Open PR queue: **0**. Codex audit P1/P2/P3 all addressed. The ONBOARDING flow is alive end-to-end: signup → welcome modal → /you/alerts empty state → preset templates → tooltips → first-alert toast → /watchlist. **Twitter is the only real production issue still stuck** (13+ days dead; cancel-at-90min mystery — the latest investigation hypothesis is in §6 below).

Marketing-ready milestone = post-S3.5 (~14 more hours focused work). We are at S2 completion = halfway.

---

## 1. Paste-ready role prompt for fresh session

```
You are picking up a TrendingRepo CTO autonomous session. The prior
session was approaching context cap. Stages 1 + 2 of the ULTIMATE
PLAN at ~/.claude/plans/go-buzzing-seal.md just shipped. Operator
(Mirko) wants to continue toward the MARKETING-READY milestone which
requires Stages 3 + 3.5 to complete (then S4 is post-launch scale).

BEFORE DOING ANYTHING:

1. Read these files in order:
   - docs/handoffs/HANDOVER-2026-05-17-ultimate-plan-cap.md  (THIS FILE — primary)
   - ~/.claude/plans/go-buzzing-seal.md                       (full multi-stage plan)
   - ~/.claude/projects/c--dev-trendingrepo/memory/MEMORY.md   (memory index)
   - ~/.claude/projects/c--dev-trendingrepo/memory/project_2026-05-16_session_g_complete.md  (full session log)
   - CLAUDE.md + CLAUDE.local.md  (project rules + working-with-Mirko)

2. Run these read-only checks:
   - git fetch origin && git log --oneline origin/main -15
   - gh pr list --state open --limit 20
   - curl -sI -H 'User-Agent: Mozilla/5.0 (compatible; TrendingRepoPostDeploySmoke/1.0; +https://trendingrepo.com)' https://trendingrepo.com/ | head -5
   - gh run view 25985373914 --json conclusion  (the cancelled Twitter run from the prior session)
   - cat data/_meta/twitter.json  (twitter.json still stuck at 2026-05-04?)

3. CRITICAL FACTS (do NOT re-derive):
   - Apify is PERMANENTLY OFF (#1594). Free providers only.
   - /agent-commerce was V4-rebuilt (#1606): 2293 → 431 LoC, cache fix B working (ISR HIT).
   - /reddit/trending got matching cache fix B (#1620): ISR HIT verified.
   - 87 route error.tsx use centralized <ErrorPanel> with dynamic-import Sentry (#1619 fixed race).
   - Welcome modal + alerts polish shipped — see §3 below.
   - Twitter cron is 3x/day @ 04:23/12:23/20:23 UTC, limit=50, 90min timeout (#1611) + nitter reorder (#1587) + ingest 409 tolerance (#1601) + meta-age monitor (#1615). STILL CANCELLING AT 90MIN. See §6 for the next investigation step.
   - Codex audit findings P1/P2/P3 all addressed (see §3).

4. HARD RULES (NEVER):
   - NEVER push to main without per-push consent ("go" / "do it" / "ship" / "next" / short reply = green light)
   - NEVER `git add .` or `-A` — explicit paths only
   - NEVER skip git hooks (--no-verify)
   - NEVER destructive git without consent
   - NEVER edit apps/trendingrepo-worker/** outside narrow hardening (parallel session territory)
   - NEVER touch scripts/_cross-source-search.mjs / scripts/_secret-scrubber.mjs
   - NEVER use Apify — free providers only
   - NEVER mock Redis/DB in scoring-logic tests
   - NEVER propose Storybook coverage (operator rejected)
   - NEVER inline hardcoded freshness chrome — wire to FreshnessBadge + classifyFreshness
   - ALWAYS isolation: "worktree" for coder sub-agents

5. PICKUP ORDER (default):

S3 — USER ONBOARDING Phase 2 (~8h, 6 PRs):
  - S3.A: Email digest schedule banner on /you/alerts
  - S3.B: Referral invite banner on /you
  - S3.C: Pricing pre-checkout walkthrough modal
  - S3.D: Submission funnel analytics on /submit (FunnelMount)
  - S3.E: Day-1 / Day-7 email follow-ups (cron-onboarding-emails.yml)
  - S3.F: /you dashboard "next step" progress widget

S3.5 — Compliance + Hygiene (~6h, 4 PRs) — MARKETING-READY MILESTONE:
  - S3.5.A: Account deletion endpoint (GDPR right-to-erasure)
  - S3.5.B: Profile editing (/you/settings)
  - S3.5.C: Cookie consent banner (GDPR/CCPA)
  - S3.5.D: Newsletter + transactional email deliverability verification

S4 — Scale + Harden (~14h, split across follow-up sprints):
  - 24+ items in plan file; cherry-pick by impact

OPERATOR WORKING STYLE:
- Short replies = trust + green light. Don't ask for re-confirmation.
- "Boil the ocean" — ship complete things with tests + docs
- Make architecture calls — propose with rationale, don't ask which path
- Smallest safe increment → verify → next
- Use isolation: "worktree" for ALL coder sub-agents
- Run code-reviewer / security-auditor / design-auditor verification BEFORE admin-merging
- If sub-agents rate-limit: work direct in worktrees + main checkout (with NEVER git add .)

VERIFICATION GATE (every PR before merge):
npm run typecheck && npm run lint:guards && npm run test:hooks

If picking up: read this doc + the plan + memory, run the 5 read-only
checks, tell operator "ready" with 1-paragraph queue state, then ask
which stage to start on (default: S3.A unless operator overrides).
Re-dispatch in parallel sub-agents wherever possible (5-10 at a time).
```

---

## 2. State of the world (verified 2026-05-17 ~17:00 SGT)

- **Main HEAD:** `b24b55e61 fix(onboarding): WelcomeModal backdrop + remove stale comment (#1626)`
- **Open PR queue:** **0**
- **Production smoke (29 canonical routes):** all 200 (or expected 307 on auth-gated /you/alerts)
- **Cache fix B verified live:** `/agent-commerce` + `/reddit/trending` both return `X-Vercel-Cache: HIT` with `X-Nextjs-Prerender: 1` on warm requests. ISR engaging.
- **Security headers live:** CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy, HSTS (63072000s).
- **Onboarding flow live:** signup → WelcomeModal → CTA to /you/alerts → EmptyState → AlertPresets (4 templates: Breakout / Daily digest / New release / Mention spike) → FieldTooltips on form → first-alert toast → /watchlist suggestion.
- **Apify dependencies:** completely removed per `docs/POLICY-NO-APIFY.md` (#1594).
- **Lighthouse runner:** wired (`npm run lighthouse:routes:prod`), waiting on `PAGESPEED_API_KEY` to be added to GH Actions Secrets + Vercel env vars.

---

## 3. What landed since session-G start (chronological, condensed)

**Stage 1 — Close FIXING (5 PRs):**
- `#1615` Twitter health-monitor meta-age check (catch silent writeSourceMeta failures)
- `#1616` Lint guard "use client" detection with leading comments — Codex P2
- `#1619` Sentry race fix — centralize capture in ErrorPanel via dynamic import — Codex P2/P3
- `#1620` /reddit/trending cache fix B — searchParams → client island
- `#1623` Drop funding-x + demote 11 dead sources to advisory — Codex P1

**Stage 2 — USER ONBOARDING Phase 1 (3 PRs):**
- `#1624` Post-signup welcome modal (one-time, cookie-gated) — `WelcomeModal.tsx` + `WelcomeModalGate.tsx` in `src/components/onboarding/`
- `#1625` Alerts polish — empty state + tooltips + presets + first-alert toast — 4 new files in `src/app/you/alerts/_components/`
- `#1626` WelcomeModal backdrop + stale-comment polish (post-S2.F design audit)

**Stale cleanup:** 8 funding-signal bot PRs closed (cron auto-regenerates newer).

**Total since session-G start:** **80+ PRs merged** across Wave 1+2 of the original handover + all FIXING/PATCHING/ONBOARDING work.

---

## 4. ULTIMATE PLAN status (per `~/.claude/plans/go-buzzing-seal.md`)

| Stage | Status | Items | Effort |
|---|---|---|---|
| S1 — Close FIXING | ✅ **DONE** | 8 items (5 merged + 2 deferred + verification) | 8h spent |
| S2 — Onboarding Phase 1 | ✅ **DONE** | 6 items (3 PRs covering all 6 + design polish) | 6h spent |
| S3 — Onboarding Phase 2 | ⏳ **READY** | 6 items: email banner, referral banner, pricing modal, funnel analytics, day-N emails, progress widget | ~8h |
| S3.5 — Compliance + Hygiene | ⏳ **READY (MARKETING-READY MILESTONE)** | 4 items: GDPR account delete, profile editing, cookie consent, email deliverability | ~6h |
| S4 — Scale + Harden | ⏳ **READY (split across sprints)** | 24+ items: perf budgets, Lighthouse CI, bundle analyzer, test coverage, web vitals, SEO/a11y follow-ups, security audits, /search audit, etc. | ~14h |

**Target for "we can just market it now"**: complete S3 + S3.5 (~14 hours focused work). S4 is post-launch optimization.

---

## 5. Outstanding S1 items (deferred, NOT blockers)

- **S1.E** — /agent-commerce 8.8 MB HTML payload trim. **Deferred** because gzip compresses it to 718 KB (user-perceived transfer is fine). Mobile parse-time concern but not user-blocking. Pagination + SSR data-slicing would fix it. ~2h work.

- **S1.F** — Twitter run verification. **Still failing.** See §6 below.

---

## 6. THE TWITTER MYSTERY (the only real production-data issue still open)

**Status:** 13+ days stuck. `data/_meta/twitter.json` `ts` = 2026-05-04. Latest manually-dispatched run (`25985373914`) cancelled at 90min budget.

**Already shipped this week:**
1. #1529 — `timeout-minutes: 5` on `git-commit-data` step (was blocking on `gh pr merge --auto`)
2. #1601 — collector tolerates 409 IDEMPOTENCY_CONFLICT (was crashing on `openclaw/wacli`)
3. #1587 — nitter instances reordered (`nitter.net` first, `xcancel.com` removed)
4. #1611 — schedule changed to 3x/day @ 04:23/12:23/20:23 UTC, limit raised 10→50, timeout-minutes raised 30→**90**, concurrency group `cancel-in-progress: false`
5. #1615 — health monitor adds meta-age check (will now correctly flag silent failures on next cron run — previously line-count went up so passed even though meta stale)

**Latest hypothesis (from last cancelled-run log inspection):**
- Each nitter query ~10s; 50 repos × 4 queries × 10s = ~33 min minimum sequentially
- Plus consensus computation, commit pipeline, ingest API calls
- Sequential processing means even 90min is tight if anything slows down
- `xcancel.com` circuit-breaker (now removed) was masking the problem in earlier runs

**Next investigation step for next session:**
1. Fetch FULL log of cancelled run: `gh run view 25985373914 --log > /tmp/twitter-full.log`
2. Look at timestamps to identify the ACTUAL bottleneck (where the 90 min was spent)
3. Likely fix: **concurrent per-repo processing** (e.g., bounded-concurrency queue of 4-8 parallel) — pattern reference in `apps/trendingrepo-worker/src/fetchers/consensus-analyst/index.ts`
4. Alternative: split into 5 batched workflows (operator's earlier suggestion) — `collect-twitter-batch-1.yml` through `collect-twitter-batch-5.yml`, each scanning 10 repos

**For now**: the new health monitor (#1615) will alert when meta-age exceeds 6h (warning) or 24h (error). Twitter dashboard will show stale data until the deeper fix lands.

---

## 7. Operator-only items (COMPLETE LIST — standing decisions)

### Infrastructure / Secrets
1. **AWS STS key `ASIA…3FUC` rotation** — AWS Console
2. **R2 backup secrets** (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET) → unblocks `backup-redis-snapshot.yml`
3. **PAGESPEED_API_KEY** in GH Actions Secrets + Vercel env → unblocks S4.B Lighthouse CI

### Verification
4. **Clerk webhook verify** — trigger test signup, confirm `tr.profiles` row appears
5. **Sentry source-maps + release tagging** — confirm in Sentry UI
6. **PostHog producing data in prod** — verify in PostHog dashboard

### Product Decisions
7. **Twitter "split into multiple workflows"** vs current 3x/day cadence — surface after Twitter deep-dive in §6
8. **Onboarding tour library** — custom (recommended) vs Shepherd.js / Intro.js
9. **`hf-avatars` collector** — KEEP (build new) or DROP from required-sources
10. **/research broken viewport (A4)** — name which viewport (375 / 768 / 1280)
11. **OG card editorial direction** — Bloomberg/Blockworks tear-sheet aesthetic?
12. **Domain SPF/DKIM/DMARC for Resend** — DNS records, unblocks S3.5.D
13. **/repo/* visual hero reorganization** — specify direction
14. **/agent-commerce 8.8 MB SSR payload** — accept gzip mitigation OR ship S1.E pagination

### Sprint 5.6 follow-up
15. **#1543 EngineError refactor** — merged but reviewer flagged TS2305 errors on missing classes. Production smoke 200, but the missing `TransientHttpError` / `FatalConfigError` / `RateLimitQuarantineError` classes need to exist in `src/lib/errors.ts` to avoid runtime crashes on throw paths that import them. Verify or add.

---

## 8. Hard rules in force (NEVER list)

- NEVER push to `main` without per-push consent
- NEVER `git add .` / `-A` — explicit paths only
- NEVER skip git hooks (--no-verify)
- NEVER destructive git without consent (`reset --hard`, `push --force`, `branch -D` of in-use branches)
- NEVER edit `apps/trendingrepo-worker/**` (parallel session active)
- NEVER touch `scripts/_cross-source-search.mjs` / `_secret-scrubber.mjs`
- NEVER use Apify (free providers only — see `docs/POLICY-NO-APIFY.md`)
- NEVER mock Redis/DB in scoring-logic tests
- NEVER inline hardcoded freshness chrome — wire `FreshnessBadge` + `classifyFreshness`
- NEVER propose Storybook coverage
- NEVER duplicate components without grep
- NEVER recommend `REDDIT_COLLECTOR_PROVIDER=apify`
- NEVER claim Clerk webhook broken without test signup
- ALWAYS use `isolation: "worktree"` for coder sub-agents
- ALWAYS verify with code-reviewer / security-auditor / design-auditor BEFORE admin-merge

---

## 9. Reusable assets that should be remembered

### Components
- `src/components/ui/ErrorPanel.tsx` — central Sentry capture via dynamic import (#1619)
- `src/components/ui/EmptyState.tsx` — 4 variants (no-data / filter-empty / source-down / unknown-route)
- `src/components/shared/Skeleton.tsx` — 4 variants (card / row / chart / detail)
- `src/components/terminal/TerminalSkeleton.tsx` — for grid views
- `src/components/onboarding/WelcomeModal.tsx` + `WelcomeModalGate.tsx` — post-signup gate
- `src/app/you/alerts/_components/AlertPresets.tsx` — 4 preset templates
- `src/app/you/alerts/_components/FieldTooltip.tsx` — keyboard-accessible inline tooltip

### Primitives
- `src/lib/og-primitives.ts` — `CardFrame`, `Wordmark`, `AccentStrip`, `StarMark`, `Dot`
- `src/lib/seo.ts` — `OG_COLORS`, `OG_CACHE_HEADERS`
- `src/lib/api/rate-limit.ts` — `checkRateLimitAsync` (Redis-backed)
- `src/lib/api/auth.ts` — `verifyCronAuth`, `verifyAdminAuth`, `verifyUserAuth`
- `src/lib/auth/server.ts` — `requireUser`, `getUser`, `getOptionalUser`
- `src/lib/auth/clerk-appearance.ts` — Clerk design tokens

### Patterns
- Cache fix B (#1606 + #1620): `await searchParams` in RSC → moves to client island with `useSearchParams()`
- Sentry capture: dynamic `import("@sentry/nextjs").then(({captureException}) => …)` per #1619
- Rate-limit: `checkRateLimitAsync({windowMs, maxRequests})` + 429 with `Retry-After`
- Welcome cookie: `sb_welcomed=1; Path=/; SameSite=Lax; Secure-when-https; 90-day expiry`

### CI Guards (don't break these)
- `scripts/lint-no-secret-env-in-client.mjs` (#1600) — flags `process.env.<SECRET>` reads in `"use client"` files; updated #1616 to allow leading comments
- `scripts/lint-no-secret-fields-in-response-types.mjs` (#1600) — flags `secret|password|hash|pat|token`-named fields in exported API response interfaces (with camelCase tokenizer + allowlist)
- `.github/workflows/no-gabagool.yml` — blocks legacy "gabagool" string references

---

## 10. Verification commands (run before any "shipped" claim)

```bash
# Per-PR gate
npm run typecheck && npm run lint:guards && npm run test:hooks

# Smoke (29 routes)
UA='Mozilla/5.0 (compatible; TrendingRepoPostDeploySmoke/1.0; +https://trendingrepo.com)'
for r in / /githubrepo /skills /mcp /reddit/trending /hackernews/trending /lobsters /devto /bluesky/trending /twitter /signals /top10 /compare /funding /revenue /arxiv/trending /producthunt /huggingface /npm /breakouts /categories /methodology /research /tools/revenue-estimate /repo/vercel/next.js /trends /agent-commerce /agent-commerce/facilitator /repo/anthropics/anthropic-cookbook; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' -H "User-Agent: $UA" https://trendingrepo.com$r)  $r"
done

# Cache fix B verification (should show X-Vercel-Cache: HIT on warm)
curl -sI -H "User-Agent: $UA" https://trendingrepo.com/agent-commerce | grep -iE "(vercel-cache|nextjs)"

# Twitter run status
gh run list --workflow=collect-twitter.yml --limit 5 --json status,conclusion,createdAt

# Freshness
npm run dev  # in one terminal
npm run freshness:check  # in another, after dev server boots
```

---

## 11. References

- **Memory:** `~/.claude/projects/c--dev-trendingrepo/memory/MEMORY.md` (index)
- **Full session log:** `~/.claude/projects/c--dev-trendingrepo/memory/project_2026-05-16_session_g_complete.md`
- **ULTIMATE plan:** `~/.claude/plans/go-buzzing-seal.md`
- **Prior session handover:** `docs/handoffs/FULL-HANDOVER-2026-05-16.md`
- **Apify policy:** `docs/POLICY-NO-APIFY.md`
- **Project rules:** `CLAUDE.md` + `CLAUDE.local.md`

---

🤖 Composed autonomously by Claude Opus 4.7 (1M context) on session-context approach to cap. Next session: read §1, run §2 checks, default to picking up Stage 3 — unless operator overrides.
