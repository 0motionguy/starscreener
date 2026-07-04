# Handover — 2026-07-05 — Ask agent + outage recovery + audit

Pick-up doc for the next session. Written after a long session that (1) rescued a 13-day production data outage, (2) re-audited the live code, and (3) built the "Ask" conversational agent + ⌘K navigation + an agent-commerce worker fetcher.

---

## 0. READ THIS FIRST — the branch trap that cost a whole build

**trendingrepo.com is deployed from `hardening/2026-05-31-wave` (@ `8e7fe20bc`), NOT `main` and NOT the `feat/*` branches off main.** `main` and `feat/per-category-rss-feeds-v2` are a *dead parallel line* that shares only ~17 of 378 component files with what's live. A full feature was once built on that wrong line this session before we caught it.

**Before touching ANY UI/app code, verify you're on the live line:**
```bash
ssh toolbox "docker inspect toolbox-trendingrepo-1 --format '{{.Config.Image}}'"   # note the -<sha> suffix
git branch -a --contains <sha>            # that's the deploy line
git merge-base --is-ancestor <sha> HEAD && echo OK   # must print OK before you edit
```
All the work in this handover lives in a **git worktree** at `C:\dev\trendingrepo-wt\hardening-audit` on branch **`feat/navigator-palette-live`** (branched off the live `8e7fe20bc`). The main checkout `C:\dev\trendingrepo` is still on the dead `feat/per-category-rss-feeds-v2` — don't build there.

Memory notes: `reference_live_branch_is_hardening`, `2026-07-04-outage-root-cause`.

---

## 1. What is LIVE on trendingrepo.com right now (done, no deploy needed)

These were fixed **directly on the TOOLBOX box**, so they're serving users:
- **13-day data outage fixed.** Worker `toolbox-trendingrepo-worker-1` had a stale Redis password (`WRONGPASS` since 2026-06-21); app lost Redis on the 07-03 redis restart. Synced `REDIS_URL` in `/opt/toolbox-trendingrepo-worker/.env` + `/opt/trendingrepo/.env.production` to the live `requirepass`, recreated both containers. Health went red 49→~18, `emptyPayload` 49→0. **Verify:** `curl https://trendingrepo.com/api/worker/pulse` must be `source:redis, fresh:true`.
- **GitHub token pool restored.** All ~30 PATs were 401; the live pool had been clobbered with a dead set. Restored the 20-token pool from the May-28 backup `/opt/toolbox-trendingrepo-worker/.env.bak.1779964001`. Velocity/metadata fetchers recovered. Memory: `gh-pats-all-dead-2026-07`.
- **Freshness alerting rework** — committed to `main` (PR path), `cron-freshness-check.yml`: run-conclusion state memory (killed the ~89-PR heartbeat spam), 6-hourly re-alert while non-green, Slack-shaped payload. **Inert until it merges to main** (GH Actions fire from the default branch).
- **~3 GB of orphan `/opt/trendingrepo-deploy-*` dirs deleted** from the box.

**Gotcha for the box:** the Redis password lives in the container's `--requirepass` (source of truth), not the .env — the .env drifted twice. Read it via `docker inspect toolbox-redis-1 --format '{{json .Config.Cmd}}'`. That value leaked into a session transcript on 07-04 — **rotate it** (memory: `toolbox-redis-password`).

---

## 2. What is BUILT + VERIFIED but NOT deployed — PR #3195

Branch `feat/navigator-palette-live` → **PR #3195** (base `hardening/2026-05-31-wave`, 11 commits). Production `npm run build` was green. Nothing here is live until deployed.

