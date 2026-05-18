# Forensic — Revenue Loop, Stage 5 verification

**Date:** 2026-05-18 (Stage 5 close-out)
**Branch:** Multiple — Stage 5 PRs #1765, #1766, #1767, #1769, #1770, #1772, #1773, #1775, #1777, #1779, #1780, #1781, #1782, #1784, #1786, #1787, #1788 (this one)
**Audience:** the operator who flips `pk_live_*` and the next CTO session that has to debug if a real signup → paid flow misbehaves.

## What we built

A complete code-side revenue loop. The full path:

```
fresh signup (Clerk pk_live)
    ↓ Clerk user.created webhook  (B.2 welcome email fires, B.5 sign_up_success funnel step)
    ↓
/you/alerts                       (welcome email's deeplink)
    ↓ user creates alert rule #4  (free tier cap = 3)
    ↓ POST /api/me/alert-rules    (A.3: returns HTTP 402 quota_exceeded)
    ↓
AddAlertRuleDialog                (A.5: surfaces paywall toast + Upgrade CTA, B.5 paywall_shown funnel step)
    ↓ click [Upgrade]
/pricing                          (existing)
    ↓ click Pro card
CheckoutWalkthrough               (A.5: shows 30-day money-back guarantee)
    ↓ click Continue              (B.5 checkout_started funnel step)
    ↓ POST /api/checkout/stripe   (existing)
Stripe-hosted checkout            (real card or test card 4242…)
    ↓ payment success
Stripe webhook
    ↓ POST /api/webhooks/stripe (existing — checkout.session.completed)
    ↓ setUserTier(userId, "pro", periodEnd, {stripeCustomerId, stripeSubscriptionId})
    ↓
/pricing?checkout=success&session_id=… (Stripe redirect)
    ↓ CheckoutSuccess client island (A.6: polls /api/auth/session every 1.5s)
    ↓ tier flips to "pro"           (B.5 checkout_completed funnel step)
    ↓ confirmation: "You're on Pro. Renews <date>"
    ↓
/you/settings                     (A.2: shows "Pro · Renews <date>" + [Manage billing])
    ↓ click [Manage billing]
    ↓ POST /api/billing/portal    (A.1: creates Stripe portal session)
    ↓
billing.stripe.com                (cancel / change card / view invoices)
    ↓ click "Cancel subscription"
Stripe webhook
    ↓ customer.subscription.deleted → setUserTier(userId, "free", null)
    ↓
/you/settings refreshed           (tier flipped back to "Free")
```

## Verified gates (code-side)

Run via `node scripts/verify-revenue-loop.mjs --base=https://<preview-deploy>.vercel.app`. The script probes 6 gates:

| # | Gate | Expected | Failure means |
|---|---|---|---|
| 1 | `/pricing` reachable | HTTP 200 | Page-level outage; pricing page broke during a build |
| 2 | `/api/checkout/stripe` POST rejects anonymous | HTTP 401 (or 503 if Stripe envs unset) | Auth gate is broken; anyone could create checkouts |
| 3 | `/api/billing/portal` POST rejects anonymous | HTTP 401 (or 503) | Auth gate is broken; anyone could open someone else's portal |
| 4 | `/api/me/alert-rules` POST requires auth | HTTP 307/308 (Clerk redirect) or 401 | `requireUser` regressed |
| 5 | `/api/webhooks/stripe` GET → 405 | HTTP 405 (or 503) | Webhook route is missing or method guard removed |
| 6 | `/api/auth/session` returns probe shape | HTTP 200 with `{ ok: boolean }` | Session probe broken — `CheckoutSuccess` polling can't resolve the tier flip |

The script exits non-zero if any gate fails. It does NOT validate the actual Stripe → webhook → tier-flip handshake because that requires a real card + a real webhook delivery — see the **Manual smoke** section below.

## Manual smoke (what the script can't do)

The remaining proof is human-driven, because it crosses systems that require real keys + a real browser:

### 1. Pre-flight env check

```bash
vercel env ls | grep -E "STRIPE_|CLERK_|PAGESPEED|RESEND" | sort
```

