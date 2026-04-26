# StarScreener Data Terminal API — Plan

**Goal (user words):** "ultra reliable data terminal API to make money with."
**Triggered by:** every-20-min Vercel deploys caused by `data/*.json` git pushes.

## Reality check (verified, no bluffing)

- 30 JSON files in `data/`, **19 MB total**, are baked into every Vercel deploy.
- 37 source files in `src/lib/` read those files via `readFileSync(process.cwd(), "data", ...)` at request time.
- 14 collector scripts write the same files and `git push` to `main`.
- Each push triggers a Vercel prod deploy → **34 deploys on 2026-04-24** (already throttled to ~17/day this session).
- Upstash Redis is in package.json + used for rate-limiting only — **not for any data path today**.
- Trendshift.io is **NOT integrated** — only mentioned in the moat strategy doc.
- Existing audit (`starscreener-inspection/SOURCES.md`, dated 2026-04-18) already documents every SPOF, the 40k-star cap, the dead `socialBuzzScore`, and the Nitter mirror fragility.

## The full vision (honest scope: 5-7 days of focused work)

Splitting into 4 phases. Each phase is independently shippable.

---

### PHASE 1 — Decouple data from deploys (THIS SESSION, ~4-8 hours)

**Outcome:** Vercel deploys ONLY when code changes. Data refreshes hit Redis directly with no git push.

1. **`src/lib/data-store.ts`** — single Redis-backed adapter modeled on `rate-limit-store.ts`:
   - Upstash primary, file fallback (so dev still works without Redis)
   - Versioned keys (`data:v1:trending`, etc.) for safe rollouts
   - `getJson(key)` / `setJson(key, payload, { ttl? })`
   - Singleton client, cached connection, structured errors
2. **Pilot migration:** route ONE source end-to-end (`trending.json` — feeds the homepage).
   - Reader: `src/lib/derived-repos.ts` reads from data-store first, file as cold fallback
   - Writer: `scripts/scrape-trending.mjs` writes to data-store, also keeps writing the file (as snapshot for rollback)
   - Add `src/app/api/data/trending/route.ts` — public read endpoint
3. **Verify locally:** `npm run dev` + `npm run scrape:trending` → see fresh data without rebuild
4. **Mass-migrate the other 29 files** once pilot is green. Each migration = 2 file edits + 1 line change in the workflow.
5. **Stop committing `data/*.json` from workflows.** Last step — once all readers use Redis. Keep files git-ignored from then on (or commit weekly snapshots only as disaster-recovery seed).

**Result:** ~17 deploys/day → **0-2 deploys/day** (only real code pushes).

---

### PHASE 2 — Reliability hardening (1-2 days, separate session)

The MOAT.md doc already itemized these. They're SPOFs that block the "make money" path:

1. **GitHub token pool** — round-robin N PATs, per-token rate-limit tracking. Today one PAT revocation kills ingest entirely.
2. **40k-star cap fix** — port dual-ended fetch from `daily-stars-explorer` (license-contingent). 296 / 309 seed repos currently show flat-zero sparklines.
3. **Persist social mentions** — fire HN/Reddit/Bluesky/DEV adapters during ingestion, not on detail-page hit. Today `socialBuzzScore = 0` for every repo because mentions are never indexed.
4. **Nitter → Apify rotation** — already done for Twitter per CLAUDE.md, extend to other Nitter-style scrapers.
5. **Per-source health endpoint** — `/api/health/sources` reports last-success-at + error rate per collector. Required for SLA claims.
6. **Circuit breaker per source** — auto-disable after N consecutive failures, alert on flip.
7. **Sentry / structured logging** in every collector — currently silent failures.

---

### PHASE 3 — Source coverage (1-2 days, separate session)

To compete with OSSInsight + Trendshift on the data side:

1. **Trendshift-style engagement composite** — derive a daily-engagement score from our existing sources (HN points, Reddit upvotes, Bluesky reposts, DEV reactions, npm downloads, GH stars-velocity). Trendshift doesn't publish their algo — we can publish ours and own the transparency angle.
2. **GH Archive / ClickHouse** for historical depth — match OSSInsight's "since 2011" claim. Public ClickHouse instances, pennies/month.
3. **GitHub Events firehose** — scheduled 5-min pull for the watchlist. Sub-minute detection on hot repos.
4. **Funding announcements** (Crunchbase RSS, X funding hashtags via Apify) — already scaffold in `src/lib/funding/`.
5. **Cadence audit** — Trendshift = daily, OSSInsight = "real-time". Target: hot tier every 5 min, warm 1 h, cold 6 h.

---

### PHASE 4 — Monetization layer (2-3 days, separate session)

This is what turns the API into a product:

1. **API key issuance + management** — extend the existing admin auth. Per-key tier (`free`/`pro`/`enterprise`).
2. **Tiered rate limits** — already have `src/lib/api/rate-limit.ts`, just plumb `tier → limits` mapping.
3. **Stripe billing** — config exists per CLAUDE.md, never billed. Wire usage metering → Stripe.
4. **Public API docs site** — already have `docs/API.md` + `docs/openapi.yaml`. Deploy to `api.starscreener.com/docs`.
5. **Status page** — uptime + p50/p95 latency per endpoint, fed from the per-source health endpoint above.
6. **Webhook alerts as paid feature** — alert engine exists per MOAT.md, delivery is at 0%. Email + webhook = pro tier; MCP = enterprise.
7. **Landing page for the API product** — separate from the main app surface.

---

## What I'm doing in THIS session

Phase 1 only. End-to-end. With pilot + verification.

