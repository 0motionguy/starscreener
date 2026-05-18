# Runbook — Stripe live-mode bringup

**When to use:** one-time, to flip TrendingRepo from Stripe test mode (`sk_test_*`) to live mode (`sk_live_*`). After this runs cleanly, real money can flow.

**Pre-reqs:**

- Stripe account exists, business profile completed, bank account verified.
- Vercel CLI authed (`vercel whoami` succeeds).
- `gh` CLI authed.
- This runbook should run **after** Stage 5 PRs are merged. Doing it earlier ships an empty pricing surface to real users.

**Estimated time:** 30–45 minutes including verification.

## 1. Create products in Stripe live mode

In Stripe dashboard, toggle to **live mode** (top-left switch). Then **Products** → **Add product** for each of:

| Name | Description | Statement descriptor |
|---|---|---|
| TrendingRepo Pro (monthly) | Pro plan — monthly billing | `TRENDINGREPO PRO` |
| TrendingRepo Pro (yearly) | Pro plan — annual billing (2 months free) | `TRENDINGREPO PRO` |
| TrendingRepo Team (monthly) | Team plan — per-seat monthly | `TRENDINGREPO TEAM` |
| TrendingRepo Team (yearly) | Team plan — per-seat annual | `TRENDINGREPO TEAM` |

For each: pricing model = **Recurring**, billing period = monthly/yearly, currency = USD, amount per the tier table in `src/lib/pricing/tiers.ts` (Pro $19/mo, Pro $190/yr, Team $49/seat/mo, Team $490/seat/yr). After creating, copy the **price ID** (starts `price_`).

## 2. Set Vercel env vars

Run these from the repo root (one block — paste, then enter the value for each prompt):

```bash
vercel env add STRIPE_SECRET_KEY production
# Paste: sk_live_...

vercel env add STRIPE_PRO_MONTHLY_PRICE_ID production
# Paste: price_... (from step 1)

vercel env add STRIPE_PRO_YEARLY_PRICE_ID production
# Paste: price_...

vercel env add STRIPE_TEAM_MONTHLY_PRICE_ID production
# Paste: price_...

vercel env add STRIPE_TEAM_YEARLY_PRICE_ID production
# Paste: price_...
```

Do NOT add to `preview` env — preview deploys must continue to use `sk_test_*` so Stage 5 work doesn't accidentally charge real cards. Verify:

```bash
vercel env ls | grep STRIPE_
# Each should show "production" in the Environment column. None in "Preview" or "Development".
```

## 3. Register the production webhook endpoint

In Stripe live mode dashboard → **Developers** → **Webhooks** → **Add endpoint**.

- **Endpoint URL:** `https://trendingrepo.com/api/webhooks/stripe`
- **Description:** `TrendingRepo prod` (visible only in Stripe dashboard)
- **API version:** match what `getStripeClient()` pins (currently `2025-02-24.acacia`)
- **Events to send** — exactly these 4 (NOT "all events" — that floods our webhook handler with no-ops):
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

Click **Add endpoint**. Stripe shows a **Signing secret** starting with `whsec_`. Copy it.

```bash
vercel env add STRIPE_WEBHOOK_SECRET production
# Paste: whsec_...
```

## 4. Enable Stripe Tax (EU + UK + global compliance)

EU customers will fail to check out without proper VAT handling. UK requires VAT MOSS. US has state-by-state nexus once you cross thresholds (~$100k/yr).

- Stripe live mode → **Tax** → **Settings**
- **Default tax behavior:** Inclusive (recommended — price shown on /pricing is the total the customer pays; Stripe handles VAT extraction)
- **Origin address:** your registered business address
- **Tax codes:** for digital subscriptions, use `txcd_10103001` (SaaS — pre-written and configurable software)
- Click **Enable Stripe Tax**

In Stripe dashboard → **Products** → each price → toggle **"Tax behavior: Inclusive"**. Save.

