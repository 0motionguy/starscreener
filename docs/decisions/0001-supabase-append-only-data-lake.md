# ADR 0001 — Supabase append-only data lake for cron payloads

- Status: Proposed
- Date: 2026-05-03
- Driver: Basil
- Author: Claude (CTO seat)
- Phase: 1 (design only — no migration in this PR)
- Branch: `plan/supabase-append-only-data-lake`
- Related: `src/lib/data-store.ts`, `scripts/_data-store-write.mjs`,
  `tasks/data-api.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`
- Migration: `supabase/migrations/0001_create_cron_payloads.sql`

---

## Context

StarScreener's 30+ cron-driven payloads (`data/*.json`, ~50 MB total per
scan today) are currently routed through a three-tier read path:

1. **Redis** (Railway `ioredis` or Upstash REST) — last-known-good per slug.
2. **Bundled JSON file** (`data/<slug>.json`) — cold-start seed + DR snapshot.
3. **In-memory cache** — last-known-good per Lambda process.

Both Redis and the file mirror are **last-write-wins**: every fresh scan
overwrites the prior payload. We have no history beyond `git log` of the
file commits, which is noisy (17–34 deploys/day, see commit `87e3f4e`,
2026-04-26) and not queryable as data.

This works fine for serving the current site, but it has structural costs:

- **No replay.** A bad scan (Apify rate-limit, Reddit 5xx wave, Twitter
  scraper drift) silently overwrites the prior good payload. We notice
  hours later when scoring goes off, and recovery means waiting for the
  next clean run — there is no "previous good version" to roll back to.
- **No time-series.** We can compute `delta(scan N − scan N-1)` only for
  sources where we explicitly persisted a previous snapshot
  (`reddit-baselines.json`, `deltas.json`). Every other source has
  amnesia.
- **No analytics.** Questions like "how often did `repo X` appear in
  trending over the last 30 days?", "what's the median scan-to-scan
  delta on Twitter mentions?", "how often does the GitHub Trending
  payload differ scan-over-scan?" require historical rows we do not
  keep.
- **Audit trail is git, not data.** The provenance work in commit
  `9ffcab12` lets us answer "who last wrote this key?" but not "when
  did the value last change?" or "show me the value as of yesterday."

The user's directive: every cron payload becomes a new row, **never
overwrite, never delete**. Append-only. The data lake is the source of
truth for history; Redis stays the hot cache for the latest value.

## Decision

Adopt **Supabase Postgres** as the append-only data lake for cron
payloads. Single table `cron_payloads` with a JSONB body, captured-at
timestamp, content hash for dedupe, and RLS configured so only
`service_role` can INSERT and only `anon` can SELECT — UPDATE and DELETE
are structurally denied.

Reads continue to fan out through `getDataStore()`; the data-store
abstraction is extended to query Supabase as a fourth tier (between
Redis and file). Writes dual-write: Redis (hot cache) + Supabase
(durable history) + file mirror (during transition).

We choose Supabase over alternatives below because (a) we already have
the Supabase MCP wired and the Ideas builder uses it, (b) Postgres +
JSONB + GIN gives us schema-on-read without sacrificing query power,
(c) the free tier (500 MB DB, 5 GB egress) gives us months of runway
to validate the design before any cost shows up, and (d) the failure
mode (Supabase down) degrades gracefully because Redis stays the hot
read path.

## Schema (full SQL in `supabase/migrations/0001_create_cron_payloads.sql`)

```sql
CREATE TABLE cron_payloads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source           text NOT NULL,           -- 'twitter', 'reddit', 'github-trending', ...
  source_subtype   text,                    -- 'mentions', 'trending', 'signals', NULL for single-stream sources
  payload          jsonb NOT NULL,          -- full collector output, schema-on-read
  payload_hash     text NOT NULL,           -- sha256(canonical_json(payload)) — dedupe key
  captured_at      timestamptz NOT NULL DEFAULT now(),
  collector_run_id text,                    -- GH Actions run id (optional)
  byte_size        integer GENERATED ALWAYS AS (octet_length(payload::text)) STORED
);

CREATE INDEX cron_payloads_source_capture_idx
  ON cron_payloads (source, captured_at DESC);

CREATE INDEX cron_payloads_subtype_idx
  ON cron_payloads (source, source_subtype, captured_at DESC)
  WHERE source_subtype IS NOT NULL;

CREATE UNIQUE INDEX cron_payloads_dedupe_idx
  ON cron_payloads (source, source_subtype, payload_hash);

ALTER TABLE cron_payloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read"          ON cron_payloads FOR SELECT TO anon         USING (true);
CREATE POLICY "service_role_write" ON cron_payloads FOR INSERT TO service_role WITH CHECK (true);
-- No UPDATE / DELETE policies → both verbs denied for every authenticated role.
```

