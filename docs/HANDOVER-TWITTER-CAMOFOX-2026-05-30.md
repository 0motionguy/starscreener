# HANDOVER — Twitter via Camofox + Nitter (2026-05-30)

This session brought Twitter mentions back from the dead (0 posts → 270 in one
run). This doc is the next-session handover: how the pipeline works, what's
still loose, and the operator's open questions answered concretely.

**Read this first, then `docs/HANDOVER-VELOCITY-PHASE2-2026-05-29.md` for the
broader engine context.**

---

## ✅ What shipped this session

| Layer | Before | After |
|---|---|---|
| Nitter instance | `nt.vern.cc` (returned 418 — dead) | `nitter.privacyredirect.com` (alive behind Anubis) |
| Anti-bot bypass | none (direct `fetch()` hit Anubis PoW) | camofox-browser (Firefox + C++-level fingerprint spoof, port 9377) |
| HTML retrieval | n/a — got Anubis challenge page | `POST /tabs/{id}/evaluate` with Bearer auth → raw HTML for cheerio |
| Session reuse | n/a | one camofox tab/run; JWT persists across 50 search URLs |
| Run time | ~30s (failed instantly) | ~12 min (50 repos × 12s render wait + nav/eval) |
| Schedule | `19 * * * *` hourly (existing) | unchanged — `worker scheduler` runs it automatically |
| **Result** | **0 posts, `degraded: true` for 5 weeks** | **270 posts, 49/50 repos succeeded, `degraded: false`** |

**Commits shipped:** `7edd34a88` (worker code), plus camofox container deployed
on `toolbox_edge` (image `camofox-browser:135.0.1-x86_64`, ~1.07 GB, 244 MB RSS).

**Box state to be aware of:**
- `camofox-browser` container — `/opt/camofox-browser` repo, `docker run`-managed
  (no compose file yet), `127.0.0.1:9377` host-bound + on `toolbox_edge` net
- Worker `.env` (`/opt/toolbox-trendingrepo-worker/.env`) gained:
  - `CAMOFOX_URL=http://camofox-browser:9377`
  - `CAMOFOX_API_KEY=<48-char hex>` (auto-generated, also set in camofox container env)
  - `TWITTER_USE_CAMOFOX=1`
- ⚠️ The camofox `.env` and the API key are NOT in sops yet. If
  `toolbox-secrets-decrypt.service` runs, it may overwrite the worker `.env`
  and lose the key. **Add to sops next session before any sops decrypt.**

---

## 🧠 How the pipeline actually works (the technical primer)

This answers the operator's "I don't know the technicality of Nitter" — none
of this needs an LLM; it's pure browser + HTML parse.

### Nitter

- **Nitter** is an open-source Twitter/X frontend (`zedeus/nitter`). It scrapes
  X's web API using *guest tokens* and renders results as a static HTML site
  (no JS, no React) at URLs like `/search?f=tweets&q=<query>`.
- **Public Nitter instances** (run by volunteers) host Nitter against their
  own pool of guest tokens. Many died in 2023–2024 when X cracked down on
  guest token issuance, but a few keep working by rotating tokens / scraping
  via residential IPs.
- **Anubis** (`TecharoHQ/anubis`) is an anti-bot layer fronting many surviving
  Nitter instances. It serves a SHA-256 proof-of-work challenge that requires
  a real browser (`v1.25.0`, algorithm `preact`). Hand-rolling the verify
  protocol works for the PoW math but the JWT validation chain ties to a real
  browser fingerprint that's painful to spoof from `fetch()` — every attempt
  this session got 403/500.

### Our path: camofox-browser

- `jo-inc/camofox-browser` wraps **Camoufox** (Firefox fork by `daijro`) in a
  REST API. Camoufox spoofs `navigator`, WebGL, WebRTC fingerprints at the C++
  level — Anubis can't distinguish it from a real Firefox.
- The worker fetcher:
  1. `POST /tabs` with `{userId, sessionKey, url}` → camofox launches a tab,
     navigates to the initial URL, Anubis solves automatically, JWT cookie
     persists in the tab session.
  2. For each of the next ~50 search URLs:
     - `POST /tabs/{id}/navigate` with the new URL (same JWT, no new Anubis)
     - **Sleep 12 s** — Nitter still has to fetch upstream tweets from X and
       render the `.timeline-item` rows. `networkidle` from camofox fires too
       early on some queries; the empirical 12 s gives consistent results.
     - `POST /tabs/{id}/evaluate` with `expression: "document.documentElement.outerHTML"`
       and `Authorization: Bearer ${CAMOFOX_API_KEY}` → raw HTML
     - Existing `parseNitterSearchHtml` cheerio parser runs unchanged.
  3. `DELETE /tabs/{id}` cleanup in `finally`.
