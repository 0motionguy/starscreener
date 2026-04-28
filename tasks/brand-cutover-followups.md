# Brand Cutover — Manual Follow-ups (Chunk D)

The in-repo brand consolidation (StarScreener → TrendingRepo) shipped on `feat/brand-trendingrepo`. Chunks A/B/C cover code, docs, env-var aliasing, package metadata, OG cards, MCP server identity, browser localStorage migration, and 22 GitHub Actions workflows.

This file lists the **external-credential / production-mutating steps** that must be run by a human operator. They are deliberately not automated because each touches a system outside the repo.

## Critical path before merging

- [ ] **Vercel preview build** for `feat/brand-trendingrepo` boots clean. Check that the deprecation `console.warn` for any `STARSCREENER_*` env var firing on boot is expected (only fires when the dashboard still has the old name; harmless).
- [ ] **Visual sweep** on the Vercel preview: open `/`, `/portal/docs`, `/cli`, `/funding`, `/revenue`, `/breakouts`, `/repo/<owner>/<name>` (any) — every header eyebrow, footer, copy block, code sample, and OG-card screenshot shows "TrendingRepo" only. Header eyebrow should now read `// TRENDINGREPO / TREND MAP FOR OPEN SOURCE` (was `// V3 SYSTEM / …`).
- [ ] **Curl the redirect**: `curl -sI https://starscreener.vercel.app/portal | grep -i location` → should be `https://trendingrepo.com/portal` (already wired in `next.config.ts:148-159`).
- [ ] **MCP smoke**: `claude mcp add trendingrepo "node node_modules/trendingrepo-mcp/dist/server.js"` against the preview, list tools, call `top_gainers` — returns data.

## After merge to main

### Vercel + Railway dashboards

- [ ] Add `TRENDINGREPO_*` aliases for every `STARSCREENER_*` env var currently set in:
  - Vercel project settings (Production + Preview environments)
  - Railway project (`api.trendingrepo.com` if applicable)
- [ ] Leave the old `STARSCREENER_*` names in place for one release cycle (back-compat is wired). After the next release ships and prod has been observed clean, remove the legacy names.
- [ ] Specifically check these env-var pairs:
  - `TRENDINGREPO_API_URL` / `STARSCREENER_API_URL`
  - `TRENDINGREPO_PUBLIC_URL` / `STARSCREENER_PUBLIC_URL`
  - `TRENDINGREPO_DATA_DIR` / `STARSCREENER_DATA_DIR`
  - `TRENDINGREPO_PERSIST` / `STARSCREENER_PERSIST`
  - `TRENDINGREPO_ALLOW_MOCK` / `STARSCREENER_ALLOW_MOCK`
  - `TRENDINGREPO_ALLOW_MISSING_ENV` / `STARSCREENER_ALLOW_MISSING_ENV`
  - `TRENDINGREPO_REPO_PROFILES_PATH` / `STARSCREENER_REPO_PROFILES_PATH`
  - `TRENDINGREPO_AISO_AUTO_SCAN` / `STARSCREENER_AISO_AUTO_SCAN`
  - `TRENDINGREPO_AISO_PAGE_WAIT_MS` / `STARSCREENER_AISO_PAGE_WAIT_MS`
  - `TRENDINGREPO_GITHUB_HOMEPAGE_LOOKUP` / `STARSCREENER_GITHUB_HOMEPAGE_LOOKUP`
  - `TRENDINGREPO_USER_AGENT` / `STARSCREENER_USER_AGENT`
  - `TRENDINGREPO_AUTO_INTAKE` / `STARSCREENER_AUTO_INTAKE`
  - `TRENDINGREPO_API_TOKEN` / `STARSCREENER_API_TOKEN`
  - `TRENDINGREPO_USER_TOKEN` / `STARSCREENER_USER_TOKEN`

### GitHub Actions repo variable

- [ ] Add `TRENDINGREPO_URL` repo variable, value `https://trendingrepo.com`. The 22 workflow files already read `${{ vars.TRENDINGREPO_URL || vars.STARSCREENER_URL || 'https://trendingrepo.com' }}` so neither order matters — just don't leave `STARSCREENER_URL` as the only source after one cron cycle has run with the new var.

### npm publish flow

The package metadata in `cli/package.json` and `mcp/package.json` is renamed to `trendingrepo-cli` / `trendingrepo-mcp` v0.2.0, with `mcp/package.json` keeping a `starscreener-mcp` alias bin for users who still reference the old binary path.

