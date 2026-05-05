---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# Stripe webhook secret rotation runbook

Purpose: rotate `STRIPE_WEBHOOK_SECRET` on `trendingrepo.com` without dropping webhook intent, with explicit verification and rollback.

Scope owner: Release SRE
Route: `POST /api/webhooks/stripe`
Code path: `src/app/api/webhooks/stripe/route.ts`

## Preconditions

- You have Stripe Dashboard access (test mode first, then live mode).
- You have Vercel project access for `trendingrepo.com` production env vars.
- Current deploy is healthy enough to return non-5xx on `POST /api/webhooks/stripe` for valid signatures.
- Existing secret value is recoverable from secure secret manager or Vercel history.

## Known implementation constraints

- App verifies against exactly one secret: `STRIPE_WEBHOOK_SECRET`.
- Route returns:
  - `400 BAD_SIGNATURE` when signature check fails
  - `503 WEBHOOK_NOT_CONFIGURED` when Stripe env is missing
  - `500 HANDLER_ERROR` when verified event processing fails
- Route requires raw body verification (`request.text()`); do not proxy-transform payload bytes.

## Rotation strategy (test mode first)

1. In Stripe Dashboard (Test mode), open the webhook endpoint used by this app.
2. Click **Roll secret** and choose **Delayed expiration** (keep previous secret active during overlap window).
3. Copy the new test signing secret (`whsec_...`) immediately.
4. Update Vercel test/staging env var `STRIPE_WEBHOOK_SECRET` with the new value.
5. Redeploy and wait until deployment is Ready.
6. In Stripe Dashboard, send a test event to the endpoint (for example `checkout.session.completed`).
7. Confirm delivery is `2xx` in Stripe endpoint delivery log.
8. Verify app logs show no signature verification failures for that delivery.
9. Replay any failed deliveries during the overlap window.
10. After successful verification and replay, expire/remove old secret in Stripe.

Repeat the same sequence in Live mode after test mode is green.

## Dry-run verification checklist

Run these checks before and after rotation:

1. Synthetic malformed signature probe (must fail with 400):

```bash
curl -i -X POST https://trendingrepo.com/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=1,v1=deadbeef" \
  --data '{"id":"evt_test","type":"checkout.session.completed"}'
```

Expected: `HTTP 400` with `{"ok":false,"code":"BAD_SIGNATURE"...}`.

2. Local route regression test for webhook verification and error contract:

```bash
npx tsx --test src/lib/pipeline/__tests__/stripe-events.test.ts
```

Expected: passing tests, including bad-signature cases and Sentry-tagged quarantine capture.

3. Stripe endpoint delivery dry-run:
- Use Stripe Dashboard -> Webhooks -> endpoint -> Send test event.
- Expected: delivery succeeds (`2xx`) with zero signature failures.

## Production validation after live rotation

- Confirm new deliveries continue at `2xx` for at least 15 minutes.
- Replay any webhook deliveries that failed during the cutover window.
- Confirm no spike in `BAD_SIGNATURE` or `WEBHOOK_NOT_CONFIGURED` responses.

## Rollback

If live delivery fails after rotation:

1. Revert `STRIPE_WEBHOOK_SECRET` in Vercel to previous known-good value.
2. Redeploy immediately.
3. In Stripe, keep old secret active (or roll again and delay expiration) until deliveries recover.
4. Replay failed events from Stripe Dashboard after recovery.
5. Capture incident notes with exact timestamps and event IDs.

## Evidence to attach on AGN-633

- Timestamped Vercel deploy showing secret update.
- Screenshot/log of Stripe test event delivery = `2xx`.
- Output of malformed signature probe (`400`).
- Output of local webhook test command.
- Confirmation that replay queue is empty (or replay completed).
