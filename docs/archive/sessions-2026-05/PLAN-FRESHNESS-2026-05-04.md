# PLAN — Absolute Freshness, Every Profile Has a Logo, Zero Manual Ops
**Date**: 2026-05-04
**Source audit**: [docs/AUDIT-2026-05-04.md](AUDIT-2026-05-04.md)
**Author**: CTO seat (Claude)

---

## 0. Acceptance criteria (the bar)

The plan is done when ALL FOUR are simultaneously true and self-prove daily without operator action:

1. **ABSOLUTE FRESHNESS**
   - Heartbeat keys (`trending`, `deltas`, `hackernews-trending`, `reddit-mentions`) — Redis `writtenAt` ≤ **1 hour** old at all times.
   - Per-source feeds (BSky, Lobsters, DevTo, PH, NPM, HF×3, arXiv, Twitter, Funding) — Redis `writtenAt` ≤ **6 hours** old.
   - Archives (digest, snapshots, consensus) — Redis `writtenAt` ≤ **24 hours** old.
   - Supabase `last_seen_at` for each `trending_items.type` ≤ **24 hours**.
   - **Self-prove**: `audit-freshness` workflow runs every hour, fails CI red if ANY budget breached, pages to Sentry.

2. **EVERY PROFILE HAS A LOGO**
   - Every GitHub repo card → owner avatar (`avatars.githubusercontent.com/u/<id>`). Monogram fallback only on confirmed 404.
   - Every HN story → OG image scraped from story URL, cached to Supabase storage 7d.
   - Every Reddit post → thumbnail field OR post-screenshot fallback.
   - Every Lobsters story → OG image from linked URL.
   - Every arXiv paper → first-page PNG generated from PDF, cached to Supabase storage 30d.
   - Every npm package → linked GitHub repo owner avatar (from `package.json` `repository` field).
   - Every HF model/dataset/space → author avatar via `huggingface.co/api/users/<author>` (cached 24h).
   - Every Bluesky / DevTo / Twitter post → author avatar (already in payload — verify it surfaces).
   - Every PH launch → `thumbnail.url` field (already in payload — verify it surfaces).
   - **Self-prove**: `audit-images.yml` cron checks 100 random items per source per day, fails if image-coverage < 95%.

3. **ALL WORK** (every page renders, every link resolves, no silent dead code)
   - Every sidebar route returns 200 + non-empty body in production (verified daily by Playwright).
   - Zero console errors and zero blocked image requests on each route (Playwright fail threshold).
   - Zero 404 resource loads in browser network tab.
   - Every collector script invoked by SOMETHING (cron, package.json, or another script). Zombies deleted.
   - Every worker fetcher in registry is also wired into a workflow OR scheduled internally. No dead-disk fetchers.
   - Every cross-mention channel populates the unified `repo-mentions:<owner>/<name>` Redis hash for every tracked repo.
   - **Self-prove**: `audit-coverage.yml` cron — every page checked, every collector reference-checked, every fetcher registered-checked. Fails CI on any drift.

4. **NOT MANUAL** (zero ops to maintain)
   - Heartbeat self-heals: if a source goes RED, alert fires AND a backup writer takes over (worker side fills if GHA fails, vice versa).
   - GH_TOKEN_POOL rotation is automatic (already implemented per `src/lib/github-token-pool.ts` — verify no token-add operation needs human touch).
   - New API key rotations are documented; runbook exists for each external service.
   - `data/_meta/<key>.json` written by EVERY writer with `{ts, writerId, sourceWorkflow, commitSha}` so writer-provenance is visible without a human grep.
   - Sentry pages on EVERY freshness breach, EVERY workflow failure, EVERY image-coverage drop.
   - **Self-prove**: 30 consecutive days of zero manual interventions (no merge to fix data, no manual rerun, no env var hot-fix).

---

## 1. Why this is achievable now (we are 60% there)

The audit shows the bones already exist — I just need to wire the last 40%:

- ✅ **Worker is alive in production** (`trendingrepo-worker-production.up.railway.app/healthz` returns `{ok:true,db:true,redis:true,lastRunAt:13:00:03Z}`).
- ✅ **42 fetchers registered** in worker, 41 of them write keys that today are also written by GHA scripts.
- ✅ **GH_TOKEN_POOL secret exists** with 10 entries (verified in audit §3).
- ✅ **Redis is the source of truth**, with three-tier fallback to bundled JSON.
- ✅ **Supabase is alive** with 6,347 trending items + 7,440 metrics + 1,094 assets.
- ✅ **MCP server live** at `/portal` returning HTTP 200 with 9 tools.
- ✅ **49 of 62 workflows GREEN**.

