-- StarScreener — runtime overrides for the Source Registry (Move 1, Phase 2).
--
-- Purpose
--   Pair the static `SourceContract[]` (apps/trendingrepo-worker/src/platform/
--   sources.json) with a Supabase-backed runtime state table so ops can pause
--   / deprecate / reactivate a source without a code deploy. Apify spend can
--   blow $20/hr if a fetcher loops; a 4-minute Vercel/Railway deploy to pause
--   it is unacceptable.
--
-- Boot-path contract
--   The worker reads this table at boot with a 2-second timeout. Read miss
--   (timeout, error, table absent) falls back to .cache/source-overrides.json
--   (last-known-good); cache miss falls back to "all sources active" — the
--   worker NEVER refuses to start. See apps/trendingrepo-worker/src/platform/
--   overrides.ts for the loader.
--
-- Audit history
--   Every insert/update/delete on `source_overrides` mirrors a row into
--   `source_override_history` via the `source_overrides_audit` trigger so
--   we have forensic visibility into pause/unpause cycles and
--   ghost-row reaper deletions (Move 1 step 4 lint enforces deprecate-
--   then-delete; the history table is the paper trail).
--
-- Idempotency
--   Every CREATE uses IF NOT EXISTS; the trigger function uses
--   CREATE OR REPLACE; the trigger itself is dropped + recreated. Re-running
--   this migration is safe.

create table if not exists source_overrides (
  source_id        text primary key,
  state            text not null check (state in ('active','paused','deprecated')),
  paused_until     timestamptz,
  reason           text not null,
  set_by           text not null,
  set_at           timestamptz not null default now(),
  expected_resume  timestamptz,
  notes            jsonb not null default '{}'
);

create index if not exists source_overrides_state_idx
  on source_overrides(state)
  where state <> 'active';

create table if not exists source_override_history (
  id           bigserial primary key,
  op           text not null check (op in ('insert','update','delete')),
  source_id    text not null,
  state        text,
  paused_until timestamptz,
  reason       text,
  set_by       text,
  set_at       timestamptz,
  changed_at   timestamptz not null default now(),
  notes        jsonb
);

create or replace function source_overrides_audit() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    insert into source_override_history(op, source_id, state, paused_until, reason, set_by, set_at, notes)
    values ('delete', old.source_id, old.state, old.paused_until, old.reason, old.set_by, old.set_at, old.notes);
    return old;
  else
    insert into source_override_history(op, source_id, state, paused_until, reason, set_by, set_at, notes)
    values (lower(tg_op), new.source_id, new.state, new.paused_until, new.reason, new.set_by, new.set_at, new.notes);
    return new;
  end if;
end;
$$ language plpgsql;

drop trigger if exists source_overrides_audit_trg on source_overrides;
create trigger source_overrides_audit_trg
  after insert or update or delete on source_overrides
  for each row execute function source_overrides_audit();
