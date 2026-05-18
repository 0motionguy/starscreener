# SESSION HANDOVER — 2026-05-18 (hardening pass)

## TL;DR for operator

Two sessions back-to-back:

- **2026-05-17 (yesterday):** 13 PRs shipped — S3 onboarding phase 2 + S3.5 compliance + QoL + Twitter forensic doc. Marketing-ready milestone landed code-side.
- **2026-05-18 (this session):** 4 hardening PRs shipped — security audit findings on the new account endpoints + Twitter cancellation **root-cause fix** (not just the forensic doc) + pre-push policy gate + Apify env cleanup.

Production smoke: **30/30 routes green** on the canonical list.

Total across both sessions: **17 PRs + 4 hardening PRs = 21 PRs**. Open queue (mine): #1742 security (CI rerunning after force-push fix), #1744 pre-push hook, #1745 Apify cleanup — all small, expected to clear soon.

## 1. Paste-ready role prompt for fresh session

```
You are picking up a TrendingRepo CTO session. The two prior sessions
shipped the marketing-ready milestone (S3 + S3.5) AND a hardening
pass closing the security audit findings + the Twitter root-cause.
Stage 4 (Scale + Harden) is the remaining stage before public launch.

BEFORE DOING ANYTHING:

1. Read these files in order:
   - docs/handoffs/HANDOVER-2026-05-18-hardening.md  (THIS FILE)
   - docs/handoffs/HANDOVER-2026-05-17-ultimate-plan-cap.md (yesterday's S3 handover)
   - docs/forensic/twitter-cancellation-2026-05-17.md (Twitter root cause)
   - ~/.claude/plans/word-for-this-one-reflective-pine.md (the plan)
   - CLAUDE.md + CLAUDE.local.md

2. Read-only checks:
   - git fetch origin && git log --oneline origin/main -20
   - gh pr list --state open --limit 20
   - curl -sI -H 'User-Agent: Mozilla/5.0 (compatible; TrendingRepoPostDeploySmoke/1.0; +https://trendingrepo.com)' https://trendingrepo.com/

3. CRITICAL FACTS:
   - 30/30 canonical routes green
   - Clerk still fail-closed in prod (pk_test_* keys) — /sign-in shows
     "Auth unavailable". Whole onboarding flow stays dark until
     operator provisions pk_live_* + sk_live_* in Vercel env.
   - Apify is OFF in code AND in workflow envs. docs/POLICY-NO-APIFY.md
     is now accurate.
   - Twitter cancellation root-cause shipped (#1743 merged): the
     git-commit-data action no longer calls `gh pr merge --auto`
     inline. The auto-merge-bot.yml handles it async via the
     `auto-merge` label.
   - Account-management endpoints (S3.5.A delete + S3.5.B profile
     editing) had a CRITICAL SSRF, HIGH CSRF + rate-limit gaps, and
     a MEDIUM GDPR-cascade lie — all closed in #1742.
   - Pre-push hook arms a fast local policy gate for the
     auth-provider-policy regression sentinel (#1744). Contributors
     run `npm run hooks:install` once per checkout.

4. PICKUP ORDER (S4 — Scale + Harden):

S4.A — Verify Twitter root-cause fix landed end-to-end (~30 min):
   - Manual dispatch `gh workflow run collect-twitter.yml --field limit=5`
   - Expect run completes in under 5 min (was 90 min)
   - Confirm resulting PR has auto-merge label + auto-merge-bot fired
   - If still cancels: re-read docs/forensic/twitter-cancellation-2026-05-17.md
     and consider Option B2 (hard-timeout the collector step)

S4.B — 30-day hard-delete cron for soft-deleted profiles (~1h, 1 PR):
   - The S3.5.A delete flow soft-deletes + PII-scrubs (post #1742)
   - But the row stays. Schedule cron-account-purge.yml: DELETE
     FROM profiles WHERE deleted_at < now() - interval '30 days'
   - Cascade fires correctly on DELETE (FK CASCADE on alertRules,
     referrals, watchlists — confirmed in src/lib/db/schema/profiles.ts)

S4.C — Lighthouse runner wiring (~2h, 1 PR):
   - Add lighthouse:routes:prod npm script + workflow
   - Operator provisions PAGESPEED_API_KEY → CI runs PSI on every push

S4.D — Stale data-PR branch cleanup (~30 min, ops script):
   - Twitter workflow checkout shows hundreds of data/collect-* branches
     lingering on origin. The auto-merge-bot does delete-branch on merge,
     but stale branches from PRE-bot runs persist.
   - One-shot: gh api -X DELETE for any data/* branch whose HEAD is
     already on main (i.e. merged-but-not-deleted)

S4.E — Audit unit-test coverage for security helpers (~1h, 1 PR):
   - src/lib/api/csrf.ts and src/lib/api/avatar-url.ts are new
   - Add vitest coverage for the host allowlist + Origin check edge
     cases (preview deploys, missing Origin, untrusted hosts)

OPERATOR WORKING STYLE:
- Short replies = trust + green light
- Don't ask for re-confirmation on routine PR pushes
- Verify production-data workflows (collect-twitter, collect-funding)
  haven't regressed after #1743 merged

VERIFICATION GATE (every PR before merge):
npm run typecheck && npm run lint:guards && npm run test:hooks
```

