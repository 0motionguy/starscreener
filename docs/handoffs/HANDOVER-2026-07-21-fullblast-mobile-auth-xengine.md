# HANDOVER — Full-blast session 2026-07-21 (mobile + auth/payments + X-engine)

**Prod line = `main`.** Final deployed image: `trendingrepo-app:vps-20260721062426-452853d2` (= `main@452853d22`). Container `toolbox-trendingrepo-1` healthy on TOOLBOX.

Three workstreams driven in parallel (4 Opus 4.8 agents + operator-held integration). Two are LIVE; the third is safe + dormant, blocked on a pre-existing posting-transport failure.

---

## ✅ SHIPPED + LIVE

### Mobile app — density pass, armed on prod
- `~20%` sizing pass on the `mapp-` section of `public/shell.css` + mobile icon props (`MobileBottomNav.tsx`, `MobileAppHeader.tsx`). Nav 52→45, header 52→46, Ask disc 40→34, seg 30→26, card avatar 20→18, sheets 46→42; inputs kept 16px; `--mapp-nav-h` 56→48.
- **Armed on prod**: `NEXT_PUBLIC_TRENDINGREPO_MOBILE_APP_V1=1` in `/opt/trendingrepo/.env.production` (build-time baked). Verified on trendingrepo.com @390: app chrome mounts, no overflow, 12 repos/screen, active tab `#ff6b35`; desktop @1440 all `mapp-*` `display:none`.
- Commits on `main`: `69cf8fa4b` (sizing) merged via `da19533bc`.

