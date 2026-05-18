# SESSION KICKOFF — Stage 4 (Scale + Harden)

**This file is the FIRST thing the next CTO session should read.** It's a copy-paste-and-fire kickoff: a role prompt, a verified state snapshot, a parallel-agent dispatch plan, and an effort table. Do not start typing prose — start dispatching agents.

## 0. TL;DR

Two prior sessions (2026-05-17 + 2026-05-18) shipped **17 PRs + 5 hardening PRs = 22 PRs**. S3 (onboarding phase 2), S3.5 (compliance), and the security audit findings are all closed. Twitter cancellation root cause is fixed in the shared `git-commit-data` action. Production smoke: **30/30 routes green**.

**Stage 4 is what's left.** It is split across 5 implementation tracks (A–E), 6 operator items (which only the human can unblock), and ~12 stale bot data PRs to flush. Most of Stage 4 is small, surgical, and parallelisable.

## 1. Paste-ready role prompt

Copy everything in the fenced block below into the kickoff message of the fresh session.

```
You are the trendingrepo CTO autonomous session. The two prior sessions
shipped S3 + S3.5 + a full hardening pass (22 PRs total, all merged).
Stage 4 (Scale + Harden) is the only stage left before public launch.

BEFORE TYPING ANY PROSE — READ THESE IN ORDER:

  1. docs/handoffs/SESSION-KICKOFF-2026-05-19.md  (THIS FILE)
  2. docs/handoffs/HANDOVER-2026-05-18-hardening.md
  3. docs/handoffs/HANDOVER-2026-05-17-ultimate-plan-cap.md
  4. docs/forensic/twitter-cancellation-2026-05-17.md
  5. CLAUDE.md + CLAUDE.local.md

THEN run these read-only checks in one parallel block:

  git fetch origin && git log --oneline origin/main -15
  gh pr list --state open --limit 30 --json number,title,labels
  curl -sI -H 'User-Agent: Mozilla/5.0 (compatible; TrendingRepoPostDeploySmoke/1.0; +https://trendingrepo.com)' https://trendingrepo.com/
  npm run typecheck

THEN dispatch the Wave-1 agents (see §6 of the kickoff doc). Do NOT
implement anything until Wave-1 reports back. The agents already have
their prompts pre-written in this file — copy them verbatim.

OPERATING RULES:
  - Autopilot is per-session. The 2026-05-17 / 18 "YOUR the bosss"
    greenlight does NOT carry. Get an explicit "ship" / "go" / "do it"
    before pushing destructive work.
  - NEVER `git add .` / `-A` — explicit file paths only.
  - NEVER skip git hooks (--no-verify) without operator approval.
  - NEVER claim auth is broken without verifying via test sign-up.
  - The pre-push hook (#1744) requires `npm run hooks:install` on first
    checkout — run it before your first push.

VERIFICATION GATE before every merge:
  npm run typecheck && npm run lint:guards && npm run test:hooks
```

## 2. Verified state of the world (snapshot 2026-05-18 03:18 UTC)

