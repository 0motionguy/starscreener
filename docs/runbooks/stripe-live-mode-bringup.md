# Runbook — Stripe live-mode bringup (HOSTUP production)

**When to use:** one-time, to flip TrendingRepo from Stripe test mode (`sk_test_*`) to live mode (`sk_live_*`). After this runs cleanly, real money can flow.

> **2026-07-09 rewrite:** the original runbook was Vercel-era (`vercel env add`,
> `vercel logs`, `vercel --prod`). Production is the HOSTUP Docker tenant
> (`toolbox-trendingrepo-1`, VPS `/opt/toolbox` compose) behind Cloudflare
> Tunnel — see `docker-compose.trendingrepo.yml`. Env lives in
> `/opt/trendingrepo/.env.production` on the box. Yearly prices were also
> corrected to match `src/lib/pricing/tiers.ts` ($180/$480 — the old
> $190/$490 numbers here never matched the pricing page).

**Pre-reqs:**

- Stripe account exists, business profile completed, bank account verified.
- SSH access to the VPS (`~/.ssh/AndyAikey.pem`, `root@193.53.40.118`, port 22).
- **Clerk live mode already brought up** ([clerk-pk-live-bringup.md](./clerk-pk-live-bringup.md)) — checkout requires a Clerk session since the identity unification (PR #3201).
- **`tr.user_tiers` migration applied** (see step 0). The tier store is
  Postgres-backed when `DATABASE_URL` is set; without the table, webhook
  writes fail and Stripe will retry-then-drop entitlements.

**Estimated time:** 30–45 minutes including verification.

## 0. Apply the user_tiers migration (once, before the code relying on it deploys)

From any machine with the repo + `DIRECT_URL` set (Supabase :5432, non-pooled):

```bash
npm run db:migrate
# Applies drizzle/0001_windy_wasp.sql → creates tr.user_tiers
```

Verify: `select count(*) from tr.user_tiers;` returns 0 rows, no error.

## 1. Create products in Stripe live mode

In Stripe dashboard, toggle to **live mode** (top-left switch). Then **Products** → **Add product** for each of:

| Name | Description | Statement descriptor |
|---|---|---|
| TrendingRepo Pro (monthly) | Pro plan — monthly billing | `TRENDINGREPO PRO` |
| TrendingRepo Pro (yearly) | Pro plan — annual billing (~2 months free) | `TRENDINGREPO PRO` |
| TrendingRepo Team (monthly) | Team plan — per-seat monthly | `TRENDINGREPO TEAM` |
| TrendingRepo Team (yearly) | Team plan — per-seat annual | `TRENDINGREPO TEAM` |

For each: pricing model = **Recurring**, billing period = monthly/yearly, currency = USD, amount per the tier table in `src/lib/pricing/tiers.ts`:

- Pro **$19/mo**, Pro **$180/yr**
- Team **$49/seat/mo**, Team **$480/seat/yr**

After creating, copy the **price ID** (starts `price_`).

## 2. Provision env on the HOSTUP box

SSH in and append/replace the Stripe block in the tenant env file:

```bash
ssh toolbox   # alias for root@193.53.40.118

# Edit the env file (values from step 1 + your live secret key):
vi /opt/trendingrepo/.env.production
```

```dotenv
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_YEARLY_PRICE_ID=price_...
STRIPE_TEAM_MONTHLY_PRICE_ID=price_...
STRIPE_TEAM_YEARLY_PRICE_ID=price_...
# STRIPE_WEBHOOK_SECRET added in step 3
```

Do NOT put live keys in any local `.env.local` or CI — local/dev must keep
using `sk_test_*` so development can't charge real cards.

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

Click **Add endpoint**. Stripe shows a **Signing secret** starting with `whsec_`. Add it to the same env file:

```dotenv
STRIPE_WEBHOOK_SECRET=whsec_...
```

Then restart the tenant so the container picks up the env:

```bash
cd /opt/toolbox && docker compose up -d trendingrepo
docker logs -f toolbox-trendingrepo-1 --since 2m   # watch boot; Ctrl-C when clean
```

## 4. Enable Stripe Tax (EU + UK + global compliance)

EU customers will fail to check out without proper VAT handling. UK requires VAT MOSS. US has state-by-state nexus once you cross thresholds (~$100k/yr).

- Stripe live mode → **Tax** → **Settings**
- **Default tax behavior:** Inclusive (recommended — price shown on /pricing is the total the customer pays; Stripe handles VAT extraction)
- **Origin address:** your registered business address
- **Tax codes:** for digital subscriptions, use `txcd_10103001` (SaaS — pre-written and configurable software)
- Click **Enable Stripe Tax**

In Stripe dashboard → **Products** → each price → toggle **"Tax behavior: Inclusive"**. Save.

For **B2B reverse-charge** (EU companies entering a VAT ID get tax-zeroed and self-report), no extra config — Stripe Tax does this automatically once tax IDs are collected at checkout.

## 5. Confirm receipt emails

Stripe dashboard → **Settings** → **Emails** (live mode):

- **Successful payments:** ✅ ON
- **Failed payments:** ✅ ON
- **Refunds:** ✅ ON

Receipt template is automatic; for a custom logo/footer: **Settings** → **Branding**.

## 6. Smoke test on production

```bash
# Route is mounted + secret loaded (GET is 405 by design; POST-only route):
curl -sI https://trendingrepo.com/api/webhooks/stripe
# Expect: HTTP/2 405

# Pricing page renders:
curl -sI https://trendingrepo.com/pricing
# Expect: 200

# Checkout requires a Clerk session:
curl -s -X POST https://trendingrepo.com/api/checkout/stripe \
  -H 'Content-Type: application/json' -d '{"tier":"pro","cadence":"monthly"}'
# Expect: 401 {"ok":false,...,"code":"UNAUTHORIZED"}
```

End-to-end with a real account (Stripe live mode has no test cards — use a
real card on a temporarily low-priced product, or a 100%-off promo code
created in the dashboard):

1. Sign in on trendingrepo.com
2. /pricing → upgrade → complete checkout
3. Stripe dashboard → Webhooks → Recent deliveries — `checkout.session.completed` with a 200 response within ~2s
4. Verify the tier landed: `select user_id, tier, stripe_customer_id from tr.user_tiers order by updated_at desc limit 5;` — expect a `c_user_...` row
5. `/you/settings` shows the paid plan + "Manage billing" button; the post-checkout success panel confirms without the 30s timeout
6. Refund via the [refund-30-day runbook](./refund-30-day.md); verify the user drops back to free after `customer.subscription.deleted`

If smoke fails: `docker logs toolbox-trendingrepo-1 --since 10m | grep stripe`. The signature path logs `[stripe] webhook signature verification failed` when `STRIPE_WEBHOOK_SECRET` is wrong.

## 7. Update internal docs

After live mode is confirmed working, note it in `docs/OPERATOR.md` (operator log section) and commit.

## Rollback

If something breaks (revenue lost > customer trust):

```bash
ssh toolbox
# Swap back to test keys in /opt/trendingrepo/.env.production
#   STRIPE_SECRET_KEY=sk_test_...
cd /opt/toolbox && docker compose up -d trendingrepo
```

The pricing page will then return 503 from `/api/checkout/stripe` for paid tiers, since the live-mode price IDs don't exist in test mode. The CheckoutWalkthrough surfaces this gracefully (inline error, modal stays open). To hard-disable the CTAs entirely, rebuild with `NEXT_PUBLIC_CHECKOUT_WALKTHROUGH=0`.

Optionally also disable the webhook endpoint in the Stripe live mode dashboard so any in-flight events stop hitting our prod URL.

## What this runbook does NOT cover

- Marketing copy on `/pricing` — that's a product decision, not an operator one
- Stripe Connect (we're not a platform; users don't onboard sub-merchants)
- 1099-K reporting — applies to platforms, not direct SaaS sales
- Bank account verification — already a Stripe account pre-req
- Adyen / Braintree / Paddle migration — single-provider for now

## Cross-reference

- [Clerk live bringup](./clerk-pk-live-bringup.md) — REQUIRED first (checkout is Clerk-gated)
- [Refund runbook](./refund-30-day.md) — process individual refunds