### Auth / payments / UUID — merged + prod DB migrated + deployed
- Branch `fix/auth-payments-identity-ledger-20260720` (11 commits) merged to main; **P1 fixed pre-merge** (`98ea668a2`): `/api/pipeline/alerts` was still on sync `verifyUserAuth` + absent from `isClerkSessionRoute` → stale-cookie could read the alert feed. Now `resolveUserPrincipal` + added to matcher.
- **Prod DB migration APPLIED + verified** (Supabase `tr` schema, via `drizzle-kit migrate` with `DIRECT_URL`): prod was at `0000` only — **`tr.user_tiers` did not exist** (the durable tier store's migration never reached prod). Applied `0001→0004`: user_tiers, stripe_webhook_events, user_tiers.profile_id+FK, watchlists unique index. `tr.watchlists` was empty so 0004 was safe.
- Deployed. `/api/ready` (admin bearer) = **GREEN**: Clerk live key family + webhook secret + session secret ok; Stripe secret + webhook secret + pro price IDs ok; DB reachable, 0 failed/stuck webhook events. Unsigned webhook → 400 (signature enforced).
- **REMAINING (operator):** real live-card purchase E2E (prod uses LIVE Clerk/Stripe keys — not run, would charge a real card). `npm run verify:stripe-catalog` against live Stripe. Clerk `session.removed` webhook wiring.

---

## ⚠️ X ENGAGEMENT ENGINE — built, safe, dormant, blocked on posting transport

Reply/comment on other people's FRESH AI posts in our voice. Full engine on `main`
(`src/lib/twitter/engagement/**` + `/api/cron/x-engagement` + `/api/admin/x-engagement`
+ `scripts/x-engagement-run.mjs` + `scripts/ops/trendingrepo-x-engagement.*`).
Gate `TWITTER_ENGAGEMENT_MODE` (off | dry | live), **currently `off`** (hard kill, zero cost). No cron installed → fully inert.

**Two real fixes made this session:**
1. **X-reading:** the assumed toolbox skill `twitter.nitter_search` is **retired (404 skill_not_found)** — nitter is dead. Rewired `x-search.ts` to `social.scrapecreators` discover mode (`{mode:"discover",platform:"twitter",handle,limit}`, output `type:"social.post"`, `value.author`/`published_at`). ⚠️ **The site's own twitter collector `scripts/_toolbox-twitter-provider.ts` hits the SAME dead skill — separate follow-up (likely why X mentions are thin).**
2. **Grounding (anti-hallucination):** the composer invented repos+stats (e.g. "threestudio-compare, 2x velocity") because the data hook was unwired. Added `grounding.ts` (real top-momentum repos from `getDerivedRepos()`), wired `dataPointFor`, and hardened the composer to cite ONLY provided repos/stats or go non-numeric/SKIP. Verified: post-grounding the composer **correctly skips** news posts it can't ground (0 fabrications).

**Yield reality:** scrapecreators serves FRESH data unpredictably per account — `@RoundtableSpace` returns 12 posts ≤6h, but `@simonw`/`@_akhaliq`/`@itsPaulAi` return year-old samples. The fresh-serving account posts AI *news* (rarely maps to a trending GitHub repo → grounded-skip), while the repo-centric accounts return stale data. So the grounded engine is **safe but low-yield** with today's data.

**HARD BLOCKER for live:** the X **posting transport is broken for everything**. `TWITTER_OUTBOUND_MODE=live` but all app-side drivers (OAuth2/API/bearer/reach) are absent, and the broadcast 7×/day autopilot itself is **failing** — `/var/log/trendingrepo-x-autopilot.log` shows `confirm HTTP 500` on recent runs (cookie rotation was already noted pending on the operator). Engagement uses the same `selectOutboundAdapter()` → can't post until this is fixed.

**Cost gate (operator decided LEAN):** `social.scrapecreators` is tier-2 paid ~$0.05/handle/call. Approved: scan ~6 top-freshness accounts every ~4-6h (~$1-2/day). Not yet wired (no cron; would set `ENGAGE_TARGETS_JSON` to the lean set).

### To finish X-engine live (next session, in order)
1. **Fix the posting transport** (operator): rotate the @trending_repos X cookies and/or wire OAuth; confirm the broadcast autopilot posts without `confirm HTTP 500`. This unblocks BOTH broadcast + engagement.
2. Set `ENGAGE_TARGETS_JSON` to the lean ~6 accounts (favor ones scrapecreators serves fresh); leave others out.
3. `TWITTER_ENGAGEMENT_MODE=dry` → run `node scripts/x-engagement-run.mjs --dry-run --once` from a checkout of current main → review grounded drafts in `/api/admin/x-engagement`.
4. `TWITTER_ENGAGEMENT_MODE=live` → canary 1-2 replies → confirm on-tone + landed → install `scripts/ops/trendingrepo-x-engagement.cron` (~every 6h). Kill switch = mode `off`.
5. Consider tuning the composer to allow more genuine *insight* replies (non-repo) if higher yield is wanted — accept slightly higher generic-reply risk.

---

## DEPLOY runbook gaps closed this session (fold into docs/DEPLOY-TOOLBOX.md)
- **Prod DB migration step (was undocumented):** on the box, `drizzle-kit migrate` needs devDeps + `DIRECT_URL` (session pooler; strip `?pgbouncer`, add `?sslmode=require`). The cron checkout `/opt/trendingrepo-cron` has drizzle-kit. `drizzle.config.ts` `schemaFilter:["tr"]` confines it to trendingrepo's schema (shared Supabase). Apply migrations **before** the new image (webhook route 500s if `stripe_webhook_events` is missing).
- **App image build for a big jump:** the box `/opt/trendingrepo` tree is a 500+-file partial-checkout patchwork on a stale `producthunt-reader` HEAD. Cleanest = build from a fresh `git worktree add --detach /opt/trendingrepo-deployN <sha>` + `cp /opt/trendingrepo/.env.production` into it (Dockerfile `COPY . .` bakes NEXT_PUBLIC) + `docker build`, then sed the compose tag in `/opt/trendingrepo/docker-compose.trendingrepo.yml` + `up -d`. Remove the worktree after.
- Bonus: copied `KIMI_*`/`NANOGPT_*`/`LLM_*` from the worker env to the app env — the app bundle already expected them (Ask/navigator LLM), so this also enables the app's Ask answers.

## Verify commands
- Prod health: `npm run health:prod` (one pre-existing stale source: HN ~20h; worker container was `unhealthy` pre-session — separate).
- Routing: `curl -sI https://trendingrepo.com/ | grep -iE '^server|x-vercel'` → cloudflare, no vercel.
- `/api/ready`: `curl -H "Authorization: Bearer $ADMIN_TOKEN" https://trendingrepo.com/api/ready`.