- **No LLM** anywhere in the loop. It's browser + HTML parser, that's it.

### Refresh schedule today

- Worker scheduler (`dist/index.js --cron`) fires the `twitter` fetcher at
  `19 * * * *` (hourly at minute 19). Each run takes ~12 min and processes
  `MAX_REPOS_PER_RUN = 50` repos. No GH Action involved.
- **Critical constraint** (see `reference_branch_deploy_no_main_crons` memory):
  prod runs off `bot/swarm-a6-producthunt-reader`, not `main`, and GitHub
  schedules only fire from `main`. Any new cron MUST be either a worker
  fetcher or a TOOLBOX `cron.d` entry.

---

## 🚨 Operator's #1 concern: mentions must REMAIN on profiles

**Current state — it's the gap.** The fetcher writes `twitter-repo-signals`
last-write-wins. Each hourly run, posts that don't reappear in the new search
disappear from the slug. The PROFILES that read mentions don't see them
accumulate.

**But there's an existing pattern:** `mentions-ledger`. It reads 5 upstream
mention slugs (`hackernews-repo-mentions`, `reddit-mentions`,
`bluesky-mentions`, `devto-mentions`, `lobsters-mentions`) and projects them
into Redis SETs keyed by stable mention IDs. SADD dedupes, HINCRBY counts.
Cron `7,22,37,52 * * * *` (every 15 min). Already powers the trending hub's
Mentions cell and `social.<source>.mentions` on profiles.