| Surface | Status |
|---|---|
| Main HEAD | `7d95bf5ba` (handover doc) + bot data PRs advancing continuously |
| Smoke (canonical 30 routes) | **30/30 → 200** |
| Open PRs (mine) | 0 |
| Open PRs (bot data refresh) | ~12 stuck PRs from BEFORE #1743 landed; need flush — see §5.D |
| S1 (FIXING) | ✅ done |
| S2 (Onboarding Phase 1) | ✅ done |
| S3 (Onboarding Phase 2) | ✅ done |
| S3.5 (Compliance) | ✅ done |
| Hardening pass | ✅ done (10 audit findings closed in #1742) |
| Twitter root-cause | ✅ fix landed in #1743 — needs operator-verified end-to-end run |
| Clerk prod | ❌ `pk_test_*` only — sign-in shows "Auth unavailable" |
| Apify policy | ✅ zero live `APIFY_*` env declarations after #1745 |
| Pre-push policy gate | ✅ shipped in #1744; run `npm run hooks:install` once |

## 3. The remaining stack (5 implementation tracks + 6 operator items)

### Code tracks (parallelisable, ~6h total)

| # | Track | Effort | Skill | Owner role |
|---|---|---|---|---|
| **S4.A** | Verify Twitter root-cause fix end-to-end | 30 min | `diagnose` | CTO + Operator |
| **S4.B** | 30-day hard-delete cron for soft-deleted profiles | 1.5 h | `agent-skills:incremental-implementation` | Backend engineer |
| **S4.C** | Lighthouse runner wiring (script + workflow) | 2 h | `agent-skills:ci-cd-and-automation` | DevOps |
| **S4.D** | Stale bot data-PR sweep | 30 min | manual + `gh` CLI | Operator-runnable script |
| **S4.E** | Unit tests for `csrf.ts` + `avatar-url.ts` + new rate-limit subject path | 1.5 h | `agent-skills:test-driven-development` | Test engineer |

### Operator-only items (cannot fix in code)

| # | Item | Blocks |
|---|---|---|
| 1 | Provision Clerk `pk_live_*` + `sk_live_*` in Vercel production env | All sign-in/sign-up; whole onboarding stays dark |
| 2 | DNS/SPF/DKIM/DMARC for Resend (`alerts.starscreener.dev`) | Digest banner + day-N emails |
| 3 | `PAGESPEED_API_KEY` in GH Actions + Vercel env | Activating S4.C once code lands |
| 4 | Manual `gh workflow run collect-twitter.yml --field limit=5` to confirm #1743 fix | Twitter freshness recovery |
| 5 | AWS STS key `ASIA…3FUC` rotation | Standing defense-in-depth item |
| 6 | R2 backup secrets (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) | `backup-redis-snapshot.yml` |

## 4. Pickup order recommendation

Run S4.A first because it's a verification (no code change) — it tells us whether the next cron tick will produce healthy data PRs. Then S4.B/C/E in parallel (independent code tracks). S4.D last (data-PR sweep is operator-runnable; only meaningful after S4.A confirms #1743 actually fixed things).

## 5. Track details

### S4.A — Verify Twitter root-cause fix end-to-end

**Goal:** prove that `collect-twitter.yml` now completes in <5 min instead of timing out at 90 min.

**Steps:**

```bash
# Manual dispatch (operator runs this — needs gh auth scope)
gh workflow run collect-twitter.yml --ref main --field limit=5 --field mode=direct --field dry_run=false

# Watch the latest run
RUN_ID=$(gh run list --workflow=collect-twitter.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch $RUN_ID
```

**Pass criteria:**
- Run completes (any conclusion other than `cancelled`)
- Total wall time < 5 minutes
- Resulting PR has BOTH `automation` and `auto-merge` labels
- `auto-merge-bot.yml` shows a triggered run that enabled auto-merge

**Fail-back:** if it still cancels, re-read `docs/forensic/twitter-cancellation-2026-05-17.md` Option B2 (hard-timeout the collector step). Open a follow-up PR adding `timeout 280 npm run collect:twitter` wrapper.

### S4.B — 30-day hard-delete cron for soft-deleted profiles

**Why:** PR #1742 made `/api/account/delete` PII-scrub the row but keep the FK target alive for the 30-day grace window. The cron that actually deletes after 30 days was never shipped.

**Files to create:**

- `.github/workflows/cron-account-purge.yml` — runs daily, dispatches to a new API route
- `src/app/api/cron/account-purge/route.ts` — POST handler that:
  - Verifies `CRON_SECRET` bearer
  - `DELETE FROM profiles WHERE deleted_at < now() - interval '30 days'`
  - FK cascade fires correctly on hard DELETE (already configured in `src/lib/db/schema/profiles.ts:56` + child schemas)
  - Returns `{ ok: true, purged: <count> }`

**Pattern reference:** look at `src/app/api/cron/digest/weekly/route.ts` for the cron-auth + Drizzle pattern.

**Risk:** destructive. Add a unit test that uses an in-memory Drizzle fixture to verify only rows past the 30-day window get deleted, and that FK cascade fires for alertRules / referrals / watchlists.

### S4.C — Lighthouse runner wiring

**Why:** `package.json:62` already has `lighthouse:routes:prod` referenced but the script doesn't actually exist on disk in a runnable shape. Yesterday's S3 design called this out as "wired but awaiting key".

**Files to create / verify:**

- `scripts/lighthouse-routes.mjs` — if missing OR incomplete, build it to call Google PageSpeed Insights API for each route in `perf/routes.json`
- `.github/workflows/lighthouse-pr.yml` — runs on PR open / push, uploads JSON results as artifact, comments thresholds on the PR
- Threshold gates: LCP < 2.5s, CLS < 0.1, INP < 200ms — fail the check if any regress

**Operator dep:** `PAGESPEED_API_KEY` secret. Workflow should self-skip with a `::notice::` when missing, not fail.

### S4.D — Stale bot data-PR sweep

**Context:** 12 bot data refresh PRs (#1627, #1639, #1657, #1670, #1704, #1714, #1717, #1723, #1726, #1730, #1732, #1738) were opened BEFORE #1743 landed. They have only the `automation` label, not `auto-merge` — so the auto-merge-bot.yml workflow skips them.

**Two options:**

1. **Flush — label them all** (the data is stale but at least merges):
   ```bash
   for pr in 1627 1639 1657 1670 1704 1714 1717 1723 1726 1730 1732 1738; do
     gh pr edit $pr --add-label auto-merge
   done
   ```
2. **Close — let the next cron tick produce fresh PRs**:
   ```bash
   for pr in 1627 1639 1657 1670 1704 1714 1717 1723 1726 1730 1732 1738; do
     gh pr close $pr --comment "Superseded by post-#1743 cron runs (auto-merge label now applied automatically)."
   done
   ```

The 2nd option is cleaner — the data in these PRs is already stale (~1 day old) and the next cron tick will produce a healthy PR within hours.

### S4.E — Unit tests for new security helpers

**Why:** `csrf.ts` and `avatar-url.ts` shipped in #1742 without dedicated unit coverage. They're load-bearing for the SSRF + CSRF defence; a regression would be silent.

**Files to create:**

- `src/lib/api/__tests__/csrf.test.ts` — covers:
  - `Sec-Fetch-Site: same-origin` → null (pass)
  - `Sec-Fetch-Site: cross-site` → 403 response
  - Missing `Sec-Fetch-Site` + valid Origin in allowlist → null
  - Missing `Sec-Fetch-Site` + Origin pointing at attacker domain → 403
  - Missing Origin entirely → 403
- `src/lib/api/__tests__/avatar-url.test.ts` — covers:
  - Each allowlisted host → true
  - `http://` (not https) → false
  - IP literal (`https://169.254.169.254/...`) → false
  - Userinfo (`https://user:pass@img.clerk.com/...`) → false
  - Unknown host (`https://evil.example.com/...`) → false
- `src/lib/api/__tests__/rate-limit-subject.test.ts` — covers the new `subject` keying path

**Pattern reference:** `src/lib/__vitest__/analytics-funnel.test.ts` for vitest setup, `src/lib/pipeline/__tests__/rate-limit-routes.test.ts` for rate-limit testing patterns.

## 6. Wave-1 parallel agent dispatch (copy verbatim into the kickoff session)

Fire all four of these in **a single message** with parallel tool calls. They run independently and report back before you write any code.

```
Agent({
  description: "Audit mutating endpoints for CSRF coverage",
  subagent_type: "Explore",
  prompt: `Scan src/app/api/**/route.ts in trendingrepo at
C:\\dev\\trendingrepo for every export of PATCH / POST / DELETE / PUT.
Cross-reference against src/lib/api/csrf.ts to determine which
handlers DO and DO NOT call assertSameOriginRequest(req).

For each route that mutates state but does NOT call the CSRF gate,
report:
  - File path
  - Method exported
  - Whether it uses Clerk requireUser() (i.e. is cookie-authed) or a
    bearer token (CRON_SECRET, webhook signature, internal token)
  - Whether it's reachable from the public internet (not /api/cron/*
    behind CRON_SECRET, not /api/webhooks/* with HMAC)
  - Risk level (HIGH if cookie-authed + state-changing + public,
    MEDIUM if cookie-authed + read-only, LOW if non-cookie auth)

Skip /api/cron/* and /api/webhooks/* — those are intentionally
bearer-token gated.

Cap at 500 words. End with a one-line recommendation: do we need a
follow-up sweep PR to wire CSRF into more endpoints?`,
})

Agent({
  description: "Verify Twitter fix landed clean post-#1743",
  subagent_type: "Explore",
  prompt: `Confirm the Twitter root-cause fix from PR #1743 is in
effect in trendingrepo at C:\\dev\\trendingrepo. Read:

  - .github/actions/git-commit-data/action.yml (current state on
    main)
  - .github/workflows/auto-merge-bot.yml
  - docs/forensic/twitter-cancellation-2026-05-17.md

Verify:
  1. The action no longer calls 'gh pr merge --auto' inline
  2. pr-label default is 'automation,auto-merge'
  3. auto-merge-bot.yml listens for pull_request_target.labeled with
     auto-merge label

Then run 'gh run list --workflow=collect-twitter.yml --limit 5
--json conclusion,createdAt,databaseId' and report the conclusions
of the most recent 5 runs. If any are still 'cancelled', flag for
operator dispatch (S4.A).

Cap at 300 words. End with PASS/PARTIAL/FAIL on the fix landing.`,
})

Agent({
  description: "Plan S4.B hard-delete cron",
  subagent_type: "Plan",
  prompt: `Design the 30-day hard-delete cron for soft-deleted
profiles in trendingrepo at C:\\dev\\trendingrepo.

Context:
  - PR #1742 made /api/account/delete soft-delete + PII-scrub
  - The 30-day grace window is in the route comment but no cron
    actually purges
  - FK cascades on alertRules, referrals, watchlists are configured
    in src/lib/db/schema/* — they fire on hard DELETE, not UPDATE

Read these files first:
  - src/app/api/account/delete/route.ts (the route that creates the
    soft-deleted rows)
  - src/lib/db/schema/profiles.ts (deleted_at column + FK config)
  - src/app/api/cron/digest/weekly/route.ts (reference cron pattern
    with CRON_SECRET auth)
  - .github/workflows/cron-*.yml (any existing cron workflow as a
    template)

Design and report:
  1. The exact files to create:
     - .github/workflows/cron-account-purge.yml
     - src/app/api/cron/account-purge/route.ts
  2. The Drizzle delete query (write the actual code, not pseudocode)
  3. The cron schedule (recommended: daily at a non-peak time)
  4. The required tests (in-memory fixture + cascade verification)
  5. A safety knob: a dry-run mode so the operator can validate the
     query before letting it actually delete

Cap at 600 words. The output should be ready to hand to a coder
agent that types the implementation in one shot.`,
})

Agent({
  description: "Verify Lighthouse runner readiness",
  subagent_type: "Explore",
  prompt: `Check the current state of Lighthouse infrastructure in
trendingrepo at C:\\dev\\trendingrepo. Yesterday's S3 handover said
'wired, awaiting key' — verify whether that was accurate.

Look at:
  - package.json scripts that reference 'lighthouse'
  - scripts/lighthouse-routes.mjs (does it exist? is it complete?)
  - .github/workflows/ for any lighthouse / pagespeed / perf workflow
  - perf/routes.json (route list to audit)
  - .env.example for PAGESPEED_API_KEY documentation

Report:
  1. What exists today (with line numbers / file paths)
  2. What's MISSING for an end-to-end PSI run
  3. Whether scripts/lighthouse-routes.mjs is a stub or a real
     implementation — if stub, list what fields the PSI API returns
     that should be persisted
  4. One-line recommendation: is S4.C a 30-min wire-up or a 2h
     implementation?

Cap at 400 words.`,
})
```

After all four return, synthesise and present the operator with a Wave-2 implementation plan. Do NOT start typing code yet.

## 7. Wave-2 parallel implementation (after Wave-1 reports)

Fire these in a single message after Wave-1 returns. Adjust based on what Wave-1 surfaces:

```
Agent({
  description: "Implement S4.B hard-delete cron",
  subagent_type: "coder",
  isolation: "worktree",
  prompt: "<paste the Plan agent's output from Wave-1 here, plus:
'Implement exactly per the spec. Run npm run typecheck +
npm run lint:guards before declaring done. Push to a branch named
feat/account-purge-cron and open a PR with the spec inlined as the
PR body.'>",
})

Agent({
  description: "Implement S4.E security-helper tests",
  subagent_type: "agent-skills:test-engineer",
  isolation: "worktree",
  prompt: "Write vitest coverage for src/lib/api/csrf.ts and
src/lib/api/avatar-url.ts in trendingrepo at C:\\dev\\trendingrepo.

Test cases (all must land):
[full S4.E test list from §5.E of docs/handoffs/SESSION-KICKOFF-2026-05-19.md]

Run via: npx vitest run src/lib/api/__tests__/

Push to a branch named test/security-helpers and open a PR. The PR
body should list every test case that landed.",
})

Agent({
  description: "Wire S4.C Lighthouse runner",
  subagent_type: "coder",
  isolation: "worktree",
  prompt: "<adjust based on what Wave-1 'Verify Lighthouse runner
readiness' agent reported. If real impl needed, include the route
list + threshold gates from §5.C. If just wire-up, include the
workflow YAML pattern from .github/workflows/post-deploy-smoke.yml
as a template.>",
})
```

## 8. Wave-3 review (after Wave-2 PRs are open)

Fire these only after the Wave-2 PRs have CI results back:

```
Agent({
  description: "Five-axis code review of all Wave-2 PRs",
  subagent_type: "agent-skills:code-reviewer",
  prompt: "Review PRs #<S4.B-number>, #<S4.E-number>, #<S4.C-number>
in trendingrepo. Focus on:
  - Correctness (especially the destructive cron DELETE query)
  - Security (the helpers being tested protect SSRF/CSRF — verify
    the tests would actually catch a real regression)
  - Test coverage gaps
Report tier-1 blockers separately from tier-2 nits.",
})
```

## 9. Skills + role legend (so the next session knows what to dispatch when)

| Skill | When to use |
|---|---|
| `diagnose` | For root-cause investigations like the Twitter forensic doc. Reproduce → minimise → hypothesise. |
| `agent-skills:security-and-hardening` | Pre-merge security review on any endpoint that touches user data or external resources. |
| `agent-skills:test-driven-development` | Write the test first, then make it pass. Use for the security helpers (S4.E). |
| `agent-skills:incremental-implementation` | For multi-file work like S4.B. Land it in small verifiable steps. |
| `agent-skills:ci-cd-and-automation` | For S4.C Lighthouse wiring. |
| `agent-skills:code-reviewer` | Pre-merge review on any non-trivial PR. Five axes. |
| `agent-skills:debugging-and-error-recovery` | When something fails in production and the cause is unclear. |
| `claude-mem:mem-search` | When the operator asks "did we already solve this?" — search prior session memory. |

## 10. Anti-patterns (reaffirmed)

| ❌ Don't | ✅ Do |
|---|---|
| `git add .` / `git add -A` | Explicit file paths only |
| Skip git hooks (`--no-verify`) | Fix the underlying issue |
| Push to main directly | Branch + PR + auto-merge label |
| `git reset --hard` to "fix" a rebase | `git rebase --onto` for surgical replacement |
| Mock Redis/DB in scoring tests | In-memory Drizzle fixture for cascade verification |
| Inline hardcoded freshness chrome | Wire to `FreshnessBadge` + `classifyFreshness` |
| Use Apify | Free providers only — policy is permanent |
| Claim auth is broken without testing | Trigger a real signup flow first |
| Re-introduce `gh pr merge --auto` inline | The auto-merge-bot.yml handles it async via label |
| Reach for Husky | The committed `.githooks/pre-push` is sufficient |

## 11. Verification gate (every PR before merge)

```bash
npm run typecheck && npm run lint:guards && npm run test:hooks
# Plus for new endpoints:
npx tsx --test --require ./tests/setup-server-only-stub.cjs \
  src/lib/pipeline/__tests__/rate-limit-routes.test.ts
# Plus a spot smoke of the changed route on prod after merge
```

## 12. Where the prior sessions' work lives (for reference)

| Surface | Location |
|---|---|
| Onboarding components | `src/components/onboarding/` (WelcomeModal*, DigestBanner) |
| You-page widgets | `src/components/you/OnboardingProgressWidget.tsx`, `src/lib/onboarding/progress.ts` |
| Account settings | `src/app/you/settings/{page,SettingsClient}.tsx` |
| Account delete API | `src/app/api/account/delete/route.ts` |
| Profile editing API | `src/app/api/me/profile/route.ts` (PATCH extended for displayName/avatarUrl) |
| Pricing walkthrough | `src/components/pricing/{CheckoutWalkthrough,PricingCtaButton}.tsx` |
| Cookie consent | `src/components/consent/ConsentBanner.tsx`, `src/lib/consent/cookie.ts` |
| Email-test script | `scripts/email-test.mjs` |
| Twitter forensic doc | `docs/forensic/twitter-cancellation-2026-05-17.md` |
| Security helpers | `src/lib/api/{csrf,avatar-url,rate-limit}.ts` |
| Pre-push hook | `.githooks/pre-push`, `scripts/install-githooks.mjs` |
| Shared git-commit-data action | `.github/actions/git-commit-data/action.yml` (now async auto-merge) |
| Auto-merge bot | `.github/workflows/auto-merge-bot.yml` |

## 13. Final reminder

The next session's job is **not** to invent new work. It's to land Stage 4 cleanly and prepare for the Clerk-pk-live-keys moment when the operator flips that switch. Every track above is already scoped, validated, and ready to dispatch.

When in doubt: dispatch a Wave-1 agent for clarification before typing code. Parallel exploration is free; serial implementation without exploration is expensive.