**What blocks freshness today (audit findings):**
- ❌ Heartbeat dies on `git rebase` conflict on `data/unknown-mentions.jsonl`. 14h stale despite hourly cron.
- ❌ `Cron - freshness check` returns HTTP 503 from production (5/5 fail).
- ❌ `Source health watch` correctly identifies 4 stale sources but the alarm reaches no one.
- ❌ `audit-freshness` failing 3/3 — same cascade.
- ❌ GH_TOKEN_POOL not in workflow `env:` blocks.
- ❌ 27 keys with dual writers, no writer-provenance.
- ❌ `data/_meta/twitter.json` missing entirely.
- ❌ Snapshot trio (consensus, top10, top10-sparklines) cancelled at 6h timeout nightly.
- ❌ `sentry.client.config.ts` missing — browser errors invisible.
- ❌ Image render failures across 8 routes (devto blocked, lobsters 404, bluesky 22 console errors, etc.).
- ❌ Supabase `last_seen_at` 2-3 days stale by source type.

**The plan is to fix exactly these in dependency order.**

---

## 2. Phased execution

### PHASE A — STOP THE BLEEDING (2-3 days, surgical fixes)

Goal: heartbeat back to ≤1h, alarms wake up.

**A1. Fix `scrape-trending` git rebase failure** [P0, ~2h]
- File: [.github/workflows/scrape-trending.yml](../.github/workflows/scrape-trending.yml) (commit step)
- Fix: drop `data/unknown-mentions.jsonl` from this workflow's `git add` set. Ownership moves to `promote-unknown-mentions.yml` exclusively.
- Add: on `git rebase` conflict for any data file, `git checkout --theirs` and continue (data files are append-only/regenerated, conflicts are noise not signal).
- Verify: 3 consecutive successful runs.
- Acceptance: `data/_meta/trending.json` ts < 90 minutes for 12h continuous.

**A2. Wire GH_TOKEN_POOL into all workflow `env:` blocks** [P0, ~1h]
- Files: every `.github/workflows/*.yml` that uses `GITHUB_TOKEN`. Per audit §5: 30+ workflows.
- Fix: add `GH_TOKEN_POOL: ${{ secrets.GH_TOKEN_POOL }}` to each `env:` block where `GITHUB_TOKEN` appears. The pool code already accepts both names.
- Verify: log a one-line "pool size N" at script boot for every cron run.
- Acceptance: scrape-trending log shows `pool size: 11` (10 PATs + the default token).

**A3. Fix `Cron - freshness check` HTTP 503** [P0, ~1h]
- The endpoint at `https://trendingrepo.com/api/cron/freshness-check` returns 503. Investigate the route handler, fix the underlying issue (likely missing Redis env or a dependency).
- Acceptance: 5 consecutive successful runs.

