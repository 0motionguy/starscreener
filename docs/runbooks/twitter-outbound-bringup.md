# Runbook — Twitter/X outbound posting bringup

**When to use:** to activate the automated X posting pipeline (daily
breakouts thread + Friday weekly recap). Until this runs, the cron routes
are visible no-ops — they compose threads and write audit rows with
`status:"skipped"` but never publish.

**What ships it:** `.github/workflows/cron-twitter-outbound.yml` already fires
`POST /api/cron/twitter-daily` (14:00 UTC daily) and
`POST /api/cron/twitter-weekly-recap` (16:00 UTC Fri) with the `CRON_SECRET`
bearer. The code is live; this runbook only provisions credentials and walks
the review-first ramp.

**Production is HOSTUP** (Docker tenant + Cloudflare Tunnel), NOT Vercel. Set
env vars on the tenant (compose env / the tenant's `.env`), then restart the
container. Never run Vercel commands for starscreener.

## Adapter priority ladder

`selectOutboundAdapter()` (`src/lib/twitter/outbound/adapters/index.ts`)
picks, highest first:

1. `TWITTER_OUTBOUND_MODE=null` → no-op. `=console` → log only. `=toolbox` →
   force the VPS engine. `=bluesky` → post the same thread to Bluesky via the
   AT Protocol (needs `BLUESKY_IDENTIFIER` + `BLUESKY_APP_PASSWORD`; create an
   app password in Bluesky Settings → App Passwords). Each mode fails loudly
   if its creds are missing. Note: the cron posts through ONE adapter per run
   — simultaneous X + Bluesky fan-out is a follow-up.
2. `TOOLBOX_REACH_URL` + `TOOLBOX_REACH_API_KEY` → **VPS Twitter engine**
   (end-state transport; wins over direct X creds).
3. `TWITTER_OAUTH2_CLIENT_ID` + `_SECRET` + `_REFRESH_TOKEN` → **OAuth2
   rotation** (self-renewing; preferred direct-to-X path).
4. `TWITTER_OAUTH2_USER_TOKEN` → static token (decays in ~2h; test only).
5. `NODE_ENV=development` → console. Otherwise → no-op + one-shot warn.

## Stage 0 — Dry-run review (no credentials, do this first)

1. Set `TWITTER_OUTBOUND_MODE=console` and an `ADMIN_TOKEN` on the tenant; restart.
2. Fire a run: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://trendingrepo.com/api/cron/twitter-daily` → expect `{"ok":true,"adapter":"console","status":"skipped"|"logged",...}`.
3. Review what *would* post:
   `curl -H "Authorization: Bearer $ADMIN_TOKEN" "https://trendingrepo.com/api/admin/twitter-outbound?limit=5"` —
   inspect the stored `posts[]` (10 repos, each with its `/repo/<owner>/<name>`
   URL, ordered by cross-signal score, no repeats). Let this run a few days
   and confirm selection quality before going live.

> If `status:"skipped"` with reason `stale-data (...)`, the trending payload
> is >12h old — the freshness gate is refusing to post garbage. Fix data
> freshness first (that's the point of the gate).

## Stage 1 — Go live via the VPS engine (preferred, when ready)

1. On the tenant, set `TOOLBOX_REACH_URL` (the engine's publish endpoint) and
   `TOOLBOX_REACH_API_KEY`; unset `TWITTER_OUTBOUND_MODE`; restart.
2. Fire the daily route; expect `"adapter":"toolbox_reach","status":"published"`
   and a non-null `threadUrl`. Open it — verify the live 10-repo thread.

## Stage 1-alt — Go live directly on X (OAuth2 rotation)

1. In the X developer portal, create an OAuth2 **confidential** client with
   scopes `tweet.read tweet.write users.read offline.access`.
2. Run the authorize flow once as the posting account; capture the **refresh
   token**.
3. Set `TWITTER_OAUTH2_CLIENT_ID`, `TWITTER_OAUTH2_CLIENT_SECRET`,
   `TWITTER_OAUTH2_REFRESH_TOKEN`, and `TWITTER_USERNAME` (no `@`); unset
   `TWITTER_OUTBOUND_MODE`; restart.
4. Fire the daily route; expect `"adapter":"twitter_api_v2","status":"published"`.

> **CRITICAL — persistent volume.** X rotates the refresh token on every
> exchange; the app persists the rotated token to
> `<DATA_DIR>/.data/twitter-oauth-state.jsonl`. **That path must be a
> persisted Docker volume.** If `.data/` is ephemeral, the rotated token is
> lost on the next restart and the account strands (needs a fresh authorize
> flow). The file is gitignored — it must never be committed.

## Rate budget

Free tier ≈17 posts/day. Daily thread = up to 12 (1 intro + 10 items + 1
idea); Friday adds the recap (~5) → ~17 on Fridays. A mid-thread `429` is
handled: `postThread` attaches the already-published posts to the error, and
the cron route still cools-down those repos so tomorrow's thread doesn't
repeat them.

## arXiv AI channel activation

The 7th cross-signal channel (`arxiv`) lights when a repo is linked from a
recent (<30d) arXiv paper. It stays dark until `scrape-arxiv.yml` runs with
the fixed linker (bare-slug matching) and writes `linkedRepos` to
`arxiv-recent`. No action needed here — it activates on the next scheduled
scrape; verify via a repo-detail page's channel row or
`GET /api/admin/twitter-outbound` picks skewing toward research-backed repos.

## Rollback

Set `TWITTER_OUTBOUND_MODE=null` and restart — posting stops immediately, no
code change. Audit rows keep recording `status:"skipped"` so cron-health
dashboards stay green ("alive but disabled").

## Verify checklist

- [ ] Stage 0 dry-run reviewed; selection quality acceptable.
- [ ] `.data/` is a persisted volume (OAuth path only).
- [ ] Live run returns `status:"published"` + a working `threadUrl`.
- [ ] Weekly recap intro count reflects the week (not the whole corpus).
- [ ] Rollback tested (`TWITTER_OUTBOUND_MODE=null` → skipped).