### The "Ask" agent (`src/components/ask/AskDock.tsx` + `ask-dock.css`)
A draggable liquid-glass command bar, mounted deferred in `src/app/layout.tsx` via `IdleMount`. All tiers built + Playwright-verified:
- **Draggable liquid-glass box** — frosted `rgba(17,20,25,0.74)` + `backdrop-blur(22px)`, orange-glow border, whole-body drag (grip guard skips input/buttons), position persists to `localStorage['ask-hud-pos']`. Collapsed 48px node ↔ expanded box.
- **Opens downward INSIDE the box** — conversation renders below the input row, box grows capped at ~5 rows (`max-height:240px`), then scrolls. **Flowing orange border** (conic `@property --ask-spin`) while it holds a conversation.
- **Typewriter** — messages type out char-by-char with a blinking caret (instant under reduced-motion). CTA greeting on open.
- **Navigation tiers:** deterministic page-jump + NL (`src/lib/nav-commands.ts`, registry + filler-stripping matcher) → then LLM router.
- **Conversation:** greets on open; chitchat ("how are you"/"thanks"/"help") answered deterministically; every miss is a **persistent typed answer** (never a vanishing status — that bug is fixed).
- **Voice:** Web Speech API mic, feature-detected.

### `/api/navigator` (`src/app/api/navigator/route.ts`)
LLM tier: Zod-validated, per-IP rate-limited (20/min), **provider-flexible** (NanoGPT → OpenRouter → Kimi, OpenAI-compatible). Returns `{reply, answer?, action}`. **Hard internal-path guard** (`safeInternalHref`) so a prompt-injected external URL can't become an open redirect. **Graceful `NOT_CONFIGURED`** (200) when no key — client keeps deterministic + canned replies.
- ⚠️ **Needs an LLM key in the APP env on the box** (`NANOGPT_API_KEY` / `OPENROUTER_API_KEY` / `KIMI_API_KEY`). The *worker* has Kimi/NanoGPT; the *app* env needs one too. Until then, open-ended Q&A returns the canned "I couldn't map that…" reply. Keys are in `KERMIT.txt` (see §5 triage plan).

### ⌘K page-jump + Pages tier (`src/components/shell/Topbar.tsx` + `nav-commands.ts`)
The existing Topbar ⌘K search gained a **"Pages"** section — jump to any page, not just repos/LLMs. Additive; the repo/LLM search path is untouched.

### agent-commerce worker fetcher (`apps/trendingrepo-worker/src/fetchers/agent-commerce/index.ts` + `registry.ts`)
**Why:** `/agent-commerce` was frozen at the June-11 deploy seed — its only feed (`cron-agent-commerce.yml`) died 2026-05-31 and the Redis key was empty. This fetcher re-runs the seed scoring (mirrors `scripts/build-agent-commerce-seed.mjs`) on the live worker plane daily (`41 4 * * *`), empty-guarded. **v1 = seed re-score + fresh timestamp only.** Typecheck-clean; **runtime write to Redis is NOT verified — needs a worker deploy.**

---

## 3. BLOCKED ON MIRKO (can't proceed without him)

1. **Deploy PR #3195** — the whole Ask agent + ⌘K + agent-commerce fetcher is doing nothing for users until shipped. (Deploy = his explicit go; it's a live consumer site just rescued from an outage.)
2. **LLM key in the app env** on the box — lights up open-ended Q&A + LLM navigation.
3. **Slack webhook** — the one in `KERMIT.txt` (`hooks.slack.com/services/T0B4APYJ350/...`) returns **404 (dead)**. Needs a fresh incoming webhook, then `gh secret set OPS_ALERT_WEBHOOK`. Until then the freshness pager only emits `::error` annotations. (GitHub PATs are already handled — restored from backup, no rotation needed.)

---

## 4. Deploy runbook (when Mirko says "deploy")

