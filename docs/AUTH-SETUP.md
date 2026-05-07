# Auth + Database Setup (Clerk + Supabase)

This doc tracks the env vars and one-time setup required for the user-account features (Watchlist Alerts, Referral Program, anonymous newsletter capture). Add these to `.env.local` for dev and to Vercel project settings + Railway worker for production.

## Required env vars

Append to `.env.local` (and Vercel + Railway envs):

```bash
# -- User accounts (Clerk) ---------------------------------------------------
# Dashboard: https://dashboard.clerk.com → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxx

# After wiring https://<domain>/api/webhooks/clerk in Clerk → Webhooks →
# Endpoints (subscribe to user.created, user.updated, user.deleted):
CLERK_WEBHOOK_SIGNING_SECRET=whsec_xxxxxxxxxxxx

# -- Supabase Postgres -------------------------------------------------------
# Provision at https://supabase.com → New Project (Pro tier $25/mo —
# free-tier 7-day-pause is unacceptable for production).
#
# DATABASE_URL  = Supavisor pooled, port 6543, transaction mode. Runtime.
# DIRECT_URL    = Unpooled :5432. drizzle-kit migrate/generate only.
#                 (PgBouncer transaction-mode breaks Drizzle migrations.)
DATABASE_URL=postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

# Reserved for future Supabase Storage/realtime — not used at runtime in
# v1 (we go direct via postgres-js + Drizzle).
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# -- Alert webhook + referral helpers ----------------------------------------
# Encrypts 24h plaintext-secret cache so dispatcher can re-sign payloads
# without bcrypt-decrypting per send. 32-byte base64.
WEBHOOK_SECRET_KEK=

# Permanent Discord invite link emailed at the "Founder Circle" milestone
# (25+ qualified referrals).
FOUNDER_DISCORD_INVITE=
```

## One-time setup steps

1. **Provision Supabase project** (Pro tier).
   - Pause-after-7d-inactivity on free tier will silently break production. Pro is mandatory.
   - In project settings → Connection → grab both pooled (`6543`) and direct (`5432`) URIs.
2. **Create Clerk application**.
   - In Clerk → API Keys, copy publishable + secret keys.
   - In Clerk → Webhooks → Endpoints → Add Endpoint:
     - URL: `https://<your-domain>/api/webhooks/clerk` (use `ngrok` URL during dev).
     - Subscribe to `user.created`, `user.updated`, `user.deleted`.
     - Copy the signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`.
3. **Generate the webhook KEK**: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` → set as `WEBHOOK_SECRET_KEK`.
4. **Run migrations** (locally first):
   ```bash
   npm run db:generate   # produces drizzle/<timestamp>_*.sql
   npm run db:migrate    # applies via DIRECT_URL
   ```
5. **Smoke test**:
   - `npm run dev` → boots without env errors.
   - `GET /you` → redirects to Clerk sign-in modal.
   - Sign up → within 5s, a row appears in `profiles` with the new `clerk_user_id`.
   - `GET /u/<generated-handle>` → renders public profile.

## Production checklist

- [ ] Vercel env vars set across Production / Preview / Development scopes.
- [ ] Railway worker env updated with `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (worker runs schedulers that touch the DB).
- [ ] DKIM/SPF/DMARC records on the sending domain (`alerts@trendingrepo.com` or wherever `EMAIL_FROM` points). Resend dashboard shows DNS verification status.
- [ ] Clerk webhook endpoint pointing at the live domain (NOT ngrok).
- [ ] `db:migrate` run against production `DIRECT_URL` once.

## Env var reference summary

| Var | Where set | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local`, Vercel (all scopes), Railway | Clerk SDK browser bootstrap |
| `CLERK_SECRET_KEY` | `.env.local`, Vercel (all scopes), Railway | Server-side Clerk |
| `CLERK_WEBHOOK_SIGNING_SECRET` | `.env.local`, Vercel | Svix HMAC for `/api/webhooks/clerk` |
| `DATABASE_URL` | `.env.local`, Vercel (all scopes), Railway | Supavisor pooled, runtime queries |
| `DIRECT_URL` | `.env.local`, GitHub Actions migrate job ONLY | Unpooled, drizzle-kit migrate only |
| `NEXT_PUBLIC_SUPABASE_URL` | reserved | Future Supabase Storage / realtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | reserved | Future browser-direct features |
| `SUPABASE_SERVICE_ROLE_KEY` | reserved | Future RLS-bypass server actions |
| `WEBHOOK_SECRET_KEK` | `.env.local`, Vercel | Encrypts 24h plaintext-secret cache |
| `FOUNDER_DISCORD_INVITE` | `.env.local`, Vercel | "Founder Circle" milestone email body |
