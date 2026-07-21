# Runbook — Clerk live-key bringup

> **PRODUCTION IS HOSTUP + CLOUDFLARE, NOT VERCEL.** Do NOT run any `vercel`
> command against this app — the Vercel project `starscreener` is paused and
> Git-disconnected by policy. App env lives in `/opt/trendingrepo/.env.production`
> on the HOSTUP box (`ssh toolbox`); deploys follow
> [DEPLOY-TOOLBOX.md](../DEPLOY-TOOLBOX.md). This runbook was de-Vercel'd
> 2026-07-20; earlier revisions instructed a Vercel live-key deploy — ignore any
> you find in git history.

**When to use:** one-time, to flip TrendingRepo's Clerk integration from test
keys (`pk_test_*` / `sk_test_*`) to live keys (`pk_live_*` / `sk_live_*`).
Without this, production `/sign-in` shows "Auth unavailable" and no real signups
are possible.

**Pre-reqs:**

- Clerk dashboard account exists, app provisioned, custom domain mapped (`clerk.trendingrepo.com`).
- `ssh toolbox` reaches the HOSTUP box.
- All revenue-path PRs merged. Doing it before would ship signup capability without a working revenue loop above it.

**Canonical env-var names (what the CODE actually reads):**

| Purpose | Env var | Notes |
|---|---|---|
| Client publishable key | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_*`. The ONLY publishable-key name the bundle reads — there is no `CLERK_PUBLISHABLE_KEY`. |
| Server secret key | `CLERK_SECRET_KEY` | `sk_live_*` |
| Webhook signing secret | `CLERK_WEBHOOK_SIGNING_SECRET` | `whsec_*`. **Not** `CLERK_WEBHOOK_SECRET` — that name is dead. |

## 1. Verify the Clerk app is configured for production

In the Clerk dashboard:

1. Top-left dropdown → ensure you're on the **TrendingRepo (production)** instance.
2. **Settings → API Keys**: Publishable key starts `pk_live_`, Secret key starts `sk_live_`.
3. **Settings → Domains**: custom domain `clerk.trendingrepo.com` verified (✅), DNS propagated.
4. **Webhooks** → confirm an endpoint at `https://trendingrepo.com/api/webhooks/clerk`
   with **`user.created`, `user.updated`, `user.deleted`, `session.created`**
   enabled (these are the events the handler processes). Its signing secret must
   match `CLERK_WEBHOOK_SIGNING_SECRET`.
   > Known gap: the handler does not yet process `session.removed`/`session.revoked`,
   > and the `user.deleted` cascade does not scrub tiers/watchlists. Server-side
   > sign-out safety is instead enforced by `resolveUserPrincipal` re-checking
   > live Clerk on paid routes — see the auth repair handoff.

## 2. Set the HOSTUP env vars

Edit `/opt/trendingrepo/.env.production` on the box (never commit real keys):

```bash
ssh toolbox
sudo -e /opt/trendingrepo/.env.production   # or your editor of choice
# Set / update:
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
#   CLERK_SECRET_KEY=sk_live_...
#   CLERK_WEBHOOK_SIGNING_SECRET=whsec_...     (from Clerk → Webhooks → reveal signing secret)
grep -E '^(NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY|CLERK_SECRET_KEY|CLERK_WEBHOOK_SIGNING_SECRET)=' \
  /opt/trendingrepo/.env.production   # confirm all three present (values will show — you're on the box)
```

## 3. Redeploy

Follow [DEPLOY-TOOLBOX.md](../DEPLOY-TOOLBOX.md) — the app reads the env file at
container start, so the new keys are dormant until the container is recreated
(retag `:current-prod` + `docker compose up -d --force-recreate` at
`/opt/trendingrepo`). Migrations, if any are pending, apply **before** the new
image goes live (see the deploy runbook's migration gate).

## 4. Verify

### 4a. Page-level smoke
```bash
curl -sI https://trendingrepo.com/sign-in   # 200 (or 307/308 to /sign-in/)
# Browser: https://trendingrepo.com/sign-in renders the Clerk widget, NO "Auth unavailable".
```

### 4b. End-to-end signup test
1. Use a fresh email you control (e.g. `you+e2e-<date>@gmail.com`).
2. Complete signup at `https://trendingrepo.com/sign-up` (email verification included).
3. Clerk dashboard → **Users** shows the user `Active`.
4. TrendingRepo: the user has a `tr.profiles` row (check `/account` shows the signed-up email, or query the DB).

### 4c. Webhook delivery
Clerk dashboard → **Webhooks** → endpoint → **Recent deliveries**. Each signup
fires `user.created`; expect a 200 within ~1s. If it 4xx/5xx's:
- 400 = signing secret mismatch → re-check `CLERK_WEBHOOK_SIGNING_SECRET` (step 2).
- 401 = wrong endpoint URL → re-check the Clerk dashboard URL.
- 5xx = handler crashed → `ssh toolbox 'docker logs --since 5m trendingrepo | grep -i clerk'`.

## 5. Operator readiness check
```bash
# Redacted auth/billing/DB readiness (no secret values printed):
curl -s https://trendingrepo.com/api/ready | jq .auth
```

## Rollback

Restore test keys in `/opt/trendingrepo/.env.production`
(`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...`, `CLERK_SECRET_KEY=sk_test_...`,
`CLERK_WEBHOOK_SIGNING_SECRET=whsec_...` for the test endpoint) and redeploy per
DEPLOY-TOOLBOX.md. Real-money signups stop; the app stays online. If the issue is
webhook-only (signups work, profile rows don't), fix the signing secret rather
than rolling back keys.

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| "Auth unavailable" persists after redeploy | Env not applied / container not recreated | Confirm the three vars in `/opt/trendingrepo/.env.production`, then `up -d --force-recreate`. |
| Signup fails "verification email not sent" | Clerk email provider not configured for prod, or `clerk.*` DNS not propagated | Clerk → Settings → Email Provider; verify Cloudflare DNS. |
| User signs up but `tr.profiles` row never appears | Clerk webhook 4xx'ing | Re-check `CLERK_WEBHOOK_SIGNING_SECRET` matches the endpoint's signing secret. |
| `/account` redirects to sign-in after signup | Clerk session cookie not set on `.trendingrepo.com` | Clerk "Frontend API URL" must match the deployed origin. |

## Cross-reference
- [Stripe live-mode bringup](./stripe-live-mode-bringup.md) — sister bringup.
- [Refund runbook](./refund-30-day.md).
- [DEPLOY-TOOLBOX.md](../DEPLOY-TOOLBOX.md) — the actual HOSTUP deploy + migration gate.