- [ ] Final publish under the OLD names: bump `cli/package.json` and `mcp/package.json` temporarily back to `starscreener-cli@0.1.1` / `starscreener-mcp@0.1.1`. Add a `postinstall` warning. Run `npm publish` for both. (This step is optional — npm deprecate alone will suffice.)
- [ ] `npm publish` for `trendingrepo-cli@0.2.0` (from `cli/`).
- [ ] `npm run build` then `npm publish` for `trendingrepo-mcp@0.2.0` (from `mcp/`).
- [ ] Deprecate the old packages:
  ```
  npm deprecate starscreener-cli@'<999.0.0' "Renamed to trendingrepo-cli — see https://trendingrepo.com/cli"
  npm deprecate starscreener-mcp@'<999.0.0' "Renamed to trendingrepo-mcp — see https://trendingrepo.com/portal/docs"
  ```
- [ ] Verify: `npm view trendingrepo-cli` and `npm view trendingrepo-mcp` resolve at v0.2.0 with the new descriptions.

### Cron / scrape user-agent re-registration

- [ ] **Reddit**: the outbound User-Agent strings in `scripts/_*-shared.mjs` were updated from `StarScreener/0.1` → `TrendingRepo/0.2`. Reddit specifically requires the registered UA per [starscreener-inspection/sources.json:205](starscreener-inspection/sources.json). Confirm with the Reddit account owner / app registration that the new UA pattern is recognized before the next cron cycle. Expect 403/429 noise on Reddit until then.

### Stripe (DEFERRED but logged here)

- [ ] Stripe **product display names** were updated to "TrendingRepo Pro" / "TrendingRepo Team" in [scripts/seed-stripe-products.mjs](scripts/seed-stripe-products.mjs). Run that script against test mode first to verify, then prod. Existing customer subscriptions will see the new name on next invoice.
- [ ] **DO NOT YET MIGRATE** the Stripe `metadata.starscreener_tier` key. Existing customer records key off this. Plan a separate dual-write migration ticket: introduce `metadata.trendingrepo_tier`, dual-write for one billing cycle, then read from the new key, then remove the old.

### Email DNS (DEFERRED)

- [ ] **Do NOT change** the From: header `alerts@alerts.starscreener.dev` in [src/lib/email/resend-client.ts:37](src/lib/email/resend-client.ts) until DNS reputation for `alerts.trendingrepo.com` has been warmed. Track this as a separate ticket. The 15 DNS records documented in [starscreener-inspection/RESEND_WARMING.md](starscreener-inspection/RESEND_WARMING.md) need equivalents on `trendingrepo.com` first.
- The breakout-alert email body link DID get updated to `https://trendingrepo.com` (canonical), so new alerts already point at the new domain — only the From: header stays on the warmed sender domain.

### GitHub repo rename (DEFERRED)

- The two npm packages reference `0motionguy/starscreener` (root canonical) — the `cli/` and `mcp/` package.jsons originally pointed at `Kermit457/STARSCREENER`, now standardized on `0motionguy/starscreener` per plan D1.
- If you decide to rename the GitHub repo to `0motionguy/trendingrepo`:
  - GitHub auto-redirects renamed repos, so existing clones / `npx github:0motionguy/starscreener` install commands keep working.
  - Update `package.json`, `cli/package.json`, `mcp/package.json`, `README.md`, `src/components/layout/Footer.tsx`, `src/components/layout/SidebarFooter.tsx`, `src/app/cli/page.tsx`, `docs/openapi.{yaml,json}`, OG-card metadata, Resend email templates, scripts UA strings.
  - This is a tracked follow-up; the in-repo URL is consistent right now.

## Verification

After completing the above:

- [ ] `npm view trendingrepo-cli` returns v0.2.0 metadata.
- [ ] `npm view trendingrepo-mcp` returns v0.2.0 metadata.
- [ ] `npm view starscreener-cli` shows the deprecation message.
- [ ] `curl -sI https://starscreener.vercel.app/cli | grep -i location` returns `https://trendingrepo.com/cli`.
- [ ] A GitHub Actions cron run (e.g. `gh workflow run cron-aiso-drain.yml`) shows the workflow successfully resolving `TRENDINGREPO_URL` (or falling back cleanly).
- [ ] Vercel production logs show no `[env] STARSCREENER_X is deprecated` warnings — this confirms the dashboard is fully migrated.

## Frozen audit dirs (keep untouched)

`starscreener-fix/` and `starscreener-inspection/` are frozen audit snapshots. `docs/NEXT_SESSION.md:142` says "do not touch." Any future cleanup of those directories is a separate ticket.
