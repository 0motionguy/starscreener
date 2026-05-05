---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# AGN-1502 — Backend data-store read-path conformance refresh

**Date**: 2026-05-05
**Auditor**: bot/sre on `bot/sre/AGN-819` (read-only audit; uncommitted edits NOT touched)
**Parent**: AGN-58 (Sprint 1 STARSCREENER kickoff audit)
**Scope**: `src/app/**` and `src/lib/**` consumers of cached/redis-backed entities
**Mode**: Read-only. No code changes. Patch tasks (if needed) must be opened separately.

---

## 0. Recap of the canonical contract

Source of truth: `src/lib/data-store.ts` (AGN-670/671).

The data-store is the **only** sanctioned read path for the 30 JSON
collector payloads bundled into the Vercel deploy. Every consumer
must satisfy:

1. **Three-tier read.** `Redis → bundled JSON (data/<slug>.json) →
   in-memory last-known-good`. The data-store does this internally;
   callers must NOT reorder or short-circuit.
2. **Standard return envelope.** Reads return
   `DataReadResult<T> = { data: T | null, source: "redis"|"file"|"memory"|"missing",
   ageMs: number, fresh: boolean, writtenAt?: string }`.
3. **Single-flight coalescing.** AGN-671 added per-key `inflightReads`
   in `DefaultDataStore.read()`. Callers do NOT need to add their own
   dedupe on the *Redis read* — but reader libs still own a
   `refreshXxxFromStore()` 30s rate-limit + module-local cache.
4. **No direct redis client construction** for cached payloads. The
   only sanctioned bypass is `getDataStore().redisClient()` for
   non-payload primitives (Stripe idempotency locks, recovery
   counters, GitHub PAT pool). All such use must be code-reviewed.
5. **No `readFileSync(process.cwd(), "data", ...)`** for collector
   payloads. The data-store handles the file fallback. Direct file
   reads are allowed only for: docs/spec assets, build-output, log
   tails, JSONL queue files (`.data/`), and admin-only diagnostic
   artifacts that aren't (yet) dual-written to Redis.

Project-internal version of this contract: `src/lib/CLAUDE.md`.

---

## 1. Compliant consumers (use `getDataStore()`)

All of the following call `getDataStore()` (or `createDataStore()` with
documented justification) and consume the standard `DataReadResult<T>`
envelope. No bypass.

### 1.1 App routes / pages

| File | Notes |
| ---- | ----- |
| `src/app/s/[shortId]/page.tsx:11,42` | `read<CompareSharePayload>` |
| `src/app/api/worker/pulse/route.ts:7,33` | `getDataStore()` for write |
| `src/app/api/worker/health/route.ts:30,178` | uses `writtenAtMany()` (AGN-468 batch path) |
| `src/app/api/webhooks/stripe/route.ts:22,126` | `redisClient()` for SETNX idempotency lock — sanctioned bypass |
| `src/app/admin/scoring-shadow/page.tsx:24,85` | server component; calls store.read directly |
| `src/app/trending/page.tsx:6,66` | trending SSR |
| `src/app/api/skills/route.ts:9,45` | |
| `src/app/api/cron/llm/sync-models/route.ts:17,121` | |
| `src/app/api/cron/llm/aggregate/route.ts:22,87,126,147,439` | |
| `src/app/api/cron/freshness/state/route.ts:16,524` | uses store + meta-file fallback (see §2.1) |
| `src/app/api/cron/sources-auto-recover/route.ts:10,105,151` | `redisClient()` for `recovery:*` counters — sanctioned bypass |
| `src/app/api/og/star-activity/route.tsx:25,165` | |
| `src/app/api/compare/share/route.ts:18,97` | |
| `src/app/api/compare/github/route.ts:34,178` | |
| `src/app/api/compare/payloads/route.ts:9,60` | |
| `src/app/api/admin/unknown-mentions/route.ts:18,77` | uses store for promoted file |
| `src/app/api/admin/pool-state/route.ts:6,582` | uses store + reads `data/_meta/<source>.json` (see §2.2) |
| `src/app/api/pipeline/deltas/route.ts:37,159` | |

### 1.2 Reader libraries (`src/lib/*`)

All use the canonical `refreshXxxFromStore()` shape: `getDataStore().read(slug)`,
30s rate-limit, in-flight dedupe, module-local cache, file fallback (when
the source predates AGN-670 and `data/<slug>.json` is bundled).