**Twitter is NOT currently in `LEDGER_SOURCES`** ([mentions-ledger/index.ts:61](apps/trendingrepo-worker/src/fetchers/mentions-ledger/index.ts#L61)).
That's the wire-up gap. This is the project_twitter_dual_write_gap memory
item — it's still the truth, just for a different reason (was Apify; now
camofox/Nitter writes the slug but the ledger doesn't read it).

### Quick win #1: wire `twitter-repo-signals` into mentions-ledger (~2 h)

Two pieces:

1. **Schema bridge.** The slug today is a FLAT `posts: [{ id, repoFullName, ... }]`
   array; the ledger expects `mentions: Record<fullName, {<thingArr>: Array<{id}>}>`.
   Either:
   - **(a)** Add a small adapter inside `mentions-ledger` that reads the flat
     slug and groups by `repoFullName` at projection time. Cleaner — no slug
     schema change.
   - **(b)** Refactor the twitter fetcher to write the nested shape
     alongside (or instead of) the flat one. More invasive, breaks downstream
     readers if any depend on the flat shape.

   **Recommendation: (a)**. ~30 LOC, no schema migration.

2. **Source registration.** Add `'twitter'` to `LEDGER_SOURCES`,
   `'twitter-repo-signals'` to `SLUG_BY_SOURCE`, and an extractor in the
   per-source `projectMentions` function that pulls `post.id` (numeric tweet
   ID — already stable + dedupable). Tweet IDs are unique per tweet across all
   of Twitter, so SADD dedup works out of the box.

After this lands: every tweet ever harvested becomes a permanent member of
`ss:mentions:v1:<owner>/<name>:twitter`. Profiles count `SCARD` of that set.
Mentions accumulate forever, exactly what the operator asked for.

**Verification:** after running mentions-ledger once with twitter wired,
`SCARD ss:mentions:v1:vercel/next.js:twitter` should be ≥ count of posts in
the slug for that repo. Across hours, the SCARD only grows.

---

## 🚨 Operator's #2 concern: scan a single newly-dropped repo on demand

**The pattern already exists** — see [drop-intake-drain/index.ts](apps/trendingrepo-worker/src/fetchers/drop-intake-drain/index.ts):
the web /drop POST handler `LPUSH`es onto `queue:drop-a-repo`; the
drop-intake-drain fetcher `RPOP`s every minute and calls `/api/repo-submissions/[id]/enrich`.
Same shape works for twitter.

### Quick win #2: `drop-twitter-drain` fetcher (~3 h)

- New worker fetcher, schedule `* * * * *` (every minute)
- Consumes a new queue `queue:drop-twitter` (single repo fullName per item)
- For each repo: open ONE camofox tab → navigate → eval → parse → write
  posts into `twitter-repo-signals.posts` (append + dedupe by `id`) AND
  emit into `ss:mentions:v1:<fullName>:twitter` directly. Pickup latency
  ~60 s.
- **Producer**: a single-line addition to the web handler that already
  `LPUSH`es `queue:drop-a-repo`. When the new drop is accepted, also
  `LPUSH queue:drop-twitter` with `{ fullName }`.

After this lands: a repo dropped via /drop has a Twitter mentions section
within ~1–2 min of submission (60s queue pickup + ~12s scan). The operator's
"scan one repo by name" ask is satisfied.

**Alternative path the operator implicitly asked about**: instead of a
queue + drain, you could expose a one-shot HTTP endpoint on the worker (e.g.
`POST /scan/twitter/{owner}/{name}`) that does the scan inline. **Don't do
this.** Inline scans hold an HTTP connection open for 12 s, fight for the
single camofox tab, and lose retry/observability. The queue pattern matches
the existing engine and is the cheap correct answer.

---

## 🚨 Operator's #3 concern: refresh cadence for the whole repo set

**Today**: 50 repos/hour × 24 h = 1200 repos/day. Full registry is ~1576
repos, so it takes ~31 hours to cover everyone once. **Hot trending repos
need faster refresh; cold-tail repos can wait.**

### Recommendation: tier the schedule (~4 h)

| Tier | What's in it | Cadence | Mechanism | Run time |
|---|---|---|---|---|
| **Hot** | Top 50 by 24 h star velocity (existing) | hourly `19 * * * *` | current twitter fetcher, no change | ~12 min |
| **Warm** | Top 51–500 by velocity | every 6 h `7 */6 * * *` | new `twitter-warm` fetcher, MAX_REPOS=200 | ~40 min × 4/day |
| **Cold** | Registry tail (rank 501+) | daily `33 3 * * *` | new `twitter-cold` fetcher, walks ~200 repos/run, queue-style cursor in Redis so it covers everyone over ~5 days | ~40 min |
| **On-drop** | Newly added repos | `* * * * *` | `drop-twitter-drain` (quick win #2) | ~30 s/repo |

**Tier selection** mirrors the velocity engine's pattern (top-by-deltas).
Use the existing helper:
[`rankedRegistryFullNames(registry, N)`](apps/trendingrepo-worker/src/lib/util/registry-candidates.ts)
or read `star-activity-deltas` and sort by `delta_24h.value`.

**Single camofox bottleneck.** Today camofox runs 1 tab serially. If two
tiers want to run at the same time, they'll fight for the browser. Two
options:
- **(a)** Stagger schedules so they never overlap (cheap; the schedule above
  already does this).
- **(b)** Allow N parallel tabs in camofox + parallel fetches in the worker
  (cuts hot run from 12 min → ~3 min at N=4). Requires camofox memory
  headroom (each tab ~80–150 MB Camoufox heap) and worker concurrency
  control. **Effort: ~3 h**. Worth it if you want hot tier to finish in
  under 5 min, and want to expand `MAX_REPOS_PER_RUN`.

---

## 🛠 Hardening (in priority order)

| # | Item | Effort | Why |
|---|---|---|---|
| H1 | **Wire `twitter-repo-signals` into `mentions-ledger`** (quick win #1) | 2 h | Mentions persist on profiles. This is *the* user-visible win. |
| H2 | **Add `twitter` to `SOURCE_CONTRACTS`** | 15 min | Currently logs `no contract — diagnostics will be partial` on every run + isn't in freshness monitoring → silent death wouldn't page. Same pattern as `velocity-backfill` entry shipped this session. |
| H3 | **`drop-twitter-drain` fetcher** (quick win #2) | 3 h | New repo Twitter coverage in <2 min vs ~31 h. |
| H4 | **Tier fetchers (`twitter-warm`, `twitter-cold`)** | 4 h | Full registry coverage within ~5 days; hot tier unchanged. |
| H5 | **Retry on `camofox navigate 500`** | 30 min | 1 of 50 repos failed this run; likely Anubis JWT renewing. Add 1 retry with a fresh tab. |
| H6 | **Fallback instance chain** (`privacyredirect` → `nuku.trabun` → ...) | 1 h | privacyredirect.com going dark = total Twitter outage today. Per-run fallback restores resilience. The `_twitter-collector.ts` script's `DEFAULT_NITTER_INSTANCES` array is already operator-curated; reuse it. |
| H7 | **Parallel camofox tabs (N=4)** | 3 h | Cuts hot-tier runtime 12 min → ~3 min. Required for any meaningful registry expansion. |
| H8 | **Persist camofox API key in sops** | 30 min | Currently in box `.env` only. Next sops decrypt overwrites it. |
| H9 | **Compose-ify camofox** (`docker compose` in `/opt/camofox-browser/` with restart policy, log driver) | 30 min | Today it's a raw `docker run` — survives reboot via `--restart unless-stopped` but no compose hygiene. |

Net effort for the operator-visible wins (H1+H3+H4): ~9 h.
Full hardening sweep: ~14 h.

---

## 🔍 Open exploration items (not blockers)

- **RSS endpoint test.** I probed `/search/rss?f=tweets&q=...` on
  `nitter.privacyredirect.com` from the box. It also redirects through Anubis
  → no cheap escape. The HTML path stays correct.
- **Multi-instance pool to reduce per-instance load**: rotate across
  `privacyredirect.com`, `nuku.trabun.org`, future instances per query. Lower
  per-instance load → fewer bans → instances live longer. Pairs with H6.
- **Reduce 12 s wait via smarter wait-for-selector.** camofox has
  `POST /tabs/{id}/wait` with a `selector` param. Wait specifically for
  `.timeline-item` or `.no-results` to appear. Probably cuts the wait to
  3–6 s, reducing hot-tier run by ~5 min. **Effort: 2 h**. Test carefully —
  some queries legitimately return 0 results and shouldn't wait forever.
- **Persist tab across runs.** Today each fetcher run creates and tears down
  a tab. If we kept a long-lived tab (camofox supports it: `sessionKey` +
  re-use), Anubis JWT wouldn't need re-issue. **Effort: 1 h**, but risk:
  Anubis JWTs do expire (~30 min observed), so the tab will eventually need
  recreation. Manage with a simple TTL on the tab handle.
- **Camofox memory pressure.** 244 MB RSS today with 1 active tab. The
  container has no explicit memory limit; if many concurrent tabs run, OOM
  risk. Watch `docker stats camofox-browser` after H7. Cap with
  `--memory=2g` when going parallel.
- **Test if Nitter rate-limits our box IP after many queries.** If yes,
  needs egress rotation. Today 50/hour is fine; at 500/hour we might hit it.

---

## 🎯 Decision matrix for the operator

If you want to spend just one block of time next session:

- **2 h: wire mentions to persist (H1).** This is the only thing the
  hot-tier already produces but nobody sees on profiles. Highest user-visible
  impact for the smallest effort.
- **5 h: H1 + H3 (on-drop scan).** Closes the two named concerns.
- **9 h: H1 + H3 + H4 (tiered cadence).** Full coverage system. The
  "scan everyone in a good cycle" answer.
- **14 h: full sweep.** Architecturally complete; parallel tabs unlock
  bigger MAX_REPOS, retry handles flake, sops persists the key.

---

## 📋 Verification commands

```bash
# camofox health
ssh toolbox 'curl -s http://localhost:9377/health' | python3 -m json.tool

# trigger twitter fetcher one-shot
ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 node /app/dist/index.js twitter' 2>&1 | tail -8

# read fresh slug
ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 node -e "import(\"/app/dist/lib/redis.js\").then(async({readDataStore})=>{const p=await readDataStore(\"twitter-repo-signals\");console.log(JSON.stringify({totalPosts:p.totalPosts,degraded:p.degraded,failedRepos:p.failedRepos,fetchedAt:p.fetchedAt,sampleAuthor:p.posts[0]?.author}));process.exit(0)})"'

# After H1 lands: confirm mentions accumulate
ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 node -e "import(\"/app/dist/lib/redis.js\").then(async()=>{const {getRedis}=await import(\"/app/dist/lib/redis.js\");const r=await getRedis();const n=await r.scard(\"ss:mentions:v1:vercel/next.js:twitter\");console.log(\"twitter mentions for vercel/next.js:\",n);process.exit(0)})"'

# Watch camofox memory under load
ssh toolbox 'docker stats --no-stream camofox-browser'
```

---

## 📋 Paste-ready kickoff prompt

> Read `docs/HANDOVER-TWITTER-CAMOFOX-2026-05-30.md` fully, then the velocity
> handover from 2026-05-29. The Twitter pipeline is LIVE on TOOLBOX (camofox
> on `toolbox_edge`, worker fetcher routes via Bearer + /evaluate, 270 posts
> in last run, schedule `19 * * * *`). GOAL: pick a chunk from the decision
> matrix — operator's stated concerns are persistent mentions (H1), on-drop
> scan (H3), and registry-wide cadence (H4). Probably start with H1+H2
> (mentions persist + SOURCE_CONTRACTS hygiene); H1 makes the existing
> hourly data show up on profiles, no architecture work needed.
> Prod = TOOLBOX/Cloudflare, NOT Vercel. Branch is
> `bot/swarm-a6-producthunt-reader`; no GH Actions schedules — use worker
> fetchers or TOOLBOX `cron.d`. Get consent before any deploy.
