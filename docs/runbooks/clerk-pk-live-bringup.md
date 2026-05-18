# Runbook — Clerk live-key bringup

**When to use:** one-time, to flip TrendingRepo's Clerk integration from test keys (`pk_test_*` / `sk_test_*`) to live keys (`pk_live_*` / `sk_live_*`). Without this, the production `/sign-in` page shows "Auth unavailable" and no real signups are possible.

**Pre-reqs:**

- Clerk dashboard account exists, app provisioned, custom domain mapped (`auth.trendingrepo.com`).
- Vercel CLI authed (`vercel whoami` succeeds).
- All Stage 5 PRs merged. Doing it before would ship signup capability without a working revenue loop above it.

**Estimated time:** 15–20 minutes including verification.

## 1. Verify Clerk app is configured for production

In the Clerk dashboard:

1. Top-left dropdown → ensure you're on the **TrendingRepo (production)** instance (not the development one).
2. **Settings** → **API Keys**:
   - **Publishable key** — starts `pk_live_`
   - **Secret key** — starts `sk_live_`
3. **Settings** → **Domains**:
   - Custom domain: `auth.trendingrepo.com` (or whatever is configured)
   - Verify DNS records are propagated and Clerk shows ✅
4. **Webhooks** → confirm there's an endpoint at `https://trendingrepo.com/api/webhooks/clerk` with event types `user.created` + `user.updated` enabled, signing secret matches what's in `CLERK_WEBHOOK_SECRET` env.

If any of these aren't set up: Clerk's own docs at <https://clerk.com/docs/deployments/overview> walk through DNS + domain verification. That's outside this runbook's scope — return here once Clerk's dashboard shows the production instance fully configured.

## 2. Set Vercel env vars

```bash
vercel env add CLERK_PUBLISHABLE_KEY production
# Paste: pk_live_...

vercel env add CLERK_SECRET_KEY production
# Paste: sk_live_...

# If the webhook secret changed (it does when you re-create the endpoint):
vercel env rm CLERK_WEBHOOK_SECRET production
vercel env add CLERK_WEBHOOK_SECRET production
# Paste: whsec_... (from Clerk dashboard → Webhooks → click endpoint → reveal signing secret)
```

The code also reads `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (mirror of the secret-side `CLERK_PUBLISHABLE_KEY`) for the client-side bundle:

```bash
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
# Paste: same pk_live_... as above
```

Verify the four are set:

```bash
vercel env ls | grep CLERK_
# Expect 4 lines, all "production" environment.
```

## 3. Redeploy

```bash
vercel --prod --yes
# Note the deployment URL
```

The env vars are baked in at deploy time. Without a redeploy, the new keys are dormant.

## 4. Verify

### 4a. Page-level smoke

```bash
# Sign-in page should render the Clerk widget without "auth unavailable" banner
curl -sI https://trendingrepo.com/sign-in
# Expect: 200 (or 307/308 redirect to /sign-in/ — both fine)

# Open in a browser:
# https://trendingrepo.com/sign-in
# Expect: Clerk's hosted sign-in widget renders, with the TrendingRepo branding (if you uploaded a logo in Clerk).
# Expect: NO "Auth unavailable" / "Configuration error" message.
```

### 4b. End-to-end signup test

1. Use an email you control but haven't signed up with before (e.g., `yourname+e2e-2026-05-19@gmail.com`)
2. Visit `https://trendingrepo.com/sign-up`
3. Complete Clerk's signup flow (email verification step included)
4. Land back on `/you`
5. Verify in Clerk dashboard → **Users** that the user appears with status `Active`
6. Verify in TrendingRepo: the user has a row in `profiles` (you can check via a one-off admin endpoint or by hitting `/you/settings` and seeing the email — it should be the one you just signed up with)

### 4c. Welcome modal

The welcome modal (S2 / `WelcomeModal.tsx`) should appear on the first visit to `/` after signup. Cookie-gated (`sb_welcomed`, 90-day expiry).

### 4d. Webhook delivery

Clerk dashboard → **Webhooks** → click your endpoint → **Recent deliveries**. Each signup fires a `user.created` event. The endpoint should respond with 200 within 1s. If it 4xx's:

- 400 = signing secret mismatch — re-check step 2
- 401 = endpoint URL wrong — re-check Clerk dashboard's URL
- 5xx = handler crashed — `vercel logs --since 5m | grep "clerk webhook"`

## 5. Verify the post-signup email triggers (B.2 once merged)

If the Stage 5 B.2 PR is merged (day-1 welcome email), the Clerk `user.created` webhook should also enqueue an email. Verify:

```bash
# From the operator side:
# Wait ~5 min after the test signup, then check Resend dashboard for a sent email to <e2e-email>.
# Subject: "You're in. Catch breakouts before they're cold."
```

If the email didn't send, check:
- `vercel logs --since 10m | grep welcome-email`
- Resend dashboard → API logs

## 6. Update operator log

```bash
echo "$(date -u +%FT%TZ): Clerk live keys enabled; e2e signup test passed; user $E2E_USER provisioned." >> docs/OPERATOR.md
git add docs/OPERATOR.md
git commit -m "docs(operator): clerk live key bringup complete"
git push
```

## Rollback

If something breaks (signup flow regresses, users can't log in):

```bash
# Restore test keys (signups still possible but only with Clerk test instance)
vercel env rm CLERK_PUBLISHABLE_KEY production
vercel env add CLERK_PUBLISHABLE_KEY production
# Paste: pk_test_...

vercel env rm CLERK_SECRET_KEY production
vercel env add CLERK_SECRET_KEY production
# Paste: sk_test_...

vercel env rm NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
# Paste: pk_test_...

vercel --prod --yes
```

This will reverse-revert the change. Real-money signups will stop, but the app stays online.

If the issue is webhook-only (signups work, profile rows don't get created), check the webhook secret rather than rolling back keys.

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| "Auth unavailable" banner persists after redeploy | Env vars set on wrong environment (Preview not Production) | `vercel env ls` — verify each row says `production` |
| Sign-in widget renders but signup fails with "Verification email not sent" | Clerk's email provider not configured for prod (or DNS for `auth.trendingrepo.com` not propagated) | Clerk dashboard → **Settings** → **Email Provider**. Default uses Clerk's mail; for higher deliverability, configure Resend/SendGrid here. |
| User signs up but `profiles` row never appears | Clerk webhook 4xx'ing (check Clerk dashboard) | Re-check `CLERK_WEBHOOK_SECRET` in Vercel matches the signing secret shown in Clerk |
| Profile row created but `email` field is empty | Clerk webhook payload format changed | `vercel logs` for the webhook handler; check `src/app/api/webhooks/clerk/route.ts` for how it parses `user.created` |
| `/you` page redirects to sign-in even after successful signup | Cookie/session mismatch | Open browser devtools → Application → Cookies; verify Clerk session cookie is set on `.trendingrepo.com`. Common cause: Clerk app's "Frontend API URL" doesn't match the deployed origin. |

## What this runbook does NOT cover

- Configuring OAuth providers (Google, GitHub) in Clerk — separate dashboard task, not blocking sign-up
- Custom branding inside Clerk's hosted widget — purely aesthetic, do after revenue starts
- MFA enforcement — Clerk supports it; defaults are fine for v1
- Sub-orgs / multi-tenant — TrendingRepo isn't multi-tenant; ignore Clerk's organization features

## Cross-reference

- [Stripe live-mode bringup](./stripe-live-mode-bringup.md) — sister bringup; checkout requires signup to actually work
- [Refund runbook](./refund-30-day.md) — when a real user wants their money back, you'll need this too