`arxiv.ts`, `agent-commerce.ts`, `aiso-persist.ts`, `base-x402-onchain.ts`,
`bluesky.ts`, `bluesky-trending.ts`, `briefs.ts`, `collection-rankings.ts`,
`devto.ts`, `devto-trending.ts`, `dune-x402-volume.ts`,
`ecosystem-leaderboards.ts`, `engagement-composite.ts`,
`funding-news.ts`, `funding/aggregate.ts`, `github-events.ts`,
`github-token-pool.ts`, `github-token-pool-aggregate.ts`,
`hackernews.ts`, `hackernews-trending.ts`, `hf-spaces.ts`,
`hf-datasets.ts`, `hot-collections.ts`, `huggingface.ts`,
`lobsters.ts`, `lobsters-trending.ts`, `manifest-store.ts`,
`mcp-detail.ts`, `model-usage.ts`, `npm.ts`, `npm-dependents.ts`,
`producthunt.ts`, `recent-repos.ts`, `reddit-all-data.ts`,
`reddit-baselines.ts`, `reddit-data.ts`, `repo-category-details.ts`,
`repo-metadata.ts`, `repo-profiles.ts`, `repo-why.ts`,
`research-signals.ts`, `revenue-benchmarks.ts`, `revenue-overlays.ts`,
`revenue-startups.ts`, `rss-feeds.ts`, `solana-x402-onchain.ts`,
`star-activity.ts`, `top10/snapshots.ts`, `top10/sparkline-store.ts`,
`trending.ts`, `twitter/signal-data.ts`, `twitter/storage.ts`.

Generic shared factory: `src/lib/data-store-reader.ts` — `createPayloadReader<T>()`.
New readers should wire through this rather than open-coding the
30s + dedupe boilerplate.

### 1.3 Sanctioned `redisClient()` bypass for non-payload primitives

| File | Use | OK? |
| ---- | --- | --- |
| `src/lib/github-token-pool.ts:452,748` | per-token `remaining`/`reset` counters | yes — non-payload |
| `src/lib/stripe/idempotency.ts:18` (type only) | SETNX lock for Stripe events | yes — non-payload, idempotency primitive |
| `src/app/api/webhooks/stripe/route.ts:126` | same | yes |
| `src/app/api/cron/sources-auto-recover/route.ts:105,151` | recovery:* event/streak keys | yes — counters |

These are correct usages of the documented `redisClient()` escape hatch.

### 1.4 Documented scoped factory

| File | Justification |
| ---- | ------------- |
| `src/lib/tier-list/store.ts:43,62` | Uses `createDataStore({ redisFactory })` because the default factory has a `this`-binding bug on `client.set` for ioredis. The override calls `client.set(...)` as a method. **NOTE — hidden bypass:** the comment at top says "the default factory's stored `setFn` is unbound." That bug should be fixed in the default factory (single source of truth) and the tier-list scoped factory removed. See §3 fix-list F4. |

---

## 2. Bypass offenders (direct redis or direct fs reads of payloads)

### 2.1 Direct `@upstash/redis` instantiation outside data-store

These modules `require("@upstash/redis")` and construct `new mod.Redis(...)`
directly instead of going through `getDataStore().redisClient()` (or
`getDataStore().read()` for payloads):

| Severity | File:line | Class | Notes |
| -------- | --------- | ----- | ----- |
| LOW | `src/lib/api/rate-limit-store.ts:273` | rate-limiter | This is the *original prior-art module* the data-store was modeled after. It cannot use the data-store (data-store uses *it* indirectly). Leave as-is. |
| LOW | `src/lib/api/edge-response-cache.ts:109` | edge KV cache | Edge runtime — cannot use the nodejs-only data-store factory. Acceptable if it stays edge-only; document. |
| **MED** | `src/lib/llm/redis-streams.ts:123` | LLM stream cursor | Standalone Redis streams client. Should use `getDataStore().redisClient()` so a single client + connection pool is shared. **Fix-list F1.** |
| **MED** | `src/lib/redis.ts:145` | runtime-redis (hash ops) | Implements `RuntimeRedis` (HSET/HGETALL etc) with its own dual ioredis/upstash branch. Either consolidate via `getDataStore().redisClient()` (and extend `RedisClientLike` to expose `hincrby/hset/hgetall`) or document why two clients per process is intentional. **Fix-list F2.** |
| LOW | `src/lib/tier-list/store.ts:62` | covered above (§1.4) | scoped factory; track as F4 |

### 2.2 Direct file reads of collector payloads (data/<slug>.json)

These bypass the data-store's three-tier read — they hit the bundled
JSON directly without consulting Redis first. **They will NOT see fresh
collector writes** between deploys, the exact failure mode the
data-store was built to fix.

