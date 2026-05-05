---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# Encryption-at-Rest Verification

Last verified: 2026-05-05 (Asia/Makassar)
Issue: AGN-666 ([HARD-19] Encryption-at-rest verification - Railway Redis + Vercel KV)
Owner: Release SRE

## Scope
- Production Redis backing STARSCREENER data-store (Railway service)
- Vercel project storage posture related to legacy Vercel KV

## Runtime verdict
- Active runtime data-store backend: Railway Redis via `REDIS_URL`.
- Vercel KV: not in active use in this repo/runtime and product is sunset.
- Encryption-at-rest verdict:
  - Railway: VERIFIED via Railway employee support response (platform-wide encryption at rest statement).
  - Vercel: VERIFIED for environment variables/data secrets at rest by Vercel docs.

## Evidence captured in this verification
1. Local code-path verification (repo)
- `src/lib/data-store.ts` selects backend by URL scheme (`redis://` / `rediss://` => ioredis path; `https://` => Upstash REST).
- `apps/trendingrepo-worker/src/lib/redis.ts` uses `REDIS_URL` for ioredis when present.
- Repo grep confirms no active Vercel KV integration (`@vercel/kv`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` absent).

2. Live platform checks (2026-05-05)
- `railway status` shows production worker service: `trendingrepo-worker` in project `starscreener`.
- `vercel env ls` (scoped by `.vercel/project.json`) shows `REDIS_URL` configured for Production.
- `npm run freshness:check` result in this heartbeat: localhost:3023 unreachable (non-blocking for this doc verdict; recorded for release context).

3. Provider-side attestations
- Railway support response (employee statement):
  - https://station.railway.com/questions/postgres-question-075dee9d
  - Key line: "Yep there is encryption at rest, not specific to just databases."
- Vercel environment variable encryption-at-rest docs:
  - https://vercel.com/docs/projects/environment-variables
  - https://vercel.com/docs/environment-variables/managing-environment-variables
- Vercel KV sunset confirmation:
  - https://vercel.com/changelog/vercel-kv
  - https://vercel.com/kv

## Operational interpretation for STARSCREENER
- The production data-store path in use is Railway Redis, not Vercel KV.
- For this project's configured secrets and runtime environment vars on Vercel, encryption at rest is documented by Vercel.
- Vercel KV migration action is not required because KV is sunset and no active KV bindings are present.

## Re-verification checklist (for future heartbeats)
1. Re-run:
   - `railway status`
   - `vercel env ls` (with `.vercel/project.json` org/project ids loaded)
   - `rg -n "@vercel/kv|KV_REST_API_URL|KV_REST_API_TOKEN" -S src scripts .github package.json`
2. Confirm provider docs/support links above are still reachable.
3. If Railway publishes an official security/compliance page with explicit encryption-at-rest language, replace the support-thread citation with that primary source.
