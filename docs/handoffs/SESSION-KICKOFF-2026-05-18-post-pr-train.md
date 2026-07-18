# SESSION KICKOFF - 2026-05-18 post-PR train

This handover is for the next TrendingRepo CTO/Codex session. It captures the
current verified repository state after the 2026-05-18 PR train and gives a
paste-ready prompt plus parallel-agent dispatch plan.

## 0. Current verified state

- Repo: `C:\dev\trendingrepo`
- Remote: `0motionguy/starscreener`
- Verified remote `main`: `15f8d439f9f9382c5fa3382ba5583c4797a60598`
- Open PR queue at handoff time: none
- Last merged PR: #1793 `docs(runbooks): one-page Stage 5 activation checklist`
- Stage 5 activation checklist: `docs/runbooks/STAGE5-BRINGUP-CHECKLIST.md`

Merged in the completed train:

| PR | Merge commit | Result |
|---|---:|---|
| #1753 | `208fc9e` | Funding news data refresh merged after JSON count validation |
| #1779 | `aa8c2a1` | Responsive loading skeleton hardening |
| #1785 | `1fdfa99` | Revenue funnel capture/docs follow-up for #1781 |
| #1789 | `57c9fd8` | Welcome email unsubscribe hardening follow-up for #1786 |
| #1791 | `203d04b` | `notify()` + healthcheck wiring across crons/GitHub/Clerk |
| #1793 | `15f8d43` | Stage 5 bringup checklist, with committed key values removed |

Externally merged during the train and now included in `main`:

- #1787 `775c5b1` - day-3 nudge + day-7 retention crons
- #1788 `c30c738` - revenue-loop smoke + forensic doc
- #1792 `9312626` - reddit baseline data refresh

## 1. Paste-ready role prompt

Copy this block into the next fresh session.

```text
You are the TrendingRepo CTO execution session, picking up after the
2026-05-18 PR train.

FIRST READ:
1. docs/handoffs/SESSION-KICKOFF-2026-05-18-post-pr-train.md
2. docs/runbooks/STAGE5-BRINGUP-CHECKLIST.md
3. docs/forensic/revenue-loop-2026-05-19.md
4. docs/POSTHOG-FUNNELS.md
5. CLAUDE.md and CLAUDE.local.md if present

START WITH READ-ONLY VERIFICATION:
git fetch origin main
git log --oneline origin/main -12
gh pr list --state open --limit 30 --json number,title,headRefName,isDraft,mergeStateStatus
git status --short --branch

CURRENT EXPECTATION:
- origin/main is 15f8d439f9f9382c5fa3382ba5583c4797a60598 or newer.
- Open PR list is empty unless a bot/user opened new work after this handoff.
- Stage 5 operator checklist is committed at docs/runbooks/STAGE5-BRINGUP-CHECKLIST.md.

OPERATING RULES:
- Do not commit, print, or echo real secrets from KERMIT.txt or dashboards.
- Exact-path staging only. Never use git add . or git add -A.
- If the root checkout is dirty or externally changing, create a clean C:\tmp worktree and work there.
- Before every push or merge, run the relevant local gates and then wait for GitHub checks.
- Use SHA-guarded merges through GitHub API when local main is checked out in another worktree.

NEXT OBJECTIVE:
Stage 5 activation readiness. Verify docs and runtime gates first, then either
execute operator-safe checks or produce a precise operator action list for
secrets/DNS/dashboard-only tasks.
```

## 2. Parallel-agent dispatch plan

Use multiple agents only for bounded, independent work. Keep the main session as
the integrator and do not duplicate agent work locally unless a result is
ambiguous.

| Lane | Role | Effort | Skills | Output |
|---|---|---:|---|---|
| A | Ops/runbook reviewer | medium | `systematic-debugging`, `deploy-check`, `gh-fix-ci` | Validate Stage 5 checklist against current files/workflows; list stale or dangerous operator steps |
| B | Security/privacy reviewer | high | `cc-skill-security-review`, `differential-review` | Check recent email, Slack, webhook, and docs changes for secret/PII leakage or unsafe logs |
| C | CI/data automation reviewer | medium | `lint-and-validate`, GitHub plugin | Inspect open PR queue, recent workflow runs, and data-only preview skip behavior |
| D | Revenue-loop verifier | high | `systematic-debugging`, `stripe-best-practices` | Verify checkout/portal/webhook/auth gates from code and docs without using real secrets |
| E | Product/browser smoke reviewer | medium | `impeccable`, `browser-use` or `webapp-testing` | Only if UI changed: check visible loading/pricing/auth surfaces in browser |

Suggested spawn prompts:

```text
Agent A - Ops/runbook reviewer:
Review docs/runbooks/STAGE5-BRINGUP-CHECKLIST.md against the current repo.
Do not edit. Check referenced scripts, workflows, routes, and docs exist.
Report stale commands, missing files, dangerous secret handling, or steps that
should be operator-only. Return file/line findings and a pass/block verdict.
```