### Why these columns

- `id` (uuid) — opaque PK so external systems can reference a row stably.
- `source` (text) — the bare slug we already use in Redis (`trending`,
  `twitter`, `github-trending`). Keeps a 1-to-1 with the existing key
  namespace so the migration is mechanical.
- `source_subtype` (text NULLABLE) — second axis for sources that emit
  multiple streams (twitter has `mentions` + `trending` + `outbound`;
  reddit has `mentions` + `all-posts` + `baselines`). NULL for the rest.
  Partial index keeps storage tight when most rows have no subtype.
- `payload` (jsonb) — full body, schema-on-read. We commit to JSONB (not
  text) so GIN indexing on individual sources is available later
  without a migration.
- `payload_hash` (text) — SHA-256 of canonical JSON. Powers the UNIQUE
  index that swallows duplicate scans. Writer-side idiom: `INSERT … ON
  CONFLICT (source, source_subtype, payload_hash) DO NOTHING`.
- `captured_at` (timestamptz) — wall-clock of capture, not insert. Lets
  a backfill preserve the original time. Defaults to `now()` for the
  steady state.
- `collector_run_id` (text NULLABLE) — GitHub Actions run id when
  available; lets us link a row back to a workflow run.
- `byte_size` (generated) — always-correct payload size for monthly
  cost monitoring + a CI alert if a single source's median row balloons
  past, say, 10 MB.

### Append-only enforcement

Three layers, weakest to strongest:

1. **Convention.** No code path in the repo ever issues `UPDATE
   cron_payloads …` or `DELETE FROM cron_payloads …`. CI grep guard
   added in Phase 1c (plan only — not in this PR).
2. **RLS.** Without an UPDATE / DELETE policy, RLS denies both verbs for
   `anon`, `authenticated`, and `service_role`. The only role that
   *can* mutate the table is `postgres` superuser, which the app never
   authenticates as.
3. **Storage immutability (deferred).** Supabase Storage / Backups can
   be configured for point-in-time recovery; this gives us the
   "couldn't have been deleted" property even if a misconfigured
   superuser attempts it. Out-of-scope for Phase 1.

### Dedupe NULL handling

Postgres 15 treats NULLs in unique indexes as **distinct by default**.
Two rows with `(source='twitter', source_subtype=NULL, payload_hash='X')`
will both be allowed. Two ways to handle:

a) **Writer normalisation** — coerce NULL subtype to a sentinel
   (`'__none__'`) before insert. Pros: works on PG15. Cons: leaks the
   sentinel into reads. (Rejected.)
b) **`NULLS NOT DISTINCT`** — PG16 syntax that treats NULL == NULL for
   uniqueness. Pros: clean. Cons: pinned to PG16+. Supabase's current
   default cluster runs PG15.6.

**Decision:** stay on the default UNIQUE index for Phase 1, because
sources with subtype=NULL are single-stream — duplicate scans for the
same source already collide on `(source, NULL, hash)` once we set
NULL semantics consistently. If we hit a real duplicate-NULL case
during backfill, we revisit and switch to (a) writer normalisation.
ADR amendment, not migration revert.

### Captured vs inserted timestamps

Two timestamps could exist:

- `captured_at` — wall-clock when the collector ran.
- `inserted_at` — when the row landed in Postgres.

For 99% of rows these collapse to within seconds. We need both only
during the **backfill** of historical `data/*.json` snapshots, where
`captured_at` reflects the original scan and `inserted_at = now()`.

**Decision (Phase 1):** keep one column, `captured_at`. During backfill,
the script supplies `captured_at` explicitly. For steady-state writes,
`captured_at` defaults to `now()` and equals `inserted_at` to the
microsecond. If we later need both, add `inserted_at timestamptz NOT
NULL DEFAULT now()` in a follow-up migration — additive, no rewrite.

### Storage budget

Upper-bound math (worst case, no compression, no dedupe):

- 50 MB per full scan × 1 scan/3h = 400 MB/day.
- Supabase free tier = 500 MB DB. Burns through in ~30 hours.

Reality after dedupe + JSONB compression + per-source cadence:

- Most sources change <30% scan-over-scan. Hash dedupe drops the
  insert rate by 40–70% on stable sources (`hot-collections`,
  `funding-aliases`, `revenue-benchmarks`).
