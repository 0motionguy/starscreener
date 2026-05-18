# Runbook — 30-day money-back refund

**When to use:** a customer requests a refund within 30 days of paying for Pro/Team. The product's checkout copy promises this, surfaced at:

- `src/components/pricing/CheckoutWalkthrough.tsx` step-2 ("30-day money-back guarantee")
- `/pricing` FAQ

**Who runs this:** operator. Not automated. Should take < 5 minutes per refund.

## Decision tree

| Days since charge | Refund? | Action |
|---|---|---|
| 0–30 | **Yes**, full refund | Process per steps below |
| 31+ | **No** (policy) | Reply with the canned email at bottom; if exception is warranted (rare), document the reason in the Stripe note. |

## Steps

### 1. Find the charge

```
https://dashboard.stripe.com/payments?status[]=successful&query=<customer-email-or-id>
```

The customer's email is on the Stripe customer record. If they only gave you a userId, look it up via:

```bash
# From the trendingrepo repo
grep '"<userId>"' .data/user-tiers.jsonl | head -1
# Field: stripeCustomerId — paste into Stripe dashboard search
```

### 2. Verify subscription state

In Stripe dashboard → Customers → Subscriptions tab. Status should be `active` or `past_due`. If `canceled` already, the customer's tier is already free — refund is the only remaining action.

### 3. Issue the refund

In the customer's most-recent successful payment:

- Click **"Refund"** → **"Full refund"** → reason: **"Customer requested"**
- Stripe refunds to the original payment method. ETA per dashboard.

### 4. Cancel the subscription (if not already)

If subscription is still `active` or `past_due`:

- Subscriptions tab → click the subscription → **"Cancel subscription"** → **"Cancel immediately"** (not "at period end" — they paid for this period and we just refunded it, so end access immediately)
- Confirm.

Stripe will emit `customer.subscription.deleted` → our webhook hits `handleSubscriptionDeleted` → `setUserTier(userId, "free", null, …)` → user is downgraded automatically. Verify in `.data/user-tiers.jsonl`:

```bash
grep '"<userId>"' .data/user-tiers.jsonl | tail -1
# Should show: "tier":"free","expiresAt":null
```

If the tier did NOT downgrade within 2 minutes (webhook delay or signature mismatch in test mode), edit `.data/user-tiers.jsonl` manually:

```jsonl
{"userId":"<userId>","tier":"free","expiresAt":null,"stripeCustomerId":"cus_…","stripeSubscriptionId":"sub_…","createdAt":"<orig>","updatedAt":"<now-iso>"}
```

Append the corrected row to the bottom of the file. The store dedupes by userId on next read, so the latest row wins. Commit + push so prod picks it up.

### 5. Email the customer

Send (from `hello@trendingrepo.com`):

```
Subject: Refund processed — TrendingRepo

Hi <name>,

Your refund of $<amount> has been processed and should appear on your card within 5–10 business days, depending on your bank.

Your Pro features have been removed; your alerts and watchlists are kept intact so you can re-subscribe later without losing setup.

If this was a billing issue rather than a product issue, let us know what we got wrong — we'd love to keep you.

— TrendingRepo team
```

### 6. (Optional) Log the reason

If the customer gave a reason in their request, add it to a brief CSV at `docs/forensic/refund-log.csv`:

```csv
date,userId,amount_usd,reason,product_lesson
2026-06-12,user_abc,19.00,too-expensive,upgrade-friction-anchor-too-high
```

This becomes the input for monthly product reviews — patterns here tell us what to fix.

## After-31-day refusal email

```
Subject: About your TrendingRepo refund request

Hi <name>,

Our money-back guarantee window is 30 days from the original charge; your subscription is past that window. I can still cancel your renewal so you won't be charged again — just confirm.

If there's a specific reason you're stepping away that wasn't covered by the 30-day window, let me know directly — exceptions exist for genuine product failure.

— TrendingRepo team
```

## Edge cases

- **Refund a charge after subscription already self-canceled** → still possible. Same Stripe steps; the user-tier record is already free, so no manual edit needed.
- **Partial refund (e.g., they used Pro for 15 days, want pro-rated)** → discouraged. The 30-day promise is full-refund-or-keep. If business reason justifies it, issue a partial refund in Stripe (the "Refund" dialog allows partial amounts), then manually edit `.data/user-tiers.jsonl` to set `expiresAt` to the appropriate prorated date (instead of `null`).
- **Card declined during refund** → contact the customer to update their card; some banks reject refunds to closed/expired cards. Stripe will surface this in the dashboard.
- **Multiple subscriptions** (e.g., Pro + later upgraded to Team) → refund whichever charge the customer is unhappy with. Stripe's audit log tracks proration. Cancel any remaining active subscription per step 4.

## What NOT to do

- **Never refund a chargeback** — disputes have their own dispute-evidence flow. Refunding a disputed charge can cost the chargeback fee + the refunded amount (double hit).
- **Never refund without canceling the subscription** — Stripe will re-bill them next cycle, and they'll be entitled to a second refund.
- **Never edit `.data/user-tiers.jsonl` to delete a row** — append-only. Add a new row with the corrected state; the store dedupes by userId on read.
