# RUNBOOK — Secret rotation (quarterly cadence)

**Owner**: operator (Kermit457)
**Cadence**: quarterly (Jan / Apr / Jul / Oct, first week)
**Scope**: production secrets used by the Vercel app (`trendingrepo.com`), the Railway worker (`apps/trendingrepo-worker`), and the GitHub Actions cron fleet (62 workflows, see [`ENGINE.md`](./ENGINE.md)).

This runbook is the **only** source of truth for "how do I rotate X without taking the engine down". When a secret is added, expanded into a pool, or moved between providers, update this file in the same PR.

For where secrets are *consumed* in code, cross-reference [`ENGINE.md` §3](./ENGINE.md#3-external-integrations-registry).

---

## Universal rotation principles

1. **Overlap, never cut over.** Always provision the new credential alongside the old, deploy the consumers, verify, then revoke the old one. No "delete-then-create" — that's an outage.
2. **Rotate one secret per session.** Multiple-rotation sessions create cross-failure ambiguity ("which one broke?"). One-at-a-time keeps the blast radius small.
3. **Never put a secret in `.env.local`, a commit, a screenshot, or a Slack message.** The only acceptable transports are: provider dashboard → password manager → provider env UI / `gh secret set` / `vercel env add` / `railway variables set`.
4. **After every rotation, fire a manual cron of the consumer workflow** (see Verify steps per secret). If the workflow goes red within one cycle, roll back to the old value (still live during the overlap window) and investigate.
5. **Pool-aware secrets** (`GH_TOKEN_POOL`, `PRODUCTHUNT_TOKENS`, `DEVTO_API_KEYS`) rotate one slot at a time — the pool keeps serving from the surviving slots while you swap.

---

## Secret matrix (TL;DR)

| Secret | Lane | Vercel | Railway | GH Actions | Pool? |
|---|---|---|---|---|---|
| `GH_TOKEN_POOL` (+ `GITHUB_TOKEN` slot 0) | runtime + worker + cron | ✅ | ✅ | ✅ (+ `gh` PAT in cron-only secrets) | ✅ multi-PAT, see §1 |
| `APIFY_API_TOKEN` | cron + worker | ❌ | ✅ | ✅ | ❌ single |
| `CRON_SECRET` | runtime (HTTP cron auth) | ✅ | ❌ | ✅ (consumers) | ❌ single |
| `BLUESKY_HANDLE` + `BLUESKY_APP_PASSWORD` | cron | ❌ | ❌ | ✅ | ❌ single bot acct |
| `PRODUCTHUNT_TOKEN` (+ `PRODUCTHUNT_TOKENS`) | cron | ❌ | ❌ | ✅ | ✅ multi-key |
| `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | cron | ❌ | ❌ | ✅ | ❌ single OAuth app |
| `SENTRY_AUTH_TOKEN` | runtime + worker + CI release | ✅ | ✅ | ✅ (release jobs) | ❌ single |

Legend: ✅ = configured here, ❌ = not used in this lane.

---

## 1. `GH_TOKEN_POOL` (+ `GITHUB_TOKEN` slot 0)

### Where it is used
- **App (Vercel runtime)**: every request that touches GitHub goes through the singleton pool at [`src/lib/github-token-pool.ts`](../src/lib/github-token-pool.ts). 6 direct callers (see [`ENGINE.md` §3a](./ENGINE.md#3a-github-the-core-engine)). `/compare` is the heaviest single consumer (7 endpoints/request).
- **Worker (Railway, `apps/trendingrepo-worker`)**: reads `process.env.GITHUB_TOKEN` (currently single-token; pool migration is Tier 2 in `ENGINE.md` §6). If Railway's `GITHUB_TOKEN` is the same PAT as Vercel slot 0, calls double-bill that PAT — see "Avoiding double-bill" below.
- **GitHub Actions cron**: 11 scripts under `scripts/` use `process.env.GITHUB_TOKEN` directly (intentionally exempt from `lint:bypass`; see [`scripts/check-no-pool-bypass.mjs`](../scripts/check-no-pool-bypass.mjs)). Each cron workflow gets its own PAT in repo secrets.

### Where it is configured
| Lane | Var name | Format | Set via |
|---|---|---|---|
| Vercel (production) | `GITHUB_TOKEN` (slot 0) + `GH_TOKEN_POOL` (CSV of additional PATs) | `ghp_...` (classic) or `github_pat_...` (fine-grained) | Vercel dashboard → Project → Settings → Environment Variables (`Production`) |
| Railway worker | `GITHUB_TOKEN` (single) | same | Railway dashboard → service → Variables |
| GH Actions cron | `GITHUB_TOKEN` (per-workflow PAT, ≠ runtime tokens) | same | `gh secret set GITHUB_TOKEN --repo Kermit457/STARSCREENER --body <PAT>` |

### How to generate a new value
1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → `Generate new token`.
2. **Resource owner**: `Kermit457` (or the GitHub org if the engine is later moved).
3. **Repository access**: `Public Repositories (read-only)` is enough for ingest. For cron workflows that push (`scripts/_data-store-write.mjs`-driven jobs), the **CI-only PAT** needs `Repository permissions → Contents: Read and write` on `Kermit457/STARSCREENER`.
4. **Account permissions**: none.
5. **Expiration**: 90 days (matches quarterly cadence, forces the rotation).
6. Copy the token immediately into the password manager — GitHub only shows it once.

### How to rotate without downtime (overlap window)
The pool is a CSV — adding a slot is non-destructive.

1. **Add the new PAT as a new slot.** Don't replace the old one.
   - Vercel: edit `GH_TOKEN_POOL`, append `,ghp_NEWTOKEN`. Save → Vercel auto-redeploys production.
   - Railway worker: if migrating to a new PAT for the worker, set `GITHUB_TOKEN_NEW` first, deploy, then swap; the worker is still single-token until Tier 2 lands.
   - Cron PAT: `gh secret set GITHUB_TOKEN_NEW --body <PAT>`. Update one workflow at a time to read `${{ secrets.GITHUB_TOKEN_NEW }}` (or just leave the workflow on the old name and rotate the value at step 4).
2. **Wait for the next deploy + one full cron cycle** (≤ 1 hour given the 27-past-the-hour `scrape-trending` heartbeat).
3. **Verify** (see below). The pool's smart selection (`highest remaining first`) will start using the fresh PAT first because it has the full 5,000/hr quota.
4. **Remove the old slot** from the CSV (or swap the cron PAT value), redeploy.
5. **Revoke the old PAT** in GitHub → Settings → Developer settings → token list → `Revoke`. Don't skip — an unrevoked old token is a credential leak waiting to happen.

### Avoiding double-bill (worker + Vercel sharing a PAT)
When provisioning, **the worker PAT MUST be different from any PAT in Vercel `GH_TOKEN_POOL`**. Otherwise Railway and Vercel share quota on the same PAT and you'll see phantom 403s under load. Confirm with `/admin/pool-aggregate` (see Verify) — distinct token labels per process.

### How to verify the new value is active
1. **App**: hit `https://trendingrepo.com/admin/pool` (cookie-auth). Expected: the new PAT label appears with `remaining ~5000`. The old PAT (still in pool during overlap) should also be listed.
2. **Fleet view**: hit `/admin/pool-aggregate` → confirms ≥1 lambda saw the new token after a recent request.
3. **Worker**: in Railway, run `railway logs --service trendingrepo-worker` and trigger a manual fetcher run. Look for absence of `401 Unauthorized` and presence of `X-RateLimit-Remaining: 5000` (or near it) on first call.
4. **Cron**: `gh workflow run scrape-trending.yml --ref main`, then `gh run watch`. Workflow goes green = PAT works.
5. **Post-revoke check**: after step 5, hit `/admin/pool` again — old PAT label should be gone or quarantined.

---

## 2. `APIFY_API_TOKEN`

### Where it is used
- **Cron**: [`scripts/_apify-twitter-provider.ts`](../scripts/_apify-twitter-provider.ts), driven by `.github/workflows/collect-twitter.yml` every 3h. The `apidojo~tweet-scraper` actor runs 4 query templates per tracked repo per scan.
- **Worker (Railway)**: optional Apify-proxied Reddit fetcher (`apps/trendingrepo-worker` consumers).
- **App**: not used (Vercel runtime never calls Apify directly).

### Where it is configured
| Lane | Var name | Set via |
|---|---|---|
| GH Actions cron | `APIFY_API_TOKEN` (+ `APIFY_TWITTER_ACTOR`, `APIFY_PROXY_GROUPS`, `APIFY_PROXY_COUNTRY`) | `gh secret set APIFY_API_TOKEN --body <token>` |
| Railway worker | same name | Railway → Variables |

### How to generate a new value
1. Log in to [console.apify.com](https://console.apify.com).
2. Settings → Integrations → **API & Integrations** → `Personal API tokens` → **Create new token**.
3. Label: `STARSCREENER cron <yyyy-mm>`. No scope toggles — Apify tokens are account-wide.
4. Copy the token. The old token is still valid until you revoke it.

### How to rotate without downtime (overlap window)
Single-token service — overlap is via a temporary alias, not a true pool.

1. `gh secret set APIFY_API_TOKEN_NEW --body <new_token>` (cron repo secrets).
2. In `.github/workflows/collect-twitter.yml`, temporarily add the new env on the Apify step (read both, prefer NEW):
   ```yaml
   env:
     APIFY_API_TOKEN: ${{ secrets.APIFY_API_TOKEN_NEW || secrets.APIFY_API_TOKEN }}
   ```
3. Update Railway: add `APIFY_API_TOKEN_NEW`, deploy worker, observe one Reddit-via-Apify run.
4. **Wait 3h** (one `collect-twitter` cron) — verify success in the Apify console run history.
5. Promote: `gh secret set APIFY_API_TOKEN --body <new_token>`, then drop the `_NEW` alias from the workflow + Railway.
6. **Revoke old token** in the Apify console → `Personal API tokens` → trash icon.

### How to verify the new value is active
1. Apify console → **Runs** tab → confirm the most recent `apidojo~tweet-scraper` run is green and used the new token (token ID is in the run's `Inputs/Outputs` → `Run options` panel).
2. Manual cron trigger: `gh workflow run collect-twitter.yml`. Watch with `gh run watch`. The workflow auto-commits `.data/twitter-*.jsonl` if the run produced data — `git log -1 --name-only` should show new lines.
3. App-side sanity: `/twitter` page should show a fresh "scanned X minutes ago" timestamp after Vercel revalidates (ISR 30 min or first navigation).

---

## 3. `CRON_SECRET`

### Where it is used
- **App (Vercel runtime)**: every HTTP cron handler under `src/app/api/cron/*` checks `Authorization: Bearer ${CRON_SECRET}` before doing anything. Without it, returns 401 — the engine goes silent.
- **GH Actions cron**: workflows that hit `https://trendingrepo.com/api/cron/*` send the bearer header. Examples: `cron-freshness-check.yml`, `cron-llm.yml`, `cron-pipeline-ingest.yml`, `cron-aiso-drain.yml`, `cron-webhooks-flush.yml`, `cron-pipeline-persist.yml`, `cron-twitter-outbound.yml`, `cron-pipeline-cleanup.yml`, `cron-pipeline-rebuild.yml`, `cron-predictions.yml`, `cron-digest-weekly.yml`, `cron-agent-commerce.yml`.
- **Worker**: not used.

### Where it is configured
| Lane | Var name | Set via |
|---|---|---|
| Vercel | `CRON_SECRET` | Vercel dashboard → Production env |
| GH Actions | `CRON_SECRET` | `gh secret set CRON_SECRET --body <value>` |

### How to generate a new value
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 64-char hex, e.g. a1b2c3...
```
No external provider — this is a shared secret only the operator + the two lanes need to know.

### How to rotate without downtime (overlap window)
The route handlers must accept BOTH old + new during the window.

1. **Generate** new value, save to password manager.
2. **Vercel**: add a SECOND env `CRON_SECRET_NEXT` = new value. Don't touch `CRON_SECRET` yet.
3. **Update [`src/lib/cron-auth.ts`](../src/lib/cron-auth.ts)** (or the equivalent guard) to accept either:
   ```ts
   const valid = [process.env.CRON_SECRET, process.env.CRON_SECRET_NEXT].filter(Boolean);
   if (!valid.includes(token)) return new Response("unauthorized", { status: 401 });
   ```
   Commit + Vercel deploy. Verify `/api/cron/freshness-check` still 200s with the OLD secret (`curl -H "Authorization: Bearer $OLD"`).
4. **GH Actions**: `gh secret set CRON_SECRET --body <new_value>`. Workflows now send the new value; Vercel still accepts both.
5. **Wait one full cron cycle** (15 min — `cron-freshness-check.yml` runs every 15 min). Confirm none of the cron workflows turned red: `gh run list --limit 30 --json status,workflowName | jq '.[] | select(.workflowName | startswith("cron-"))'`.
6. **Promote**: in Vercel, set `CRON_SECRET` = new value, remove `CRON_SECRET_NEXT`. Redeploy.
7. **Remove the dual-accept code** in `cron-auth.ts` (revert step 3). Commit.

### How to verify the new value is active
1. Manual probe with the NEW secret:
   ```bash
   curl -i -H "Authorization: Bearer $NEW_CRON_SECRET" https://trendingrepo.com/api/cron/freshness-check
   ```
   Expect `200 OK` with a JSON body, not `401`.
2. Same probe with the OLD secret AFTER step 7: expect `401`. If it still returns `200`, the dual-accept revert didn't deploy.
3. `gh run list --workflow=cron-freshness-check.yml --limit 5` → all green.

---

## 4. `BLUESKY_HANDLE` + `BLUESKY_APP_PASSWORD`

### Where it is used
- **Cron**: `.github/workflows/scrape-bluesky.yml` (hourly at `:17`) → [`scripts/scrape-bluesky.mjs`](../scripts/scrape-bluesky.mjs). Authenticates via `bsky.social/xrpc/com.atproto.server.createSession`.
- **App**: not used.
- **Worker**: not used.

### Where it is configured
| Lane | Var name | Set via |
|---|---|---|
| GH Actions | `BLUESKY_HANDLE` (e.g. `trendingrepo.bsky.social`) + `BLUESKY_APP_PASSWORD` | `gh secret set BLUESKY_APP_PASSWORD --body <password>` |

### How to generate a new value
**App passwords** — never use the account's main password.

1. Log in to [bsky.app](https://bsky.app) as the bot account (handle in `BLUESKY_HANDLE`).
2. Settings → **Privacy and security** → **App passwords** → `Add app password`.
3. Name: `STARSCREENER scrape <yyyy-mm>`.
4. Bluesky shows the password ONCE (format `xxxx-xxxx-xxxx-xxxx`). Copy to password manager.
5. Don't delete the old app password yet.

### How to rotate without downtime (overlap window)
Single bot account → no real pool. Use a temporary alias secret.

1. `gh secret set BLUESKY_APP_PASSWORD_NEW --body <xxxx-xxxx-xxxx-xxxx>`.
2. Patch `.github/workflows/scrape-bluesky.yml` to prefer `_NEW`:
   ```yaml
   env:
     BLUESKY_APP_PASSWORD: ${{ secrets.BLUESKY_APP_PASSWORD_NEW || secrets.BLUESKY_APP_PASSWORD }}
   ```
3. Manual fire: `gh workflow run scrape-bluesky.yml`. Wait, then `gh run watch`. Green = new password works.
4. Promote: `gh secret set BLUESKY_APP_PASSWORD --body <new_value>`. Remove the `_NEW` alias from the workflow.
5. **Revoke the old app password** in Bluesky settings → app passwords → trash icon.

### How to verify the new value is active
1. The cron run posts to `data/bluesky-*` files; check the most recent commit author + timestamp:
   ```bash
   git log -1 --pretty=format:"%h %s %ci" -- data/bluesky-trending.json
   ```
2. The site `/bluesky` (or whatever Bluesky surface exists) should show a fresh timestamp.
3. If the workflow turns red with `XRPCNotSupported` or `AuthFactorTokenRequired` — the bot account has 2FA on. Disable 2FA on the bot account or use a fresh app password regenerated AFTER enabling.

---

## 5. `PRODUCTHUNT_TOKEN` (+ `PRODUCTHUNT_TOKENS`)

### Where it is used
- **Cron**: [`scripts/scrape-producthunt.mjs`](../scripts/scrape-producthunt.mjs), driven by `.github/workflows/scrape-producthunt.yml` 4×/day at `0 11,15,19,23 * * *` (PT-launch-aligned).
- **Pool-aware**: `loadProducthuntTokens` round-robins via `_phCursor`. Per-token quota: ~6,250 req / 15-min window (PH GraphQL).
- **App**: not used.
- **Worker**: not used.

### Where it is configured
| Lane | Var name | Format | Set via |
|---|---|---|---|
| GH Actions | `PRODUCTHUNT_TOKEN` (single fallback) + `PRODUCTHUNT_TOKENS` (CSV multi-key) | `Bearer`-eligible OAuth access token | `gh secret set PRODUCTHUNT_TOKENS --body "<tok1>,<tok2>"` |

### How to generate a new value
ProductHunt requires an OAuth app per token.

1. Log in to [producthunt.com](https://www.producthunt.com), then go to [API dashboard](https://www.producthunt.com/v2/oauth/applications).
2. Create a new application (or re-use an existing one for slot 0). Name: `STARSCREENER cron <slot> <yyyy-mm>`.
3. Generate a **Developer Token** (server-to-server access). Copy it.
4. Repeat for additional slots if scaling pool size.

### How to rotate without downtime (overlap window)
Pool semantics → rotate one slot at a time, like `GH_TOKEN_POOL`.

1. **Add** the new token as a new CSV slot:
   ```bash
   gh secret set PRODUCTHUNT_TOKENS --body "<existing_tok1>,<existing_tok2>,<new_tok>"
   ```
2. Manual fire: `gh workflow run scrape-producthunt.yml`. Confirm green.
3. **Drop** the slot you're retiring:
   ```bash
   gh secret set PRODUCTHUNT_TOKENS --body "<existing_tok2>,<new_tok>"
   ```
4. **Revoke the old token** at the ProductHunt OAuth dashboard.
5. If only `PRODUCTHUNT_TOKEN` (single fallback) is used, follow the alias-pattern from §4 (`PRODUCTHUNT_TOKEN_NEW` → promote → revoke).

### How to verify the new value is active
1. Workflow run logs (`gh run view --log` on the latest scrape-producthunt run) should show post counts >0 and no `401 Unauthorized` from `api.producthunt.com/v2/api/graphql`.
2. `data/producthunt-launches.json` modification time should be within the last 6h.
3. The site `/producthunt` (or PT panel on `/`) shows fresh launch entries.

---

## 6. `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET`

### Where it is used
- **Cron**: hourly via `.github/workflows/scrape-trending.yml` (Reddit is one of the source-fetchers in the trending sweep) and `.github/workflows/probe-reddit.yml` (manual). OAuth app credentials → token exchange against `oauth.reddit.com`.
- **App**: not used.
- **Worker**: not used (Reddit fetching is cron-only as of 2026-05).

### Where it is configured
| Lane | Var name | Set via |
|---|---|---|
| GH Actions | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | `gh secret set REDDIT_CLIENT_SECRET --body <value>` |

`REDDIT_USER_AGENT` should be something like `STARSCREENER/1.0 (+https://trendingrepo.com)` — Reddit enforces this and bans default UAs.

### How to generate a new value
Reddit doesn't rotate `client_secret` in place — you regenerate it on the existing app.

1. Log in to [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) as the bot Reddit account.
2. Find the existing `STARSCREENER` app → click `edit`.
3. Click **`generate new secret`**. Reddit shows the new secret immediately AND keeps the old one valid for ~10 minutes (Reddit's grace window — undocumented but observed).
4. Copy the new secret to the password manager. Note: `REDDIT_CLIENT_ID` does NOT change unless you create a brand-new app.

### How to rotate without downtime (overlap window)
The 10-minute grace window IS your overlap.

1. Click **generate new secret** in Reddit's app settings (start a 10-min timer mentally).
2. Immediately: `gh secret set REDDIT_CLIENT_SECRET --body <new_value>`.
3. Manually fire `gh workflow run scrape-trending.yml --ref main`. Watch with `gh run watch` — Reddit step should pass within 2-3 min.
4. If it fails due to a stuck token cache, fire `gh workflow run probe-reddit.yml` to force a fresh OAuth exchange.
5. After the green run, the rotation is complete. The old secret is auto-invalidated by Reddit shortly.

### How to verify the new value is active
1. `gh run list --workflow=scrape-trending.yml --limit 3` → most recent run is green.
2. `data/reddit-*` (or whichever Reddit-surface payload exists) modification time recent.
3. Cron workflow logs should show successful POST to `https://www.reddit.com/api/v1/access_token` (status 200, returns `{ "access_token": "...", "token_type": "bearer" }`).
4. If you see `401 Unauthorized` repeatedly: the bot account got banned/suspended (separate problem, not a secret issue) — log in to the account on the web to confirm.

---

## 7. `SENTRY_AUTH_TOKEN`

### Where it is used
- **App (Vercel runtime + build)**: source map upload during `next build` via `@sentry/nextjs` integration. Org: `agnt-pf` (EU `de.sentry.io`), project id `4511285393686608` (per [memory note](../.claude/projects/c--Users-mirko-OneDrive-Desktop-STARSCREENER/memory/project_sentry_agnt_pf.md)).
- **Worker (Railway)**: error reporting at runtime via `@sentry/node`.
- **GH Actions release jobs**: `sentry-fix-bot.yml` and any release-tracking workflow uses it to create releases / attach commits.

### Where it is configured
| Lane | Var name | Set via |
|---|---|---|
| Vercel | `SENTRY_AUTH_TOKEN` (build-time + optional runtime) | Vercel dashboard → Production env |
| Railway | `SENTRY_AUTH_TOKEN` (runtime DSN doesn't need it; auth-token is for releases) + `SENTRY_DSN` | Railway → Variables |
| GH Actions | `SENTRY_AUTH_TOKEN` | `gh secret set SENTRY_AUTH_TOKEN --body <token>` |

Note: `SENTRY_DSN` is a separate, public-ish identifier and rotates only when projects are recreated. This runbook covers `SENTRY_AUTH_TOKEN` only.

### How to generate a new value
Use **Internal Integration** tokens — they survive user departures.

1. Log in to [`agnt-pf.de.sentry.io`](https://agnt-pf.de.sentry.io).
2. Settings → **Custom Integrations** → existing `STARSCREENER` integration → **Tokens** → `Create Token`.
3. Required scopes: `project:releases`, `org:read`. (For source map upload, that's enough.)
4. Copy the token (format `sntrys_…`). Old token still valid until explicitly deleted.

If you don't have an internal integration set up: Settings → **Account** → **API** → **Auth Tokens** is the per-user fallback (worse — dies when the user leaves).

### How to rotate without downtime (overlap window)
Sentry doesn't have a pool concept — single token at a time, but the old one stays valid until you delete it on the Sentry side, so you have unlimited overlap.

1. Generate the new token (above).
2. Update Vercel env `SENTRY_AUTH_TOKEN` → new value. Trigger a redeploy (`vercel deploy --prod` is operator-only; usually a `main` push will auto-deploy, but for this rotation just edit the env and let Vercel rebuild).
3. Update Railway env `SENTRY_AUTH_TOKEN` → new value. Railway auto-restarts the worker.
4. Update GH Actions: `gh secret set SENTRY_AUTH_TOKEN --body <new>`.
5. Trigger a manual build / release flow to confirm (e.g. push a no-op commit, or `gh workflow run ci.yml`).
6. **Delete the old token** in Sentry → Custom Integrations → Tokens → `Delete`.

### How to verify the new value is active
1. Vercel build log (latest production deploy) shows `Source maps uploaded successfully to Sentry` (or similar from `@sentry/nextjs/cli`).
2. In `agnt-pf.de.sentry.io` → project `trendingrepo-worker` → **Releases** → newest release matches the latest commit SHA.
3. Worker side: `railway logs --service trendingrepo-worker | grep -i sentry` should show no `401` or `403` from the Sentry SDK on startup.

---

## Pre-rotation checklist (apply to every secret)

- [ ] Old value backed up to password manager (rollback path exists)
- [ ] New value generated and tested in a sandbox/manual workflow first
- [ ] Operator has uninterrupted ~30 min for the rotation (no parallel deploys)
- [ ] No active incident in `#starscreener-alerts` (don't rotate during a live SEV)
- [ ] Plan for the verify step is loaded (terminal open, dashboards bookmarked)

## Post-rotation checklist

- [ ] Old credential REVOKED at the provider (not just removed from env)
- [ ] One full cron cycle observed green for the affected workflow(s)
- [ ] Operator situational-awareness doc ([`docs/OPERATOR.md`](./OPERATOR.md)) updated if the rotation changed something visible (e.g. pool size grew)
- [ ] Quarterly tracker line item appended at the bottom of this file

---

## Quarterly rotation log

Append one line per rotation. Keeps an audit trail without spinning up a separate doc.

| Date (UTC) | Secret | Operator | Notes |
|---|---|---|---|
| _yyyy-mm-dd_ | _e.g. `GH_TOKEN_POOL` slot 2_ | Kermit457 | _e.g. swapped expiring PAT, no incidents_ |

---

## Last refresh

**2026-05-04** — initial. Next forced refresh: when a secret is added/removed (e.g. Tier 2 worker pool migration introduces a separate `WORKER_GH_TOKEN_POOL`), or after 90 days, whichever first.
