# Quickstart: v6 Production Cutover Operator Runbook

**Feature**: 001-v6-prod-cutover | **Date**: 2026-05-21

This runbook is for the operator executing the cutover. It is meant to be readable on
a phone at 2am. Every step has a verification probe. Total cutover wall-clock target:
≤30 min. Rollback wall-clock target: ≤5 min.

---

## Phase 0 — Pre-Cutover Prep (run once, ahead of cutover day)

### Step 0.1 — Snapshot the legacy sitemap

```bash
curl -s https://trendingrepo.com/sitemap.xml \
  | grep -oP '(?<=<loc>)[^<]+' \
  > specs/001-v6-prod-cutover/legacy-sitemap.txt
wc -l specs/001-v6-prod-cutover/legacy-sitemap.txt   # expect ~95 URLs
```

### Step 0.2 — Record Lighthouse baseline against current prod

```bash
PAGESPEED_API_KEY=$YOUR_KEY DEPLOY_URL=https://trendingrepo.com \
  npm run lighthouse:routes:prod
git add .perf/lighthouse-mobile-prod.json   # NOT git add .
git commit -m "perf: baseline lighthouse for v6 cutover gate"
```

### Step 0.3 — Confirm Clerk + Redis + DB env vars are set in HOSTUP

Check the HOSTUP dashboard env panel:
- `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set
- `REDIS_URL` OR `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN` set (exactly one pair)
- `DATABASE_URL`+`DIRECT_URL` set (Supabase pooler with `ssl=require`)
- `CRON_SECRET` set
- `GITHUB_TOKEN` set

### Step 0.4 — Confirm standby origin exists and is healthy

```bash
# Probe whatever URL HOSTUP exposes for the standby origin:
curl -sI https://${STANDBY_ORIGIN_HOST}/
# Expect: HTTP/2 200, Server: cloudflare
```

If standby origin does not exist, STOP — the rollback path doesn't work without it.
Provision the standby (clone the current prod HOSTUP service) before continuing.

---

## Phase 1 — Cutover Day (execute in order)

### Step 1.1 — Confirm cutover branch is green

```bash
git checkout 001-v6-prod-cutover
git pull --ff-only
npm run lint:guards
npm run typecheck
npm test
npm run build
```

All four must exit 0. Test suite must show ≥1335/1337 (FR-011 gate). Build must
succeed without missing `.next/` chunks.

### Step 1.2 — Deploy cutover candidate to a HOSTUP staging URL (NOT prod)

(HOSTUP-specific deploy command — see HOSTUP docs or operator memory.)

Record the resulting staging URL as `$DEPLOY_URL` for the steps below.

### Step 1.3 — Run the verify gate

```bash
gh workflow run pre-cutover-verify.yml \
  --field deploy_url=$DEPLOY_URL
```

Wait for the run to complete. The `cutover-verify` status check on the cutover commit
MUST be green. If red:

```bash
gh run view --log         # inspect failures
# Download artifacts:
gh run download <run-id>
```

Fix the issue, push, re-deploy, re-run the gate.

### Step 1.4 — Operator manual click-through

Open `$DEPLOY_URL` in a real browser. Click through:
- Homepage `/`
- `/breakout`, `/market-signals`, `/funding`, `/ideas`
- `/repo/vercel/next.js` (canary deep link)
- `/twitter`
- `/tools/top-10`, `/tools/tier-list`, `/tools/compare`, `/tools/digest`
- `/sign-in` → click "Sign in with Google" → returns to home logged in
- `/ideas` → open any idea → click "Save Edit" → confirm "Coming Soon" toast
- Visit `/top10` → confirm 308 redirect to `/tools/top-10` (URL bar updates)
- Visit `/pricing` and `/contact` → confirm v6-styled pages render

Check all 6 PR-body checkboxes in the cutover PR.

### Step 1.5 — Flip DNS / origin to v6

(HOSTUP-specific command — see HOSTUP docs.)

This is the irreversible-without-rollback step. Time stamp it.

```bash
# Record cutover timestamp for incident-response audit:
date -u +"%Y-%m-%dT%H:%M:%SZ" > .cutover-timestamp.txt
```

### Step 1.6 — Post-cutover smoke

```bash
gh workflow run post-deploy-smoke.yml
```

Confirm green. If red, escalate to Step 2 (Rollback) immediately.

### Step 1.7 — Update tasks/CURRENT-SPRINT.md

Move the cutover task to "Shipped 2026-05-21 — v6 cutover complete; standby origin
retained until 2026-05-24" and commit (exact-file staging only, no `git add .`).

---

## Phase 2 — Rollback (run IF Phase 1 fails post-DNS-flip)

**Trigger conditions**:
- Homepage `/` returns 5xx
- Any auth flow broken (cannot sign in)
- Smoke probe red on any v6-core route
- Operator's gut says "something is wrong"

**Budget**: ≤5 minutes wall-clock from trigger to rolled-back-and-verified.

### Step 2.1 — Flip DNS / origin back to standby (≤60s)

(HOSTUP-specific command — flip the same DNS record / origin pointer reverse direction.)

### Step 2.2 — Verify rollback (≤60s)

```bash
curl -sI https://trendingrepo.com/
# Expect HTTP/2 200, response body title matches pre-cutover title
curl -s https://trendingrepo.com/ | grep -oP '<title>[^<]+'
```

### Step 2.3 — Re-run post-deploy smoke against rolled-back state (≤2min)

```bash
gh workflow run post-deploy-smoke.yml
```

Smoke should match the pre-cutover baseline (all green).

### Step 2.4 — Flush any ISR-cached errors that may have been baked during cutover (≤60s)

```bash
curl -X POST https://trendingrepo.com/api/revalidate \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"paths":["/","/breakout","/market-signals","/funding","/ideas","/twitter"]}'
```

Total elapsed: ≤5 min. Operator posts incident note to `tasks/CURRENT-SPRINT.md` and
opens a follow-up to diagnose the failure on the cutover branch.

---

## Phase 3 — Post-Cutover Stabilization (next 72h)

### Day +1

- Monitor `/api/revalidate` cache-flush stats
- Spot-check 5 random legacy URLs return 308 → 200
- Compare day-over-day organic traffic on the 4 moved tools (must be within -10% per SC-009)

### Day +3 (72h post-cutover)

- If green: garbage-collect the standby HOSTUP origin
- Update `tasks/BACKLOG.md` for the deferred follow-up waves (H1–H5 IdeaBrief writes,
  rebuild of 22 aggregators in v6, etc.)
- Close the cutover PR / branch

### Day +7

- Compare 7-day organic traffic to pre-cutover 7-day window (SC-008 zero increase in
  "broken link" / "404" tickets, SC-009 ≤10% drop on moved tools)

---

## Quick Reference

| Action | Command |
|--------|---------|
| Run verify gate | `gh workflow run pre-cutover-verify.yml -F deploy_url=<URL>` |
| Run smoke probe | `gh workflow run post-deploy-smoke.yml` |
| Flush ISR cache | `curl -X POST https://trendingrepo.com/api/revalidate -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"paths":["<paths>"]}'` |
| Probe single URL | `curl -sIL https://trendingrepo.com/<path>` |
| View workflow log | `gh run view --log` |
