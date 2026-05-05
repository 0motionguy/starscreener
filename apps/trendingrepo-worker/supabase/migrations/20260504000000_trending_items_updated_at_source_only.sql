-- Keep `updated_at` as a source-row change marker, not a nightly score recompute marker.
-- Nightly `trending_score()` updates only `trending_score`; if we always bump
-- `updated_at`, it can look fresh while `last_seen_at` is days old.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'trending_score')
     is distinct from
     (to_jsonb(old) - 'updated_at' - 'trending_score') then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;