- JSONB TOAST compression typically achieves 2–4× on our shape
  (repeated keys, repeated repo names).
- Net: ≈ 60–80 MB/day → ~2 GB/month. Pro tier ($25/mo, 8 GB DB)
  covers ~4 months before partition-by-month is needed.

Phase 4 (deferred, out of this ADR): introduce monthly partitioning
on `captured_at`, drop partitions older than a configurable window
(default: 24 months) into Supabase Storage as Parquet for cold-tier
archival. Out-of-scope here.

## Migration plan (3 phases)

### Phase 1a — Writer dual-write (this branch's *next* PR)

- Add `@supabase/supabase-js` dep.
- Create `src/lib/supabase-store.ts` — thin client + `appendCronPayload({
  source, subtype?, payload, capturedAt?, collectorRunId? })` API.
- Extend `scripts/_data-store-write.mjs` so `writeDataStore()` triple-writes:
  Redis (existing) + file mirror (existing) + Supabase append (new).
  Supabase write is best-effort and non-fatal when env is missing —
  same graceful-degradation pattern as the Redis path.
- Provision env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in
  GitHub Actions secrets + Vercel env. (Service-role key, scoped to
  the `cron_payloads` table only via RLS.)
- Acceptance: a real cron run lands a row in `cron_payloads`; the
  existing Redis + file paths still work; readers untouched.

### Phase 1b — Backfill

- New script `scripts/backfill-supabase.mjs` that walks `data/*.json`
  and inserts every snapshot we have. For most sources we have only
  the latest, so this seeds 1 row per slug. For
  `.data/*.jsonl` (twitter scans, append-only logs already on disk),
  we replay each line as a separate row with `captured_at` from the
  log entry's timestamp.
- Idempotent — `ON CONFLICT DO NOTHING` on the dedupe index means
  re-running is safe.
- Acceptance: row count >= number of slugs; running it twice yields
  the same row count.

### Phase 1c — Reader cutover

- Extend `getDataStore().read()` to add a Supabase tier between Redis
  and file:
  ```
  Redis hit          → return (fresh)
  Redis miss + Supabase row → return (fresh; promote to Redis)
  Supabase miss + file       → return (stale)
  file miss + memory         → return (very stale)
  total miss                 → return null
  ```
- Add `getDataStore().history(source, { since, until, limit })` —
  new API that returns the time-series rows. Initially used by a new
  `/api/history/<source>` route (Phase 2 work).
- Keep Redis as a 30s hot cache; the data-store layer already throttles
  refresh per the existing rate-limit pattern.
- Acceptance: home page renders identically; cold start without Redis
  serves from Supabase (verified by killing the Redis URL in a
  preview deploy).
- CI guard: grep for `UPDATE cron_payloads` / `DELETE FROM cron_payloads`
  in any new code → fail. Append-only is a property we *enforce*,
  not just *document*.

## Consequences

### Positive
- **Replay.** Any bad scan no longer poisons history; we can read the
  prior row and roll back the Redis hot cache by re-promoting it.
- **Time-series for free.** Every source becomes queryable as
  `SELECT … WHERE source = X AND captured_at > now() - '7 days'`.
- **Single source of truth for history.** Removes the special-case
  `reddit-baselines.json` / `deltas.json` files that hand-rolled
  point-in-time snapshots.
- **Cheap analytics.** A future "how often did repo X appear in
  trending" report is a `jsonb_path_query` away, no new pipeline.
- **Postgres-native auditability.** RLS, triggers, and pg_cron are
  available if we later need write-side validation (e.g. enforce
  `payload IS JSONB OBJECT`).

### Negative
- **New dependency on Supabase availability** for writes. Mitigated
  by best-effort writes and Redis remaining the read truth.
- **Storage cost.** ~$25/mo at month 4+ (Pro tier) absent
  partitioning. Cheap relative to dev time saved on bespoke history
  pipelines, but it's a real recurring cost.
- **Egress cost** when readers query history at scale. Not a concern
  during Phase 1 (last-row reads only); becomes one if we expose a
  public `/api/history` to the world without caching.
- **One more env to manage** across GH Actions + Vercel + local dev.
  Same drill we have for Redis; same `.env.example` discipline.
- **JSONB column is opaque to non-Postgres clients.** Schema-on-read
  cuts both ways — easy to ship, harder to introspect.

### Neutral
- Redis stays. The file mirror stays during transition. Data layer
  becomes 4-tier, not a replacement of the existing 3.
- No code in this PR. ADR + schema only — implementation is gated on
  user approval.