**A4. Fix `Source health watch`** [P0, ~30min]
- Per audit, the workflow correctly detects 4 stale sources but exits failure. Decision: keep it failing (it's correctly red) but route the failure into Sentry alert.
- Wire: add `actions/github-script` step to `captureMessage` to Sentry on fail, with the stale-source list.
- Acceptance: when the next stale source is detected, Sentry receives the event AND a Slack/email alert fires.

**A5. Fix Snapshot trio 6h timeout** [P0, ~2h]
- Files: `snapshot-consensus.yml`, `snapshot-top10.yml`, `snapshot-top10-sparklines.yml`.
- Per audit they all cancel at ~6h. Likely they're using Playwright + waiting on something that never resolves. Investigate, add per-step timeout (≤15min), reduce window if expensive.
- Acceptance: each completes in <30min, 5 consecutive successes.

**A6. Add `data/_meta/twitter.json` writer** [P1, ~1h]
- File: `scripts/collect-twitter-signals.ts` — at end of run, write `data/_meta/twitter.json` with `{ts, count, durationMs, scanCount, repoSignalCount}`.
- Acceptance: file exists and updates after every Twitter cron run.

**A7. Add `sentry.client.config.ts`** [P1, ~30min]
- Mirrors `sentry.server.config.ts` shape. Reads `NEXT_PUBLIC_SENTRY_DSN`. Runs in browser context.
- Acceptance: trigger a deliberate browser error in dev, verify it lands in Sentry.

**Phase A done when**: heartbeat fresh ≤1h for 24 consecutive hours AND all 3 alarms green.

---

### PHASE B — UNIFY ON THE WORKER (5-7 days, migration)

Goal: kill the dual-writer war by making Worker the single source. GHA becomes thin invoker only.

**B1. Add writer-provenance to data-store metadata** [P0, ~2h]
- File: `src/lib/data-store.ts` and `apps/trendingrepo-worker/src/lib/redis.ts`
- Change: every `writeDataStore(key, payload)` also writes to `ss:meta:v1:<key>`:
  ```ts
  { ts, writerId: process.env.WRITER_ID || "unknown", sourceWorkflow: process.env.GITHUB_WORKFLOW, commitSha: process.env.GITHUB_SHA, durationMs }
  ```
- Worker sets `WRITER_ID=worker:<service>:<fetcher>` at boot.
- GHA scripts set `WRITER_ID=gha:<workflow>` at boot.
- Acceptance: `redis-cli HGETALL ss:meta:v1:trending` shows the most recent writer.

**B2. Add `audit-writer-conflict.yml`** [P1, ~1h]
- New workflow runs every 6h. For each of the 27 dual-written keys, check the writer-provenance over the last 24h. Fail if both worker AND gha wrote (oscillation evidence).
- Acceptance: report shows "writer X wins on key Y" for all 27 keys.

**B3. Decommission GHA writers — one source at a time** [P0, ~5 days]
- Order: lowest-risk first.
  1. **Day 1** — `bluesky`, `lobsters`, `devto`. Disable GHA cron schedule (keep workflow_dispatch for manual trigger). Verify worker keeps key fresh.
  2. **Day 2** — `producthunt`, `npm-packages`, `hackernews`. Disable GHA, verify worker.
  3. **Day 3** — `reddit`, `funding-news`. Disable GHA, verify worker.
  4. **Day 4** — `repo-metadata`, `repo-profiles`, `revenue-overlays`, `trustmrr-startups`. Disable GHA, verify worker.
  5. **Day 5** — `trending`, `deltas`, `collection-rankings`, `hot-collections`, `recent-repos`. THE HEARTBEAT — last and most careful. Verify 24h of worker writing keeps freshness ≤1h.
- For each: comment out `schedule:` block in the GHA workflow, keep `workflow_dispatch`. Do NOT delete the workflow yet (rollback path).
- Acceptance per source: worker writes the key on cadence, freshness budget met for 24h, no oscillation in writer-provenance.

**B4. Verify worker has all 27 keys covered** [P0, ~1h]
- Per audit §3: scripts/ writes 33 keys, worker writes 35 keys, 27 overlap. Confirm worker covers all heartbeat keys before B3.
- Acceptance: `node scripts/audit-coverage.mjs` (NEW) prints "all 33 active keys have at least one worker writer."

**B5. Promote worker to single-source for all migrated keys** [P0, ~1h]
- After B3 day 5: archive the now-dormant GHA scripts to `scripts/_archived/` directory. They stay in git history.
- Acceptance: `git ls-files scripts/scrape-*.mjs scripts/sync-trustmrr.mjs scripts/compute-*.mjs` returns the archived path, not active.

**B6. Worker takes over the heartbeat self-heal** [P1, ~3h]
- New worker fetcher: `heartbeat-monitor`. Runs every 15 min. Reads `ss:meta:v1:<key>` for the 4 heartbeat keys. If any breach 1h budget, immediately invoke the relevant fetcher inline (out-of-schedule run).
- Acceptance: simulate a 90-min stale `trending` key; heartbeat-monitor triggers `oss-trending` fetcher within 15min and freshness recovers.

**Phase B done when**: 30 days of zero dual-writer events in `audit-writer-conflict` AND heartbeat self-heal triggered at least once successfully.

---

### PHASE C — UNIFIED CROSS-MENTION + LOGO COVERAGE (4-5 days)

Goal: every repo profile shows mentions across ALL sources AND every entity has a logo.

**C1. Materialize `repo-mentions:<owner>/<name>` Redis hash** [P0, ~1d]
- New worker fetcher: `cross-mentions`. Runs every 30 min after primary mention sources update.
- For each tracked repo (read from `trending` payload), read each mention source key and roll up:
  ```ts
  // Redis hash field per channel
  {
    "hn": { count, lastMentionAt, topUrl },
    "reddit": { count, lastMentionAt, topUrl },
    "bluesky": { count, lastMentionAt, topUrl },
    "devto": { count, lastMentionAt, topUrl },
    "lobsters": { count, lastMentionAt, topUrl },
    "twitter": { count, lastMentionAt, topUrl, engagementTotal },
    "producthunt": { hasLaunch, launchUrl, votes },
    "arxiv": { citationCount, latestPaperId },
    "npm": { downloads24h, downloads7d, downloads30d, packageName },
    "huggingface": { hasModel, hasDataset, hasSpace }
  }
  ```
- Consumer: `src/lib/api/repo-profile.ts` — replace 6 individual synthesizers with single `getCrossMentions(fullName)` reader.
- Acceptance: pick 3 repos (`anthropics/claude-code`, `openai/codex`, `mattpocock/skills`), verify the hash has data in EVERY channel that has data in raw payloads.

**C2. Surface cross-mentions on `/repo/[owner]/[name]`** [P0, ~1d]
- Component: `RecentMentionsFeed.tsx` reads the new hash, renders one row per channel with avatar, count, top URL.
- Acceptance: visit a repo profile in prod, see all 10 channels rendered (or "no mentions" empty state per channel).

**C3. Image coverage — GitHub avatars** [P0, ~2h]
- Audit revealed `RankRow` had a regression (commit `3c7862f7` fixed it).
- Add `audit-images.yml` workflow: pick 100 random repos from `trending`, HEAD `https://avatars.githubusercontent.com/u/<id>?size=80`, fail if any 404.
- Acceptance: 0 missing GitHub avatars over 7 days.

**C4. Image coverage — HN OG image scrape** [P1, ~1d]
- New worker fetcher addition to `hackernews/`: for each story, fetch story URL, parse `<meta property="og:image">`, cache to Supabase storage `og-images/hn/<storyId>.{jpg|png}` (TTL 7d).
- Add `ogImageUrl` field to each story in the `hackernews-trending` payload.
- Acceptance: 95% of stories in last 24h have `ogImageUrl` set.

**C5. Image coverage — arXiv paper thumbnails** [P1, ~1d]
- New worker fetcher: `arxiv-thumbnails`. Daily. For each new paper, fetch `https://arxiv.org/pdf/<id>.pdf`, extract page 1 → PNG via `pdf-poppler` or similar, upload to Supabase storage `paper-thumbnails/<id>.png` (TTL 30d).
- Add `thumbnailUrl` field to `arxiv-recent` payload.
- Acceptance: 95% of last 7 days of papers have `thumbnailUrl`.

**C6. Image coverage — npm package fallback** [P1, ~2h]
- File: `src/lib/logos.ts` — add `npmPackageLogoUrl(packageName)`. Resolve npm package → `repository.url` → GitHub owner → owner avatar.
- Cache resolution in Redis 24h.
- Acceptance: 95% of npm packages on `/npm` show a logo.

**C7. Image coverage — Reddit + Lobsters OG fallback** [P1, ~1d]
- Same as C4 pattern. Reddit posts: use `thumbnail` field if present, else fetch post URL OG. Lobsters: fetch story URL OG.
- Acceptance: 95% coverage per source.

**C8. Image coverage — HF author avatars** [P2, ~3h]
- For each HF model/dataset/space, fetch `https://huggingface.co/api/users/<author>`, extract `avatarUrl`, cache 24h.
- Acceptance: 95% of HF entities have author avatar.

**C9. Image coverage audit workflow** [P0, ~2h]
- `audit-images.yml`: hourly. 50 random items per source per run. HEAD each image URL. Report coverage % per source. Fail CI if any source < 95%.
- Acceptance: dashboard at `/admin/images` shows coverage %, audit fails red on regression.

**Phase C done when**: 7 consecutive days of all sources ≥ 95% image coverage AND `repo-mentions:*` hash populated for top 1000 repos.

---

### PHASE D — KILL ALL ZOMBIES + GHOST ROUTES (2-3 days)

Goal: every script does work, every page is real.

**D1. Resolve 13 zombie scripts** [P1, ~1d]
- Per audit §"Zombie collectors":
  - `defer-data-store-imports.mjs` — DELETE (one-shot migration tool, 2026-03 era)
  - `discover-agent-commerce.mjs` — KEEP if `cron-agent-commerce.yml` is intended to run; investigate why it's NEVER-RUN
  - `enrich-stub-metadata.mjs` — DELETE (one-shot)
  - `fetch-mcp-registries.mjs` — KEEP if needed for refresh-mcp-* workflows; verify
  - `find-smoke-repo.ts` — KEEP (test helper)
  - `probe-agent-commerce-portal.ts` — KEEP (manual diagnostic)
  - `seed-stripe-products.mjs` — KEEP (one-time but still useful)
  - `sentry-test-event.mjs` — KEEP (manual diagnostic)
  - `sweep-v1-chrome.mjs` — DELETE (V1→V3 migration completed)
  - `verify-funding-aliases.ts`, `verify-funding-recall.ts`, `verify-mentions.ts`, `verify-reasons.ts`, `verify-repo-coverage.ts` — KEEP (test/audit helpers)
  - `_github-token-pool-mini.mjs` — INVESTIGATE if still needed; if not delete
- Acceptance: every script in `scripts/` is referenced by SOMETHING (`grep -r script-name`).

**D2. Decide on GHOST sidebar entries** [P2, ~1h]
- "LLM Charts", "Hackathons", "Launch" — currently `Soon` badges with no page.
- Either: implement minimal v0 page OR remove from sidebar.
- Recommendation: REMOVE if no concrete plan within 30 days.
- Acceptance: sidebar has no `Soon` items OR each `Soon` has a tracking issue.

**D3. Decide on MISSING routes** [P2, ~1h]
- `/predict` shows "V1" badge but is client-side only. Either remove badge OR back with real data.
- `/pricing` static — fine.
- `/tools/revenue-estimate` calculator — fine.
- `/submit/revenue` form — fine.
- Acceptance: misleading badges removed.

**D4. Resolve 10 unregistered worker fetchers** [P1, ~1d]
- Per audit §A4 (in earlier addendum):
  - `_template/` — KEEP (skeleton)
  - `agent-commerce/` — DELETE (only seed-data, superseded by GHA script)
  - `ai-blogs/` — REGISTER OR DELETE (substantial code with no caller)
  - `arxiv/` — DELETE (worker arxiv unused, scripts/scrape-arxiv.mjs is the active path)
  - `crunchbase/` — REGISTER (writes `funding-news-crunchbase` which is forever stale today)
  - `github/` — DELETE (stub per code comment)
  - `github-events/` — REGISTER OR DELETE (substantial code)
  - `mcp-so/` — DELETE (stub)
  - `mcp-servers-repo/` — DELETE (stub)
  - `x-funding/` — REGISTER (writes `funding-news-x` which is forever stale)
- Acceptance: every dir under `apps/trendingrepo-worker/src/fetchers/` is either in FETCHERS array OR explicitly named in a "skeleton/stub" comment block.

**D5. Sentry MCP integration** [P2, ~3h]
- Wire Sentry MCP so audit-freshness can attach the last 5 events to its report.
- Acceptance: when audit-freshness fires red, the failure includes the last 5 Sentry events for context.

**Phase D done when**: `npm run lint:no-zombies` (NEW) passes AND all sidebar entries either have a page OR are removed.

---

### PHASE E — SELF-PROVING AUDIT (1-2 days)

Goal: the system audits itself and reports daily.

**E1. `audit-freshness.yml` — fixed and tightened** [P0, ~2h]
- After Phase A, this workflow already runs. Tighten: budget per source category from §0.
- Output: `data/_meta/audit-freshness.json` with per-key status (GREEN/YELLOW/RED) and the breach reason.
- Acceptance: dashboard at `/admin/staleness` reads this JSON and renders a 1-screen status board.

**E2. `audit-coverage.yml` — new** [P0, ~3h]
- Hourly. Check:
  - Every workflow file invokes a real script.
  - Every script in `scripts/` is referenced.
  - Every fetcher in `apps/trendingrepo-worker/src/fetchers/` is in FETCHERS or marked stub.
  - Every sidebar nav item has a corresponding `page.tsx`.
- Output: `data/_meta/audit-coverage.json`.
- Acceptance: visible on `/admin/coverage`.

**E3. `audit-images.yml` — new** [P0, see C9]
- Acceptance: covered in C9.

**E4. `audit-writer-provenance.yml` — new** [P1, see B2]
- Acceptance: covered in B2.

**E5. Sentry pages on EVERY breach** [P0, ~2h]
- Each audit workflow on failure: `captureMessage` with full context to Sentry.
- Sentry alert rule: any audit-* failure → Slack channel + email.
- Acceptance: deliberately fail one audit, verify alert reaches the channel within 60s.

**E6. Status badge on README** [P2, ~1h]
- Daily-updated SVG badge: "Freshness: GREEN" / "Image coverage: 97%" / "Workflows: 60/62 GREEN".
- Pulls from `data/_meta/audit-*.json`.
- Acceptance: badge visible in repo README and updates within 24h of any change.

**Phase E done when**: 30 days continuous green status on README.

---

### PHASE F — DOCUMENTATION + RUNBOOKS (ongoing during F-A)

These ship alongside the phases above so the system is operable by anyone, not just whoever built it.

**F1. Update `.env.example`** — add the 35+ undocumented env vars from audit §4. [~1h]
**F2. Update `docs/ENGINE.md`** — every drift identified in audit gets a fix. [~2h]
**F3. Update `docs/SITE-WIREMAP.md`** — same. [~2h]
**F4. New `docs/RUNBOOK.md`** — for each external API: how to rotate keys, who has dashboard access, on-call escalation. [~3h]
**F5. New `docs/ARCHITECTURE-WORKER.md`** — the worker is now the primary runtime. Document its scheduler, its registry, how to add a fetcher. [~2h]

---

## 3. Effort + sequencing

| Phase | Effort | Wall-clock | Blockers |
|---|---|---|---|
| A — Stop the bleeding | ~10h | 2-3 days | None |
| B — Unify on worker | ~25h | 5-7 days | Phase A |
| C — Cross-mention + logos | ~30h | 4-5 days | Phase B (writer-provenance) |
| D — Zombie cleanup | ~10h | 2-3 days | Phase A |
| E — Self-proving audit | ~12h | 1-2 days | Phase A, B, C |
| F — Docs (parallel) | ~10h | ongoing | None |

**Total**: ~95 engineering hours, 2-3 weeks wall-clock with focus.

---

## 4. Verification (the system proves itself)

| Acceptance criterion | Verification artifact | Cadence |
|---|---|---|
| Heartbeat ≤ 1h | `data/_meta/audit-freshness.json` + `/admin/staleness` | hourly |
| Per-source ≤ 6h | same | hourly |
| Archive ≤ 24h | same | daily |
| Supabase fresh ≤ 24h | `audit-supabase-freshness.yml` | daily |
| Image coverage ≥ 95% | `data/_meta/audit-images.json` + `/admin/images` | hourly |
| Every page renders | `audit-playwright.yml` (NEW — replaces my manual Playwright pass with a cron) | daily |
| Zero zombie scripts | `npm run lint:no-zombies` | every commit |
| Every fetcher registered | `audit-coverage.yml` | hourly |
| Cross-mention populated | `audit-cross-mentions.yml` (samples 100 repos, fails if <95% have ≥3 channels) | daily |
| Writer-provenance unique | `audit-writer-conflict.yml` | every 6h |
| Sentry alerts wake humans | manually verified once after Phase E5; thereafter the absence of alerts IS the verification | continuous |

---

## 5. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Worker scheduler crashes silently | Worker writes `lastRunAt` to `/healthz`; if older than 30 min, GHA `cron-worker-watchdog.yml` (NEW) restarts service via Railway API |
| Migration of heartbeat (B3 day 5) breaks production | Keep GHA workflow_dispatch enabled for 7 days post-cutover; one-button rollback |
| Image OG scrapes hit rate limits | Cache to Supabase storage with long TTL; backfill in batches |
| Supabase storage costs spike | Set storage quota; alert at 80%; thumbnails are cheap (~50KB × 100K papers = 5GB) |
| Sentry quota burns from too many alerts | Use `Sentry.captureMessage` with fingerprint dedup; alert digest, not per-event |
| New zombie scripts accumulate post-cleanup | `lint:no-zombies` blocks PRs adding unreferenced scripts |

---

## 6. Out of scope (do NOT do this in this plan)

- ❌ Visual redesign of any page (V4 design system work is a separate audit/plan).
- ❌ New product features (Hackathons, Launch, LLM Charts pages — decide in D2).
- ❌ Stripe billing activation (separate concern).
- ❌ Migration off Vercel (this plan keeps Vercel as Next.js host).
- ❌ Multi-region Redis (overkill for current scale).
- ❌ Migration off GitHub for source control (irrelevant).

---

## 7. Done criteria — single sentence

The plan is done when **for 30 consecutive days**, every page renders ≤ 1s with zero console errors, every entity has a logo, every freshness budget holds with zero manual intervention, and `/admin/staleness` shows GREEN for every source.

If we hit that, we built the thing right.

---

## 8. Next concrete action

Phase A1 — fix the `scrape-trending` git rebase. ~2 hours. Highest leverage, blocks nothing. Start there.
