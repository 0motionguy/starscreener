# Stage 5 — Activation Checklist

**One-page operator checklist** that ties the three Stage 5 runbooks together. Run top-to-bottom; each section is ~5-15 minutes. Total: ~60-75 minutes including waiting for first deploy + test charge.

Source for non-generated keys: `C:\Users\mirko\OneDrive\Desktop\KERMIT.txt` (line references below).

---

## 0. Pre-flight

- [ ] `npm i -g vercel` (if not already installed)
- [ ] `vercel login` (Mirko's account)
- [ ] `cd c:\dev\trendingrepo && vercel link` (link this checkout to the prod project)
- [ ] Confirm `gh auth status` shows you're signed in to GitHub

---

## 1. Stripe live mode (~15 min)

Account to use: the existing one — keys on KERMIT lines 176–178. Same account that powers gICM + ClawPulse. Decision locked in 2026-05-18: TrendingRepo runs as a separate product within the same Stripe account.

### 1a. Create 4 products in Stripe live mode

Toggle to **live mode** in the Stripe dashboard (top-left switch). Then **Products → Add product** for each:

| Name | Recurring | Amount | Currency | Statement descriptor |
|---|---|---|---|---|
| TrendingRepo Pro (monthly) | Monthly | $19.00 | USD | `TRENDINGREPO PRO` |
| TrendingRepo Pro (yearly) | Yearly | $190.00 | USD | `TRENDINGREPO PRO` |
| TrendingRepo Team (per-seat monthly) | Monthly | $49.00 | USD | `TRENDINGREPO TEAM` |
| TrendingRepo Team (per-seat yearly) | Yearly | $490.00 | USD | `TRENDINGREPO TEAM` |

For each price, **copy the `price_…` ID** to a scratch pad — you'll paste them in step 1c.

### 1b. Register the TrendingRepo webhook

⚠️ Do **not** reuse the Stripe webhook signing secret referenced on KERMIT line 197 — that's bound to `cp.gicm.app`. TrendingRepo needs its own endpoint.

In Stripe live mode dashboard → **Developers → Webhooks → Add endpoint**:

- **Endpoint URL**: `https://trendingrepo.com/api/webhooks/stripe`
- **Description**: `TrendingRepo prod`
- **API version**: match what `getStripeClient()` pins (`2025-02-24.acacia` in `src/lib/stripe/client.ts`)
- **Events to send** — exactly these 4 (NOT "all events"):
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

Click **Add endpoint** → Stripe shows a signing secret starting `whsec_…`. Copy it.

### 1c. Push the envs to Vercel production

```bash
# Paste sk_live_… from KERMIT.txt line 178
vercel env add STRIPE_SECRET_KEY production

# Paste whsec_… from step 1b (NOT the gICM one)
vercel env add STRIPE_WEBHOOK_SECRET production

# Paste each price_… from step 1a
vercel env add STRIPE_PRO_MONTHLY_PRICE_ID production
vercel env add STRIPE_PRO_YEARLY_PRICE_ID production
vercel env add STRIPE_TEAM_MONTHLY_PRICE_ID production
vercel env add STRIPE_TEAM_YEARLY_PRICE_ID production

# Confirm — should show 6 STRIPE_* rows, all environment=production
vercel env ls | grep STRIPE_
```

### 1d. Enable Stripe Tax + receipts (EU + global)

Stripe live mode dashboard:

- [ ] **Tax → Settings → Enable Stripe Tax** (origin address = your registered business address; tax code `txcd_10103001` for SaaS)
- [ ] **Settings → Emails → Successful payments / Failed payments / Refunds** all ✅ ON
- [ ] Optional: **Settings → Branding** — upload logo + brand color for receipts

Full detail in [docs/runbooks/stripe-live-mode-bringup.md](./stripe-live-mode-bringup.md).

---

## 2. Clerk live keys (~10 min)

❌ Not in KERMIT.txt — pull from Clerk dashboard directly.

### 2a. Pre-reqs

- [ ] Confirm Clerk production instance exists (top-left dropdown in Clerk dashboard)
- [ ] Confirm custom domain (`auth.trendingrepo.com` or whatever) shows ✅ in **Settings → Domains**

### 2b. Pull keys + push to Vercel

In Clerk dashboard → **Settings → API Keys**: copy the Publishable + Secret.

```bash
vercel env add CLERK_PUBLISHABLE_KEY production
# Paste pk_live_…

vercel env add CLERK_SECRET_KEY production
# Paste sk_live_…

vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
# Paste the SAME pk_live_… (mirror for the client bundle)
```

### 2c. Webhook

Clerk dashboard → **Webhooks** → confirm endpoint exists at `https://trendingrepo.com/api/webhooks/clerk` with events `user.created`, `user.updated`, `session.created` enabled. Copy the signing secret.

```bash
vercel env add CLERK_WEBHOOK_SIGNING_SECRET production
# Paste whsec_…
```

Full detail in [docs/runbooks/clerk-pk-live-bringup.md](./clerk-pk-live-bringup.md).

---

## 3. Resend (email) — ~10 min

❌ Not in KERMIT.txt — provision on Resend dashboard.

```bash
# Get the key from https://resend.com/api-keys
vercel env add RESEND_API_KEY production
# Paste re_…

vercel env add EMAIL_FROM production
# Paste: TrendingRepo <welcome@trendingrepo.com>  (or your verified sender)

# Generate a 32-byte random for the HMAC unsub link signing
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
vercel env add EMAIL_UNSUBSCRIBE_SECRET production
# Paste the output of the line above
```

For email deliverability, add SPF/DKIM/DMARC records on the sender domain — Resend dashboard walks you through it (~5 min, propagation ~30 min). Without these, emails go to spam.

---

## 4. Day-N onboarding crons (~2 min)

The new welcome/day-3/day-7 emails (PRs #1786, #1787) need a first-deploy gate so they don't spam pre-rollout users.

```bash
# ISO timestamp = "now" at the moment of bringup
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "Setting NOT_BEFORE=$NOW"

vercel env add DAY3_NUDGE_NOT_BEFORE production
# Paste $NOW

vercel env add DAY7_RETENTION_NOT_BEFORE production
# Paste $NOW
```

(Without these the cron's first run would email every profile in the historical 3-day / 7-day window — anyone who signed up in the last week would get a "still interested?" nudge unexpectedly.)

---

## 5. Lighthouse PSI key (~5 min)

⚠️ The Google common-key on KERMIT line 6 is **EXPIRED** (verified 2026-05-18 — Google returned `API key expired. Please renew the API key.` for a PSI call). Do not commit the old key value; generate a fresh key:

1. https://console.cloud.google.com/apis/credentials → **+ CREATE CREDENTIALS → API key**
2. Restrict the key (recommended): **API restrictions** → "Restrict key" → enable **PageSpeed Insights API** only
3. Add to GH Actions secrets (Settings → Secrets and variables → Actions → New repository secret):
   - Name: `PAGESPEED_API_KEY`
   - Value: paste the new key
4. (Optional) Also add to Vercel for local runs:
   ```bash
   vercel env add PAGESPEED_API_KEY production
   ```

Lighthouse workflow runs on next push to main (or via `gh workflow run lighthouse-pr.yml`). Non-blocking — emits `::warning::` per regression, doesn't fail CI.

---

## 6. Redeploy + verify (~5 min)

```bash
# Push all the env changes by redeploying
vercel --prod --yes

# Wait for the deploy to land (~2 min), then verify
node scripts/verify-revenue-loop.mjs --base=https://trendingrepo.com --prod
```

**Expected state after this PR's env work**:

```
✓ Gate 1: /pricing reachable          HTTP 200
✓ Gate 2: /api/checkout/stripe        HTTP 401  (was 503)
✓ Gate 3: /api/billing/portal         HTTP 401  (was 503)
✓ Gate 4: /api/me/alert-rules         HTTP 307  (Clerk redirect)
✓ Gate 5: /api/webhooks/stripe        HTTP 405  (POST-only)
✓ Gate 6: /api/auth/session           ok=false

6 passed, 0 failed.
```

If gates 2-3 are still 503, the Stripe env didn't take. Re-check `vercel env ls | grep STRIPE_`.

---

## 7. Manual smoke (~15 min)

Follow [docs/forensic/revenue-loop-2026-05-19.md](../forensic/revenue-loop-2026-05-19.md) §2 — the 27-step manual smoke. Drive a fresh signup → first dollar → cancel.

Use Stripe test card `4242 4242 4242 4242` (any future expiry, any CVC). This works on both test mode and live mode — no real money moves on this card number even when sent against live keys.

After the test charge:
- [ ] Verify the user appears in Stripe live mode dashboard → Customers
- [ ] Verify `.data/user-tiers.jsonl` on prod shows the tier flip (you can check via a one-off admin endpoint or by hitting `/you/settings` as the test user)
- [ ] Refund the test charge per [docs/runbooks/refund-30-day.md](./refund-30-day.md) — cleans up the subscription before you forget

---

## 8. Activate the onboarding crons (~2 min)

Once the manual smoke passes, fire each cron in dry-run mode to sanity-check the eligible counts:

```bash
gh workflow run cron-onboarding-day3.yml --field dry=true
gh workflow run cron-onboarding-day7.yml --field dry=true

# Watch the latest run of each
gh run watch $(gh run list --workflow=cron-onboarding-day3.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

Expected: `dryRun:true, eligible:0, sent:0` (since `NOT_BEFORE` was just set to "now", no profiles in the historical window count yet). The first real targeted user will be someone who signed up AFTER `NOT_BEFORE` and reaches the 3-day mark.

---

## 9. Done — what changes

The moment all 6 gates in step 6 are green AND the manual smoke walks cleanly:

- Real signups arrive (Clerk pk_live)
- Day-1 welcome email lands
- Quota at 3 alerts triggers the 402 → upgrade flow
- Stripe charges land
- Tier flips
- `/you/settings` shows Pro
- Cancellation flow round-trips through the portal

**First dollar is now possible.**

Watch the first 24h for:
- PostHog funnel events flowing through `paywall_shown → checkout_started → checkout_completed`
- Stripe dashboard for webhook deliveries (Events → Webhook Attempts → 200 within 1-2s)
- Resend dashboard for delivered emails (or spam complaints — adjust SPF/DKIM if you see any)
- `vercel logs --since 1h | grep stripe` for any handler errors

---

## Rollback

If anything breaks in step 6 or 7 and you need to back out to test mode:

```bash
# Restore test keys for Stripe
vercel env rm STRIPE_SECRET_KEY production
vercel env add STRIPE_SECRET_KEY production
# Paste sk_test_…

# Restore test keys for Clerk
vercel env rm CLERK_PUBLISHABLE_KEY production
vercel env add CLERK_PUBLISHABLE_KEY production
# Paste pk_test_…
# (repeat for CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

vercel --prod --yes
```

The app continues to function — pricing CTA returns 503 from `/api/checkout/stripe`, sign-in shows "Auth unavailable" — but no real money moves while you debug.