| Severity | File:line | What it reads | Why it's a bypass |
| -------- | --------- | ------------- | ----------------- |
| **HIGH** | `src/app/sitemap-news.xml/route.ts:76` | `data/hackernews-trending.json` (via `readJsonSafe`) — and likely others around it | Sitemap is request-time. Direct `fs.readFileSync(process.cwd(), "data", ...)` defeats Redis tier. Fresh HN posts won't show until next deploy. **Fix-list F5.** |
| **HIGH** | `src/app/api/admin/overview/route.ts:142` | `AUTOCOMPLETION_CHECKLIST_FILE` | Admin tile shows stale autocompletion progress between deploys. Should use store with slug `autocompletion-checklist` (or document that this file is build-only). **Fix-list F6.** |
| MED | `src/app/api/cron/freshness/state/route.ts:468` | `data/_meta/<source>.json` (per-source meta) | Meta files are written by collectors at write-time but not (yet) dual-written to Redis. Not strictly a payload, but the freshness API is the public source-of-truth on staleness, so this should also be in Redis. **Fix-list F7.** |
| MED | `src/app/api/admin/pool-state/route.ts:574` | `data/_meta/<source>.json` | Same as F7 — duplicate meta-file consumer. Fix together. **F7.** |
| LOW | `src/app/admin/staleness/page.tsx:57` | `data/staleness-report.json` (sweeper output) | Documented in-file as "daily diagnostic, not live data." Acceptable for now. Track in F8 if/when sweeper dual-writes. |
| LOW | `src/app/admin/unknown-mentions/page.tsx:57` | `data/unknown-mentions-promoted.json` | The route handler `src/app/api/admin/unknown-mentions/route.ts:77` uses the data-store for the same payload. The page version is a duplicated read path — should call the store instead for consistency. **Fix-list F9.** |
| LOW | `src/app/api/admin/scan-log/route.ts:184` | log tail under `data/scan-logs/` | Log tail is fine — not a collector payload. No-op. |
| LOW | `src/app/api/openapi.json/route.ts:63` | `docs/openapi.json` | Doc spec, not a collector payload. No-op (documented in-file). |

### 2.3 Library-level direct file readers WITHOUT a `refreshXxxFromStore()`

The convention is: file read is allowed *inside* a reader as the file
fallback tier, but only if the reader also has a `refreshXxxFromStore()`
function that hits Redis first. The list below is just the ones I
inspected explicitly to confirm the wrap is present (already in §1.2).

Modules where I did NOT find a paired `refreshXxxFromStore()` and the
file read is the only path:

| Severity | File:line | Notes |
| -------- | --------- | ----- |
| LOW | `src/lib/aiso-queue.ts:128,204` | Reads `.data/<queue>.jsonl`. Queue file, not a snapshot. No data-store equivalent expected. OK. |
| LOW | `src/lib/drop-events.ts:105` | JSONL drop-events log. Append-only, not a snapshot. OK. |
| LOW | `src/lib/aiso-persist.ts:97` | Persist queue spool. Append/read. OK. |
| LOW | `src/lib/webhooks/publish.ts:169,247` | dead-letter queue file. OK. |
| LOW | `src/lib/mcp/usage.ts:211,350` | Has a `refreshXxxFromStore` elsewhere; verify on next visit. |
| LOW | `src/lib/pipeline/storage/file-persistence.ts:126` | Pipeline-internal storage — by-design file path. OK. |
| LOW | `src/lib/manual-repos.ts:115` | JSONL roster, append-only. OK. |
| LOW | `src/lib/funding/repo-events.ts`, `funding/aliases.ts`, `derived-repos/loaders/pipeline-jsonl.ts`, `repo-reasons.ts`, `repo-predictions.ts`, `repo-ideas.ts`, `npm-daily.ts`, `dune-x402-volume.ts` (file path also covered in §1.2 with refresh wrap), `revenue-submissions.ts`, `twitter/signal-data.ts` (covered in §1.2) | All loader-style modules. Verify each has a paired refresh; spot-checked OK for the ones in §1.2. |

### 2.4 Inconsistent error envelope shapes

The data-store contract is "never throws, always returns
`DataReadResult<T>` with `source: 'missing'` on total miss." Audited
modules generally honour this. Two modest deviations:

| Severity | File:line | Deviation |
| -------- | --------- | --------- |
| LOW | `src/lib/base-x402-onchain.ts:69-99` | Defines its own `RefreshResult = { source, ageMs }` (no `writtenAt`). Drift from the canonical `RefreshResult` in `src/lib/data-store-reader.ts:35-39` which adds `writtenAt: string \| null`. Cosmetic, but means a caller that expects writtenAt won't get it. **Fix-list F3.** |
| LOW | Several reader libs (e.g. `arxiv.ts:237`, `huggingface.ts:141`, `hot-collections.ts:119`) | Open-code the 30s + inflight + cache pattern instead of using `createPayloadReader<T>()`. Functionally identical, but ~80 LOC of duplicate machinery per module is the boilerplate the factory was built to remove. **Fix-list F10** (track as cleanup, not a correctness defect). |