1. Write `src/lib/data-store.ts` (Redis adapter, file fallback)
2. Wire pilot for `trending.json` (reader + writer + API route)
3. Verify locally
4. Mass-migrate remaining 29 sources (script-driven, mechanical)
5. Update workflows to skip `git push` once Redis writes confirmed
6. Final test: scrape → see new data → no commit → no deploy

Phase 2-4 = separate sessions, each with its own plan doc.

## Out of scope for this session (explicitly)

- Trendshift integration → Phase 3
- Token pool, 40k-cap fix → Phase 2
- API keys, billing, monetization → Phase 4
- Any UI changes
- Touching the 12 cron workflows beyond the data-write target

## Verification gates (so I'm not bluffing about "done")

- ✅ Pilot reader returns identical bytes from Redis vs filesystem
- ✅ Pilot writer roundtrip: scrape → Redis → app reads new data within 60 s
- ✅ All 30 sources migrated (audit script confirms zero `readFileSync.*data/` left in `src/lib/`)
- ✅ One workflow runs end-to-end with NO `git push` step and the app shows updated data
- ✅ `npm run lint && npm run typecheck` clean
- ✅ Existing tests in `src/lib/pipeline/__tests__` still pass (they read from filesystem — adapter must support that mode for tests)

## Risk register

| Risk | Mitigation |
|------|------------|
| Upstash free-tier limit (10k cmds/day) hit | Cache reads at Next.js layer with `unstable_cache` + `revalidate`. 1 read per source per minute = ~43k/day → upgrade to paid (~$0.20/100k cmds = ~$10/mo) |
| Cold-start latency from Redis fetch | `unstable_cache` + Edge runtime where possible. Filesystem fallback if Redis is down |
| Existing `__tests__` break (they `readFileSync`) | data-store has explicit `useFileFallback: true` mode; tests opt in |
| Mid-migration: half data sources on Redis, half on filesystem → drift | Migrate one at a time, verify each, only then move on. No big-bang |
| User wants to read data files directly via git | Keep weekly snapshot commits (1/week) as DR seed; not a hot path |

---

## SETUP — provision Upstash + verify

Once you've provisioned a Redis instance, the system lights up automatically. Until then, every reader gracefully degrades to the bundled file snapshot (current behavior) and every writer logs `[redis: skipped]` instead of pushing to Redis.

### 1. Provision Redis — TWO options

**Option A — Railway native Redis (recommended if you're already on Railway)**
1. Open your Railway project → **+ New** → **Database** → **Redis**
2. Wait ~30s for it to provision
3. Open the new Redis service → **Variables** tab
4. Copy the `REDIS_URL` value (looks like `redis://default:xxx@redis.railway.internal:6379`)

The data-store auto-detects the URL scheme — `redis://` / `rediss://` → ioredis (TCP).

**Option B — Upstash REST (legacy / standalone)**
1. Go to https://console.upstash.com/redis
2. Create a new database (any region near your Vercel region; `us-east-1` is a safe default)
3. In the database detail page, find the **REST API** tab
4. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

Either path works. Set the corresponding env var(s) in Step 2.

### 2. Add the env vars in 3 places

For **Option A (Railway)** — set `REDIS_URL`:
| Where | How |
|---|---|
| **Local dev** (`.env.local`) | `REDIS_URL=redis://...` |
| **Vercel** (production) | `vercel env add REDIS_URL production` (or via dashboard) |
| **GitHub Actions** | `gh secret set REDIS_URL --body "redis://..."` |

For **Option B (Upstash)** — set both vars:
| Where | How |
|---|---|
| **Local dev** (`.env.local`) | Paste both `UPSTASH_REDIS_REST_*` vars |
| **Vercel** (production) | `vercel env add UPSTASH_REDIS_REST_URL production`, then again for the token |
| **GitHub Actions** | `gh secret set UPSTASH_REDIS_REST_URL --body "..."`, same for token |

### 3. Verify locally

```bash
npm run verify:data-store
```

Should output:
```
✓ env vars present
✓ wrote payload to Redis (writtenAt=2026-04-26T...)
✓ read payload back (... bytes)
✓ meta timestamp present: ...
✓ round-trip value matches
✓ cleaned up test keys

✓ data-store live verification passed — Redis is wired correctly.
```

If you see `source=skipped`, either the env vars are missing or `DATA_STORE_DISABLE=1` is set.

### 4. Verify production

After your next push to main, Vercel rebuilds with the new env vars. Hit the homepage — fresh trending data appears within 30 seconds of the next scrape, no commit required.

### 5. (Phase 1B → Phase 2) Stop committing data to git

Once verified for ~1 week with no reader regressions, edit `.github/workflows/scrape-trending.yml` (and the other 11 data-write workflows) to remove the `git commit` + `git pull --rebase` + `git push` steps. Collectors then write only to Redis. Vercel deploys drop to ~0/day from data churn.

The bundled `data/*.json` files stay in git as a cold-start seed — commit once a week from a digest workflow as DR insurance.

---

## Railway alternative (if you prefer that to Upstash)

You mentioned a Railway account. Railway provides managed Redis ($5/mo Hobby plan).

**Tradeoff vs Upstash:**
- ✅ You already pay for Railway
- ✅ Standard Redis protocol (more features than Upstash REST)
- ❌ Needs a TCP connection — fine on Vercel but adds connection-pool concerns
- ❌ `_data-store-write.mjs` would need to swap `@upstash/redis` for `ioredis` or similar

**Recommendation:** stay on Upstash for now. The REST API has zero connection-pool drama on Vercel serverless and free tier covers Phase 1 traffic. If we hit limits or want full Redis features later (streams, pub/sub for live alert delivery), Railway is the obvious next step. The data-store interface is already abstracted so a backend swap is mechanical.

For Phase 4 (monetization billing/usage logs), **Railway Postgres is the right choice** — relational data, not key-value. We'll wire that separately.