```text
Agent B - Security/privacy reviewer:
Review the recent main range around #1789, #1791, and #1793 for secret or PII
exposure. Focus on email unsubscribe, Clerk webhook signup notifications,
notify()/Slack delivery, GitHub alert Sentry fallback, and committed runbooks.
Do not edit. Return P0/P1/P2 findings with file/line anchors.
```

```text
Agent C - CI/data automation reviewer:
Inspect GitHub PR/check state and repo workflows. Confirm no open blocked PRs,
that data-only previews are still skipped where intended, and that recent main
checks are green. Do not edit. Return current commands used, results, and any
blocked status.
```

```text
Agent D - Revenue-loop verifier:
Read scripts/verify-revenue-loop.mjs, docs/forensic/revenue-loop-2026-05-19.md,
docs/POSTHOG-FUNNELS.md, and related checkout/billing/webhook routes. Do not
use real secrets. Determine what can be verified from code/local unauth probes
and what remains dashboard/operator-only. Return a checklist with pass/block.
```

## 3. What changed in the last train

### Loading skeletons (#1779)

- Patched 17 `loading.tsx` files so skeleton bars/buttons use `w-full max-w-*`
  instead of fixed widths that overflow compact/mobile panels.
- Local gates passed: typecheck, guard lint, ESLint, audit, `git diff --check`.

### Revenue funnel follow-up (#1785)

- Documented `alert-activation` and `revenue-loop` in `docs/POSTHOG-FUNNELS.md`.
- Moved `checkout_started` capture until after Stripe returns a checkout URL.
- Removed generic `funnel_step` exposure of payment session id.

### Email unsubscribe hardening (#1789)

- Added `src/app/api/email/unsubscribe/route.ts`.
- Added shared unsubscribe HMAC helper in `src/lib/email/unsubscribe.ts`.
- Updated welcome/referral email templates to include account-level unsubscribe URLs.
- Added tests for unsubscribe token behavior.

### notify/healthcheck wiring (#1791)

- Wrapped 15 cron routes with healthcheck/notify patterns.
- Wired GitHub alerting through `notify()` with idempotency keys.
- Preserved Sentry visibility when Slack webhook config/delivery fails.
- Avoided Sentry noise for expected notify suppressions like dedupe.
- Removed raw signup email from Clerk Slack notification.
- Added/updated tests for `github-telemetry`, `notify`, and `healthcheck`.

### Stage 5 checklist (#1793)

- Added one-page operator activation checklist.
- Fixed the initial docs PR before merge because Gitleaks caught a committed
  Google API key value. The final merged doc references KERMIT line numbers
  without embedding the secret values.

## 4. Verification history from the completed work

For #1791 local pre-push verification:

```bash
.\node_modules\.bin\tsx.cmd --test --require ./tests/setup-server-only-stub.cjs src/lib/__tests__/github-telemetry.test.ts src/lib/__tests__/notify.test.ts src/lib/__tests__/healthcheck.test.ts
npm run typecheck
npm run lint:guards
npm run lint
npm audit --audit-level=high
git diff --check
```

Results:

- Targeted node tests: 19 passed, 0 failed
- Typecheck: passed
- Guard lint: passed
- ESLint: passed with existing 47 warnings, 0 errors
- Audit: 0 high vulnerabilities
- GitHub CI for #1791: all checks green before merge
- GitHub CI for #1793: all checks green before/at merge, including Gitleaks

## 5. Next work stack

Priority order:

1. Confirm no new open PRs or failed checks after `main` advanced.
2. Review `docs/runbooks/STAGE5-BRINGUP-CHECKLIST.md` for operator readiness.
3. Verify revenue-loop unauth gates against live prod only after the operator wants live probes.
4. Produce a dashboard-only action list for Stripe/Clerk/Resend/PageSpeed secrets and DNS.
5. Run a careful post-activation smoke only after the operator confirms envs are provisioned.

Operator-only blockers:

- Stripe live products, live webhook endpoint, live prices, tax/receipts.
- Clerk production keys and webhook signing secret.
- Resend key, sender domain, SPF/DKIM/DMARC.
- `EMAIL_UNSUBSCRIBE_SECRET`.
- Fresh PageSpeed Insights API key.
- Any real checkout/manual charge/refund smoke.

## 6. Hard stop conditions

Stop and report, do not patch around these:

- `origin/main` is not the expected commit or newer.
- New open PRs are failing checks and touch the same files.
- Gitleaks or secret scans fail.
- Any doc or script asks to paste a raw secret into a tracked file.
- Root checkout has unrelated dirty files and no clean worktree is available.
- Live prod probe returns unexpected 5xx on billing/auth/revenue gates.

## 7. Short operator summary

The PR queue is clean and current `main` contains the full Stage 5 bringup doc.
The next session should not reopen old PR archaeology. Start from current main,
dispatch the review agents above, then move directly into Stage 5 operator
activation readiness and live verification.