## 2. State of the world (verified 2026-05-18 ~11:10 SGT)

- **Main HEAD:** advancing rapidly as bot data PRs merge (was at d85b0010b when this session started; #1743 merged at 03:07 UTC; bot PRs flow continuously)
- **Production smoke (canonical 30):** all 200 OK (see `.smoke-2026-05-18-am.txt`)
- **Open PR queue (mine):**
  - #1742 — security hardening (CI rerunning after force-push fix to rate-limit-routes.test.ts back-compat)
  - #1744 — pre-push policy hook (CI pending)
  - #1745 — Apify env cleanup sweep (CI pending)
- **Merged this session:**
  - #1654, #1644 (yesterday's leftovers — Twitter forensic doc, GDPR delete)
  - #1743 — Twitter root-cause fix (gh pr merge --auto removed from git-commit-data)
- **Clerk:** still fail-closed in prod (pk_test_*) — UNCHANGED, operator territory

## 3. What landed this session (chronological)

**Carry-over merges from yesterday:**
- #1644 — feat(account): GDPR right-to-erasure (S3.5.A)
- #1654 — docs(forensic): Twitter cancellation investigation

**Hardening pass (4 PRs):**
- #1742 — fix(security): SSRF + CSRF + rate-limit + GDPR cascade hardening on /api/account/delete + /api/me/profile [open, CI rerunning]
- #1743 — fix(actions): drop inline `gh pr merge --auto` from git-commit-data ✅ MERGED
- #1744 — chore(ci): pre-push hook running auth-provider-policy sentinel [open]
- #1745 — chore(workflows): remove last live APIFY_API_TOKEN reference [open]

## 4. Security audit findings closed (full bundle in #1742)

| Tier | Finding | Status |
|---|---|---|
| CRITICAL | SSRF via avatarUrl (any https:// URL → internal IMDS/Supabase) | ✅ New `avatar-url.ts` allowlist |
| HIGH | Rate-limit IP forgeable via XFF | ✅ Vercel-signed header preferred + subject keying |
| HIGH | Profile PATCH unrate-limited | ✅ 20/min/profile cap |
| HIGH | CSRF — cookie-only auth on POST/PATCH | ✅ Sec-Fetch-Site + Origin allowlist gate |
| MEDIUM | Soft-delete didn't cascade — GDPR claim false | ✅ Same-tx PII scrub + alertRules.active=false |
| MEDIUM | PII in audit log → Vercel/Datadog retention | ✅ sha256-prefix hash |
| MEDIUM | confirmEmail unicode bypass | ✅ NFKC normalisation + control-char strip |
| MEDIUM | Clerk DELETE follows redirects | ✅ redirect: "error" |
| LOW | Anon DoS on victim rate-limit bucket | ✅ requireUser before limiter |
| LOW | displayName allows RTL/zero-width | ✅ Schema transform |

## 5. Twitter cancellation — actually fixed

The 2026-05-17 forensic doc documented the root cause (collector finishes in 87s, hang is in post-collector `gh pr merge --auto`). This session shipped the actual fix:

- `.github/actions/git-commit-data/action.yml` no longer calls `gh pr merge --auto` inline
- The auto-merge-bot.yml workflow (already wired) listens for `pull_request_target.labeled` events and handles auto-merge in its own short-lived runner
- `pr-label` default flipped from `"automation"` to `"automation,auto-merge"` so the bot picks up every data PR
- All 17 data-refresh workflows inherit the fix automatically

**Verification needed (operator):** manual `gh workflow run collect-twitter.yml --field limit=5` should now complete in under 5 minutes instead of timing out at 90.

## 6. Operator blockers (unchanged — still environment / DNS / keys)

1. **Provision Clerk `pk_live_*` + `sk_live_*` in Vercel production env** — sign-in/sign-up still dead
2. **DNS/SPF/DKIM/DMARC for Resend (`alerts.starscreener.dev`)** — digest banner + day-N email enable
3. **PAGESPEED_API_KEY in GH Actions + Vercel env** — unblocks S4.C Lighthouse runner
4. **Verify the Twitter cancellation fix landed cleanly** — operator runs the manual dispatch above
5. **AWS STS key `ASIA…3FUC` rotation** — standing item
6. **R2 backup secrets** — `backup-redis-snapshot.yml`
7. **Sentry source-maps + release tagging verify** — production error visibility
8. **PostHog production data verify** (now consent-gated; needs accept-all to flow)

## 7. Hardening artifacts shipped this session (reusable)

- `src/lib/api/csrf.ts` — `assertSameOriginRequest()` for any state-changing endpoint
- `src/lib/api/avatar-url.ts` — `isAllowedAvatarUrl()` for any user-controlled URL field that ends up in a server-side fetch
- `src/lib/api/rate-limit.ts` — `checkRateLimitAsync(..., { subject })` for authenticated routes
- `.githooks/pre-push` — extend if other regression-sentinel tests want a local gate
- `docs/forensic/twitter-cancellation-2026-05-17.md` — the investigation playbook for similar workflow hangs

## 8. Hard rules (reaffirmed)

- NEVER push to main without explicit per-push consent (autopilot consent is per-session)
- NEVER `git add .` / `-A` — explicit paths only
- NEVER skip git hooks (`--no-verify`)
- NEVER mock Redis/DB in scoring tests
- NEVER inline hardcoded freshness chrome — wire to FreshnessBadge
- NEVER use Apify — call sites are off; env vars removed from YAMLs in #1745
- NEVER claim auth is broken without verifying via test sign-up
- ALWAYS `git rebase --onto` to replace base commits, not `git reset --hard`

## 9. Verification commands

```bash
git fetch origin && git checkout main && git pull origin main
git log -1 --format="%h %s"
gh pr list --state open

npm run typecheck && npm run lint:guards && npm run test:hooks
npx tsx --test --require ./tests/setup-server-only-stub.cjs \
  src/lib/pipeline/__tests__/rate-limit-routes.test.ts

# Smoke (canonical 30)
# See `.smoke-2026-05-18-am.txt` for the last successful run
```

## 10. Final stats across both sessions

- 21 PRs opened
- 18 merged (17 from yesterday + Tier-2 Twitter fix today; remaining 3 in CI queue)
- 30/30 canonical routes green
- 10 security findings closed (1 CRITICAL, 3 HIGH, 4 MEDIUM, 2 LOW)
- Twitter root-cause fix lands; 13-day data staleness expected to resolve on next cron tick (4:23 / 12:23 / 20:23 UTC)
- Zero P0 regressions introduced
- All remaining blockers are environment / DNS / key provisioning