Expected:
- `STRIPE_SECRET_KEY` (sk_test_ or sk_live_)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_MONTHLY_PRICE_ID` / `_YEARLY_PRICE_ID`
- `STRIPE_TEAM_MONTHLY_PRICE_ID` / `_YEARLY_PRICE_ID`
- `CLERK_PUBLISHABLE_KEY` (pk_test_ or pk_live_)
- `CLERK_SECRET_KEY` (sk_test_ or sk_live_)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (mirror of the publishable)
- `CLERK_WEBHOOK_SIGNING_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_UNSUBSCRIBE_SECRET` (32-byte random for email unsub links)
- `PAGESPEED_API_KEY` (optional, for Lighthouse CI)

### 2. Walk the signup → first dollar path

1. Open an Incognito window
2. `https://trendingrepo.com/sign-up`
3. Use a real email you control (Stripe must be able to send the receipt)
4. Complete Clerk's signup flow
5. ✅ **Verify**: welcome email lands within ~30 seconds. Subject: "You're in. Catch breakouts before they're cold."
6. Click the email's CTA → lands on `/you/alerts?preset=breakout` with the breakout preset preselected
7. Save the rule (no extra fields needed). Toast: "Alert created! First report in ~1h…"
8. Save 2 more rules (total = 3, the free tier cap)
9. Try to save a 4th rule
10. ✅ **Verify**: toast "You've reached your plan's alert rule limit (3). Upgrade for more." with [Upgrade] button
11. Click [Upgrade] → `/pricing`
12. Click Pro card (highlighted) → CheckoutWalkthrough opens
13. ✅ **Verify**: step 2 shows the **"30-day money-back guarantee"** headline
14. Click Continue → redirected to `checkout.stripe.com`
15. Use Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC, any postal
16. Click Pay
17. ✅ **Verify**: redirected to `/pricing?checkout=success&session_id=cs_test_...`
18. ✅ **Verify**: "Activating your subscription… (attempt 1 of 20)" appears
19. ✅ **Verify**: within 5 seconds it flips to "You're on Pro. Renews <date>" with [Create your next alert] + [Manage billing] buttons
20. Click [Create your next alert] → `/you/alerts`
21. ✅ **Verify**: alert #4 can now be created (no 402 toast)
22. Navigate to `/you/settings`
23. ✅ **Verify**: "Current plan: Pro · Renews <date>" + [Manage billing] button
24. Click [Manage billing] → redirected to `billing.stripe.com`
25. In the Stripe portal, click "Cancel subscription" → "Cancel immediately"
26. Return to `/you/settings`
27. ✅ **Verify**: within ~5 seconds, tier shows "Free" + "Upgrade to Pro" link

### 3. Inspect the side effects

```bash
# Tier record was written
grep '"<your-userId>"' .data/user-tiers.jsonl | tail -1
# Should show: "tier":"free","stripeCustomerId":"cus_...","stripeSubscriptionId":"sub_..."

# Funnel events landed (PostHog)
# In the PostHog dashboard, search for events:
#   - sign_up_success    (flow=account-auth, source=clerk_webhook)
#   - alert_created      (flow=alert-activation, is_first_rule=true)
#   - paywall_shown      (flow=revenue-loop, feature=alerts.max)
#   - checkout_started   (flow=revenue-loop, tier=pro, cadence=monthly)
#   - checkout_completed (flow=revenue-loop, tier=pro)
#
# Build the "revenue-loop" funnel using these step names — verify each
# step shows ≥ 1 user (your test session).
```

### 4. Refund the test charge (if real card was used)

Follow `docs/runbooks/refund-30-day.md` from Step 1. The refund + cancel-subscription flow is the same regardless of whether the test ran on sk_test or sk_live.

## What we DIDN'T verify

These are knowingly out of scope for this PR but worth a follow-up:

- **Stripe Tax** — enable per `docs/runbooks/stripe-live-mode-bringup.md` step 4 before the first real EU charge. The smoke script doesn't probe Tax behaviour.
- **Receipt emails** — Stripe's "Email receipts on successful payment" toggle. Same runbook step 5.
- **Multi-tier upgrade** — Pro → Team via the Stripe portal. The webhook handler should set `tier=team` on `customer.subscription.updated` with a Team priceId, but we didn't manually verify this — operator should smoke it once Team becomes commercially relevant.
- **Dunning grace** — payment_failed → past_due grace period. The webhook handler logs but doesn't actively downgrade until status becomes canceled/unpaid/incomplete_expired. Worth a controlled Stripe test once we have a real subscription cycle.
- **Welcome / day-3 / day-7 email idempotency on Clerk webhook retries** — Clerk's at-least-once delivery could produce duplicates. Not load-bearing for first dollar but tracks for a future PR.
- **Stripe customer_email pre-fill** — the checkout route doesn't pass `customer_email` because the auth path uses HMAC userIds, not Clerk emails directly. Stripe still collects the email at checkout, so the loop works. Filed as a follow-up in `feat/paywall-success-flow`'s PR body.

## How to use this doc

When a real signup misbehaves:

1. **First**: run `node scripts/verify-revenue-loop.mjs --base=https://trendingrepo.com --prod`. If any gate fails, that's where the regression is.
2. **If all 6 gates pass but the user still can't pay**: walk the manual smoke step-by-step against an Incognito window. Identify the first step that diverges from "✅ Verify" — that's the bug surface.
3. **If a webhook isn't landing**: Stripe dashboard → Webhooks → click the prod endpoint → Recent deliveries. Each delivery shows the request body, response, and any retry attempts.
4. **If tier is wrong in `user-tiers.jsonl`**: that's an `events.ts` bug. Compare the recent webhook delivery's `data.object.subscription.items[0].price.id` against `STRIPE_PRO_MONTHLY_PRICE_ID` etc.

## Cross-reference

- `scripts/verify-revenue-loop.mjs` — the gate runner
- `docs/runbooks/refund-30-day.md` — refund process
- `docs/runbooks/stripe-live-mode-bringup.md` — env + webhook + tax bring-up
- `docs/runbooks/clerk-pk-live-bringup.md` — Clerk live-key flip
- `src/lib/stripe/events.ts` — the webhook event dispatch (all 4 event types)
- `src/lib/pricing/user-tiers.ts` — the JSONL-backed tier store
- `src/components/pricing/CheckoutSuccess.tsx` — the polling success surface