When checking out, Stripe will auto-detect the customer's country, calculate the local VAT/sales tax from the inclusive price, and remit it to the right tax authority (Stripe Tax handles this for ~50 jurisdictions; you receive a quarterly Stripe Tax report).

For **B2B reverse-charge** (EU companies entering a VAT ID get tax-zeroed and self-report), no extra config — Stripe Tax does this automatically when `customer_tax_id` is collected. Checkout sessions auto-collect tax IDs once Stripe Tax is on.

## 5. Confirm receipt emails

Stripe dashboard → **Settings** → **Emails** (live mode):

- **Successful payments:** ✅ ON
- **Failed payments:** ✅ ON
- **Refunds:** ✅ ON

Receipt template is automatic; if you want a custom logo/footer, **Settings** → **Branding** → upload the TrendingRepo logo + brand color.

## 6. Smoke test on production

```bash
# Verify the env is loaded
curl -sI https://trendingrepo.com/api/webhooks/stripe
# Expect: HTTP/2 405 (GET not allowed; POST only) — confirms the route is mounted with the new secret.

# Smoke the pricing page
curl -sI https://trendingrepo.com/pricing
# Expect: 200

# Smoke checkout endpoint (should require auth)
curl -sI -X POST https://trendingrepo.com/api/checkout/stripe -H 'Content-Type: application/json' -d '{"tier":"pro","cadence":"monthly"}'
# Expect: 401 (login required) — confirms the route is responding
```

If you have access to a test account, do a real `$0.50` test charge through `/pricing`:

1. Sign in
2. Click upgrade
3. Use a **real card with a small amount** (Stripe doesn't allow live test cards — you'll actually pay $0.50 if you set the price that low temporarily)
4. Verify webhook fires (Stripe dashboard → Webhooks → Recent deliveries — should show a `checkout.session.completed` with 200 response from your endpoint within 2s)
5. Verify `.data/user-tiers.jsonl` on prod (via a Vercel deploy log or a one-off admin endpoint) shows the test user upgraded
6. Refund the charge via the [refund-30-day runbook](./refund-30-day.md)
7. Verify the user is downgraded back to free

If smoke fails: check `vercel logs --since 5m | grep stripe` for handler errors. The signature verification path logs `[stripe] webhook signature verification failed` if `STRIPE_WEBHOOK_SECRET` is wrong.

## 7. Update internal docs

After live mode is confirmed working:

```bash
# Note in the operator log
echo "$(date -u +%FT%TZ): Stripe live mode enabled; webhook registered; first charge verified." >> docs/OPERATOR.md
git add docs/OPERATOR.md
git commit -m "docs(operator): stripe live mode bringup complete"
git push
```

## Rollback

If something breaks (revenue lost > customer trust):

```bash
# Restore test mode env (so the app stops accepting live cards)
vercel env rm STRIPE_SECRET_KEY production
vercel env add STRIPE_SECRET_KEY production
# Paste: sk_test_...

# Redeploy
vercel --prod
```

The pricing page will then return 503 from `/api/checkout/stripe` for paid tiers, since `STRIPE_PRO_MONTHLY_PRICE_ID` etc. were live-mode IDs not in test mode. The CheckoutWalkthrough surfaces this gracefully (inline error, modal stays open).

Optionally also disable the webhook endpoint in the Stripe live mode dashboard so any in-flight events stop hitting our prod URL.

## What this runbook does NOT cover

- Marketing copy on `/pricing` — that's a product decision, not an operator one
- Stripe Connect (we're not a platform; users don't onboard sub-merchants)
- 1099-K reporting — applies to platforms, not direct SaaS sales
- Bank account verification — already a Stripe account pre-req
- Adyen / Braintree / Paddle migration — single-provider for now

## Cross-reference

- [Refund runbook](./refund-30-day.md) — process individual refunds
- [Clerk live keys runbook](./clerk-pk-live-bringup.md) — sister bringup; auth must be live for checkout to actually be reachable by real users