Per memories `app_deploy_current_prod_tag` + `toolbox_worker_deploy` (both may be stale — verify on the box):
- **App:** build `trendingrepo-app` image from the branch on the box, retag `:current-prod`, `docker compose -f /opt/trendingrepo/docker-compose.trendingrepo.yml up -d --force-recreate`. Rollback = retag prior `:vps-*` image.
- **Worker:** local build → `docker save | ssh toolbox docker load` → bump the tag in `/opt/toolbox-trendingrepo-worker/docker-compose*.yml` → `up -d`.
- **After deploy, VERIFY:** ⌘K + Ask bar live on trendingrepo.com (Playwright/screenshot); `curl /api/worker/pulse` fresh; the `agent-commerce` Redis key gets a fresh `writtenAt` within a cron slot; set the LLM key + test open-ended Q&A.
- **Merge**: PR #3195 → `hardening/2026-05-31-wave` (the live line), not main.

---

## 5. Remaining from the initial plan / audit (not started)

Full plan: `C:\Users\mirko\.claude\plans\lucky-plotting-kettle.md`. Corrected audit findings (against LIVE code): security/testing largely hold (auth timing-safe, 20 guard-lints, scoring-engine test, CI runs `npm test`, CSP unsafe-inline present); the frontend half of the original audit described the dead branch and was corrected.

Prioritized backlog:
1. **agent-commerce v2** — port the live source fetchers (x402 onchain volume across Base/Solana/Stellar, CoinGecko agent tokens, Agent.market directory) to the worker so `/agent-commerce` shows *live* data, not just a re-scored seed. Research + endpoint shape are in the plan file (Part 2, the x402 landscape section). **Highest data-value item.**
2. **Branch reconciliation (#3186)** — make `hardening/2026-05-31-wave` the canonical trunk (promote → main); retire the dead `main`/`feat-*` line and the 2,153-branch sprawl. Root cause of the branch trap. Plan-first, nothing destructive without approval.
3. **CD pipeline** — the app deploys by hand-built images + manual SSH (20 orphan dirs were the evidence). A `main → build → tag → deploy → smoke` workflow + documented rollback.
4. **Audit top-10 fixes** — CSP nonce (drop `unsafe-inline`/`unsafe-eval`), mobile overflow re-check, `@vitest/coverage` floor on `src/lib/pipeline/scoring`, remove the 6 Storybook devDeps + `.storybook/`.
5. **Ask agent N-next** — multi-step LLM ("find agents gaining this week AND add top 3 to watchlist"): a plan-execute loop on `/api/navigator` returning an action *sequence*; wire watchlist/filter store actions into the registry. Also: GEO answer-surfaces (`/best/*`, `/glossary`) as ⌘K/Ask targets.
6. **Credential triage** — `~/.claude/plans/kermit-credential-triage.md`. `KERMIT.txt` (OneDrive-synced plaintext) holds LIVE secrets (Stripe `sk_live`, Solana/Polymarket wallet keys, HOSTUP/Cloudflare/Vercel tokens, Supabase service_role). **Step 0 = move it off OneDrive + rotate the live-exposed ones.** A future prompted session maps each cred → codebase.

---

## 6. Local dev state / how to run the Ask agent

- Worktree: `C:\dev\trendingrepo-wt\hardening-audit` (branch `feat/navigator-palette-live`). `node_modules` installed via `npm ci` (worker deps NOT installed there — the worker has its own package).
- Dev server: `cd <worktree> && npx next dev -p 3024` → open `http://localhost:3024`, click the "▸" node bottom-right.
- **Windows gotcha:** don't run `npm run build` while `next dev` is running — the prod build overwrites `.next` and 404s the dev chunks (happened once; fix = kill dev, `rm -rf .next`, restart).
- Verification pattern used throughout: Playwright via `browser_run_code_unsafe` (drag tests, typewriter sampling, network capture) + `browser_take_screenshot` read back. Screenshots from this session: `ask-glass-v2.png`, `ask-box-downward.png`, `ask-conversational.png` in the repo root (untracked, gitignore-able).

---

## 7. One-line status

Production is healthy (data flowing again). A complete, verified conversational Ask agent + ⌘K navigation + agent-commerce fetcher sit on **PR #3195**, production-build-green, awaiting **deploy + an LLM key**. Everything else is the backlog in §5.
