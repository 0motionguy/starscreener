-- =========================================================================
-- TrendingRepo: physical captured_date for metric upserts
-- 2026-04-27
-- =========================================================================
--
-- The worker upserts daily metric snapshots with:
--   onConflict = 'item_id,captured_date'
--
-- The initial schema only had an expression uniqueness constraint on
-- (item_id, captured_at::date). PostgREST/Supabase upsert conflict targets
-- require real columns, so add a physical captured_date column and a matching
-- unique index.

alter table trending_metrics
  add column if not exists captured_date date;

update trending_metrics
   set captured_date = captured_at::date
 where captured_date is null;

alter table trending_metrics
  alter column captured_date set default current_date,
  alter column captured_date set not null;

create unique index if not exists trending_metrics_item_captured_date_unique
  on trending_metrics (item_id, captured_date);
