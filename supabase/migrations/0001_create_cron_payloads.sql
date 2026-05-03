-- StarScreener — append-only cron payload data lake.
--
-- Purpose
--   Persist every cron-driven JSON payload as a new row, forever. No UPDATE,
--   no DELETE, no overwrite. The current Redis + bundled-JSON setup keeps
--   only the last value per slug; this table keeps every value per slug,
--   captured-at, and content hash so we can replay history, run time-series
--   analytics, and recover from a bad scan without losing the prior good one.
--
-- Design notes
--   - `payload`     jsonb (NOT NULL). The full collector output as JSON.
--   - `payload_hash` text (NOT NULL). SHA-256 of canonical JSON. Lets us
--                   dedupe in the rare case the collector re-runs and
--                   produces the same bytes (UNIQUE constraint below).
--   - `byte_size`    GENERATED column. Always-correct on-disk-ish sizing
--                   for cost-tracking + alerting on payload bloat.
--   - `captured_at`  timestamptz (NOT NULL). When the scan was captured —
--                   distinct from `inserted_at` (defaults to now()) so a
--                   backfill can preserve the original wall-clock.
--                   FOR THIS MIGRATION we collapse them into one column —
--                   `captured_at DEFAULT now()` — to keep schema small.
--                   See ADR 0001 §"Captured vs inserted timestamps" for
--                   the explicit decision and the upgrade path if we
--                   later need both.
--
-- Append-only invariant
--   RLS allows INSERT for service_role and SELECT for anon only.
--   No UPDATE / DELETE policy is defined → both verbs are denied for every
--   role except postgres-superuser (which the app never authenticates as).
--   ADR 0001 §"Append-only enforcement" documents this and the matching
--   CI check (planned in Phase 1c).
--
-- Indexes
--   - source_capture_idx       — primary read path: "give me the latest N
--                               rows for source X". DESC ordering matches.
--   - subtype_idx              — narrow per-subtype reads (e.g. only
--                               twitter:mentions). Partial index keeps it
--                               cheap when most rows have no subtype.
--   - dedupe_idx               — hard-stops a re-insert with the same
--                               (source, subtype, payload_hash) tuple.
--                               UNIQUE → INSERT…ON CONFLICT DO NOTHING is
--                               the writer-side idiom.

CREATE TABLE IF NOT EXISTS cron_payloads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source           text NOT NULL,
  source_subtype   text,
  payload          jsonb NOT NULL,
  payload_hash     text NOT NULL,
  captured_at      timestamptz NOT NULL DEFAULT now(),
  collector_run_id text,
  byte_size        integer GENERATED ALWAYS AS (octet_length(payload::text)) STORED
);

COMMENT ON TABLE cron_payloads IS
  'Append-only data lake of every cron payload. ADR 0001. NEVER UPDATE/DELETE.';

COMMENT ON COLUMN cron_payloads.source IS
  'Top-level slug, e.g. ''twitter'', ''reddit'', ''github-trending''. Stable across schema changes.';
COMMENT ON COLUMN cron_payloads.source_subtype IS
  'Optional second axis, e.g. ''mentions'' / ''trending'' / ''signals'' for a multi-stream source.';
COMMENT ON COLUMN cron_payloads.payload IS
  'Full collector output. Schema-on-read — readers project the shape they need.';
COMMENT ON COLUMN cron_payloads.payload_hash IS
  'SHA-256 of canonical JSON. Dedupe key — same hash = same bytes, no second row.';
COMMENT ON COLUMN cron_payloads.captured_at IS
  'Wall-clock the scan was captured. Defaults to now() but settable for backfill.';
COMMENT ON COLUMN cron_payloads.collector_run_id IS
  'GitHub Actions run id (or equivalent). Lets us trace a row back to a workflow run.';
COMMENT ON COLUMN cron_payloads.byte_size IS
  'Generated. octet_length of the payload as text. Used for cost / bloat monitoring.';

-- Primary read path: latest rows per source.
CREATE INDEX IF NOT EXISTS cron_payloads_source_capture_idx
  ON cron_payloads (source, captured_at DESC);

-- Narrow reads when subtype is present. Partial index keeps storage minimal.
CREATE INDEX IF NOT EXISTS cron_payloads_subtype_idx
  ON cron_payloads (source, source_subtype, captured_at DESC)
  WHERE source_subtype IS NOT NULL;

-- Hard dedupe. Writer side: INSERT … ON CONFLICT (source, source_subtype, payload_hash) DO NOTHING.
-- Note: NULL semantics in unique indexes — Postgres 15+ treats NULLs as
-- distinct by default. We use COALESCE in a deterministic-canonical wrapper
-- on the writer side OR we add `NULLS NOT DISTINCT` once we standardise on
-- PG16+. ADR 0001 §"Dedupe NULL handling" tracks the choice.
CREATE UNIQUE INDEX IF NOT EXISTS cron_payloads_dedupe_idx
  ON cron_payloads (source, source_subtype, payload_hash);

-- Row-level security: read-anyone, write-service-only, no update, no delete.
ALTER TABLE cron_payloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read" ON cron_payloads;
CREATE POLICY "anon_read"
  ON cron_payloads
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "service_role_write" ON cron_payloads;
CREATE POLICY "service_role_write"
  ON cron_payloads
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Deliberately omitted: UPDATE / DELETE policies. Without a policy granting
-- those verbs, Postgres + RLS denies them for every role we authenticate
-- as (anon, authenticated, service_role). This is the structural append-only
-- enforcement — see ADR 0001 §"Append-only enforcement".