## Alternatives considered

1. **JSONL files in S3 / R2 / Cloudflare Storage.**
   - Pros: ~$0 storage at this volume; truly immutable; easy archival.
   - Cons: no SQL; we'd hand-roll a DuckDB / Parquet query layer for
     analytics, plus a path-naming convention for time-series scans.
     The Ideas builder already uses Supabase — adding another data
     store splits the operating surface.
   - **Rejected.** We pick the boring SQL path so analytics is one
     query away, not one custom-tool away. We can always tier cold
     partitions to S3 later (Phase 4 plan above).

2. **TimescaleDB (Postgres extension).**
   - Pros: hypertables + native time-series compression; would compress
     our JSONB rows further; partition-by-time is automatic.
   - Cons: not enabled on Supabase's hosted Postgres at this tier; we'd
     self-host or use Timescale Cloud — another vendor relationship,
     another auth surface, another billing line for marginal benefit
     at our current 50 MB/scan volume.
   - **Rejected for now.** Revisit if/when we cross 50 GB total or
     start running heavy time-window aggregations.

3. **Append to existing Redis with `LPUSH` per source.**
   - Pros: one fewer dependency.
   - Cons: Redis is in-memory; storing 30 days of 50 MB/scan = 4–8 GB
     per source RAM. Railway Redis charges memory; runs >$100/mo at
     volume. Plus Redis lacks query power — no `WHERE captured_at >`
     without a custom secondary index.
   - **Rejected.** Wrong tool. Redis is a cache, not a lake.

4. **Append to GitHub via per-scan commits.**
   - This is what we have today (sort of). It's the problem.
   - **Rejected.** Driving deploys from data churn was the original
     pain point (commit `87e3f4e`).

5. **Per-source partitioned tables (`twitter_scans`, `reddit_scans`, …).**
   - Pros: per-source schema, type-safe column-per-field projections.
   - Cons: 30+ tables, 30+ migrations, every schema-on-read becomes a
     schema-on-write decision. Friction is exactly what kills the
     "every payload becomes a row" property.
   - **Rejected.** One table with JSONB is the correct level of
     normalisation for an append-only lake. Per-source materialised
     views can specialise later if a source needs columnar projections.

## Fallback strategy

If Supabase becomes unavailable mid-scan:
- Writer logs the error, returns success to the caller (best-effort
  semantics). Redis + file paths still write. No row in Supabase, but
  the next scan that *does* reach Supabase carries the latest value
  forward. Scans during the outage are lost from history — explicit
  trade.
- A "missed-scan" reconciler (deferred, Phase 2) can replay from
  Redis + file mirror back into Supabase once it returns: `for each
  slug in Redis, if (source, captured_at, hash) not in Supabase →
  insert`. This bounds the data loss to the outage window.

If Supabase is down at *read* time:
- Reader falls through to file mirror (Phase 1 transition) or to
  Redis-only history-less reads (Phase 1c onwards). The home page
  keeps rendering; `/api/history` returns 503 with a `Retry-After`
  header.

If Supabase is down for an extended period (>24h) and we haven't yet
deleted file mirrors:
- Continue serving from file. Redis hot cache + file fallback is the
  status quo today; we've operated this way for months.

## Open questions (resolve before Phase 1a)

- **Project naming.** Use the existing Ideas builder Supabase project
  (one DB, two tables) or provision a new project specifically for
  the data lake (separate billing, separate RLS surface)? Default
  recommendation: **separate project** — different blast radius, lake
  queries should not contend for connection pool with the Ideas API.
- **Region.** Match the Ideas builder region to keep latency tight
  if we eventually join across them. Default recommendation: same
  region.
- **Backups.** Free tier has no PITR; Pro tier has 7 days. If we
  start on free, we accept that an accidental superuser DROP TABLE
  is unrecoverable. Pro tier from day 1 is cheap insurance.

These are scoped for the first follow-up PR, not this design PR.

## Top recommendation (short version)

Provision a **separate Supabase project on Pro tier** in the same
region as the Ideas builder. One table, JSONB body, RLS-enforced
append-only. Dual-write Redis + Supabase (file mirror stays during
transition); reader fan-out gets Supabase as a fourth tier between
Redis and file. Backfill from `data/*.json` and `.data/*.jsonl`
during Phase 1b. CI grep guard against `UPDATE`/`DELETE` on the
table. Revisit partitioning + cold-tier archival at month 6 or 50 GB,
whichever comes first.

The win is replay + time-series + analytics with one new dependency
and zero impact on the home page render path.