---

## 3. Top fix-list (severity-ranked, patch-ready notes)

| # | Sev | File:line | One-line fix |
| - | --- | --------- | ------------ |
| F5 | HIGH | `src/app/sitemap-news.xml/route.ts:73-81` | Replace `readJsonSafe` calls with `getDataStore().read(slug)`; same payload keys (`hackernews-trending`, etc.). |
| F6 | HIGH | `src/app/api/admin/overview/route.ts:138-152` | Either (a) move `autocompletion-checklist` payload to the data-store and switch `readAutocompletionTile()` to `store.read("autocompletion-checklist")`, or (b) document the file as build-time-only and add an "as of <build>" badge. |
| F1 | MED | `src/lib/llm/redis-streams.ts:120-130` | Replace `new mod.Redis(...)` with `getDataStore().redisClient()`. Streams use the same client surface; gate behind null-check (clientless dev). |
| F2 | MED | `src/lib/redis.ts` | Extend `RedisClientLike` in `data-store.ts` with `hincrby/hset/hgetall/expire` (or expose underlying client for hash ops) and route `runtime-redis` callers through `getDataStore().redisClient()`. Closes the second-client codepath. |
| F7 | MED | `src/app/api/cron/freshness/state/route.ts:466-485` + `src/app/api/admin/pool-state/route.ts:572-579` | Lift `readMeta(source)` into a shared helper, then dual-write `data/_meta/<source>.json` from the collectors to a `meta:<source>` data-store key. Reader becomes `store.read("meta:" + source)` with the file as the existing fallback tier. |
| F4 | LOW | `src/lib/data-store.ts:841-853` | Fix the `client.set` `this`-binding (call as method, not stored ref). Then delete `src/lib/tier-list/store.ts`'s scoped factory and have it use the global singleton. |
| F9 | LOW | `src/app/admin/unknown-mentions/page.tsx:50-73` | Page server component should call the same data-store path as `src/app/api/admin/unknown-mentions/route.ts:77`. Drop the duplicated `readFile`. |
| F3 | LOW | `src/lib/base-x402-onchain.ts:60-63` | Conform local `RefreshResult` to the canonical `{ source, ageMs, writtenAt: string \| null }` from `src/lib/data-store-reader.ts`. Pass through `result.writtenAt`. |
| F10 | LOW | reader libs listed in §2.4 | Migrate to `createPayloadReader<T>()` from `src/lib/data-store-reader.ts`. Sweep, not a single PR. |
| F8 | LOW | `src/app/admin/staleness/page.tsx:50-62` | Track for follow-up if/when the staleness sweeper learns to dual-write. No action today. |

---

## 4. Verdict

**PASS with caveats.** The canonical read path is overwhelmingly
respected: 50+ reader libs and 18 app surfaces consume the data-store
through its standard envelope. Single-flight (AGN-671) is correctly
in place. The four sanctioned `redisClient()` bypasses are documented
and appropriate.

Two HIGH offenders (`sitemap-news`, `admin/overview`) read collector
payloads from disk at request time and will silently serve stale data
between deploys — the exact regression the data-store was built to
prevent. Both should be migrated next sprint.

Three MEDIUM items (`llm/redis-streams`, `redis.ts`, `_meta/<source>`
file reads) introduce parallel Redis client codepaths or skip the
Redis tier for source-of-truth metadata. Closing these consolidates
the read surface to a single client + a single envelope.

LOW items are stylistic drift (open-coded refresh boilerplate, local
result types diverging from the canonical shape) and are best handled
as a sweep using `createPayloadReader<T>()`.

**Next action owner:** Sprint 2 backlog — open patch issues per fix-list
row (F1–F10). This audit is read-only; no code edits made.

**Rollback / risk:** None. Audit-only.

---

## Appendix A — Audit commands used

```
# Direct redis client construction
rg -n "from ['\"]@?ioredis['\"]|require\\(['\"]ioredis['\"]\\)|@upstash/redis" src

# Direct fs reads
rg -n "readFileSync|readFile\\(|fs\\.promises\\.readFile|fs/promises" src

# Compliant data-store consumers
rg -n "getDataStore|createDataStore|from ['\"]@/lib/data-store['\"]" src
```

Snapshot taken from working tree on branch `bot/sre/AGN-819`,
2026-05-05. Uncommitted edits in the tree were NOT inspected for
behaviour; only on-disk source as observed.
