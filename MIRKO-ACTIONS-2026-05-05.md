# Mirko Actions — 2026-05-05

> Operator-side dashboard tasks. Claude can't do these — needs your credentials. Total estimated time if all done at once: ~60 min. One coffee break.

---

## 🔥 CRITICAL — do first (5 min)

### AGN-517 — Upstash eviction policy
- **Paperclip status:** see ticket
- **Why:** prevents Redis OOM under sustained load — without this, the cache fills and writes start failing silently, taking the data-store down for every route on the site.
- **Where:** https://console.upstash.com → your Redis DB → **Configuration** → **Eviction** → set to `allkeys-lru`
- **Time:** 5 min
- **Blocks:** every data-store read once memory hits ceiling (51 cron payloads + Twitter scan logs grow unbounded). This is the single highest-leverage click on the whole list.

---

## Standard ops items

### AGN-634 — Cloudflare R2 bucket + creds for Redis backup
- **Paperclip status:** see ticket
- **Why:** durable off-site backup of the Redis data-store. Right now if Upstash loses the DB, we rebuild from bundled JSON + cron re-runs (slow, lossy for Twitter JSONL).
- **Where:** https://dash.cloudflare.com → **R2** → **Create bucket** (name: `starscreener-backups`). Then **Manage R2 API Tokens** → create token with read+write on that bucket. Drop `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` into Vercel env (Production scope).
- **Time:** 15 min
- **Blocks:** the nightly Redis-snapshot workflow can't ship — backup script exists but has no destination.

### AGN-665 — Issue 2 GitHub PATs (PROD + TEST) for token-pool split
- **Paperclip status:** see ticket
- **Why:** current single-PAT setup hits GitHub's 5000/hr ceiling during full collector sweeps. Splitting prod vs test traffic on separate tokens doubles headroom and stops test runs from starving prod.
- **Where:** https://github.com/settings/tokens → **Generate new token (classic)** → scopes: `public_repo`, `read:user`, `read:org`. Make two: `STARSCREENER_GITHUB_TOKEN_PROD`, `STARSCREENER_GITHUB_TOKEN_TEST`. Add both to Vercel env + GitHub Actions secrets.
- **Time:** 10 min
- **Blocks:** the token-pool router refactor — code is staged but can only round-robin if there are ≥2 tokens to round-robin between.

### AGN-841 — DNS records (SPF/DKIM/DMARC) on trendingrepo.com
- **Paperclip status:** see ticket
- **Why:** transactional + alert email currently lands in spam (or gets dropped) because the domain has no sender-auth records. Affects digest emails and ops alerting.
- **Where:** https://dash.cloudflare.com → trendingrepo.com → **DNS** → **Records** → add three TXT records:
  - SPF: `v=spf1 include:<your-mail-provider> -all`
  - DKIM: provider-specific selector + key (Resend/SES/Mailgun give you the value)
  - DMARC: `_dmarc` TXT → `v=DMARC1; p=quarantine; rua=mailto:postmaster@trendingrepo.com`
- **Time:** 15 min (mostly waiting for provider DKIM key)
- **Blocks:** outbound email reliability — digest/alert features can't ship until inbox-placement is fixed.

### AGN-842 — Submit sitemap to Google Search Console + Bing
- **Paperclip status:** see ticket
- **Why:** SEO crawl coverage. Sitemap exists at `/sitemap.xml` but neither engine has been told. Indexing latency stays at weeks instead of days.
- **Where:**
  - Google: https://search.google.com/search-console → add property `trendingrepo.com` → **Sitemaps** → submit `https://trendingrepo.com/sitemap.xml`
  - Bing: https://www.bing.com/webmasters → add site → **Sitemaps** → submit same URL
- **Time:** 10 min (5 per engine, plus DNS-verify TXT if not already done)
- **Blocks:** organic-traffic ramp on every public page (`/twitter`, `/ideas`, `/funding`, repo detail pages).

### AGN-661 — Submit to hstspreload.org
- **Paperclip status:** see ticket
- **Why:** browser-baked HSTS — guarantees HTTPS for trendingrepo.com on first visit, not just after first connection. Security posture + small SEO signal.
- **Prereq:** confirm `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` is live on every response (it should be — verify with `curl -I https://trendingrepo.com`).
- **Where:** https://hstspreload.org → enter `trendingrepo.com` → tick the three checkboxes → submit
- **Time:** 5 min
- **Blocks:** nothing operationally, but it's a one-shot — has to be done once and then the domain is on the preload list permanently.

### AGN-71 — `gh auth login` to restore CLI auth
- **Paperclip status:** see ticket
- **Why:** Claude can't run `gh workflow run`, `gh pr create`, `gh run list` for SRE-style workflow audits without your auth on this machine. Currently every gh call fails.
- **Where:** any terminal on this box →
  ```
  gh auth login
  ```
  → choose **GitHub.com** → **HTTPS** → **Login with a web browser** → paste the device code.
- **Time:** 2 min
- **Blocks:** the SRE workflow audit (need `gh run list --workflow=collect-twitter.yml` etc.), all PR-management automation, and any cron-trigger debugging.

---

## Quick verification

Run after you've done each item — confirms it actually landed.

| Item | Verification |
|---|---|
| **AGN-517** | Upstash dashboard → DB → Configuration → Eviction shows `allkeys-lru`. Or `redis-cli -u $REDIS_URL config get maxmemory-policy` → `allkeys-lru`. |
| **AGN-634** | `aws s3 ls s3://starscreener-backups --endpoint-url=https://<account-id>.r2.cloudflarestorage.com` lists (empty bucket OK). |
| **AGN-665** | `vercel env ls production` shows `STARSCREENER_GITHUB_TOKEN_PROD` + `_TEST`. Both `curl -H "Authorization: token $TOK" https://api.github.com/rate_limit` return 5000. |
| **AGN-841** | `dig TXT trendingrepo.com +short` shows SPF. `dig TXT default._domainkey.trendingrepo.com +short` shows DKIM. `dig TXT _dmarc.trendingrepo.com +short` shows DMARC. Or paste domain into https://mxtoolbox.com/SuperTool.aspx. |
| **AGN-842** | Search Console → property → **Sitemaps** shows `sitemap.xml` status `Success`. Bing Webmaster shows similar. |
| **AGN-661** | https://hstspreload.org/?domain=trendingrepo.com shows "Status: Pending" → eventually "Preloaded" (takes weeks for browser ship). |
| **AGN-71** | `gh auth status` shows "Logged in to github.com as Kermit457". `gh run list --limit 3` returns rows. |

---

**Total: 7 items, ~60 min if done in one sitting. Start with AGN-517 — it's the only one where delay risks an outage.**
