-- =========================================================================
-- TrendingRepo: cross-source trending leaderboard schema
-- Postgres 15 / Supabase
-- Created 2026-04-26
-- =========================================================================

create extension if not exists pg_cron;
create extension if not exists pgcrypto;

-- Enums --------------------------------------------------------------------
create type trending_item_type as enum (
  'skill','mcp','hf_model','hf_dataset','hf_space','repo','idea'
);

-- updated_at trigger fn ----------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- Items --------------------------------------------------------------------
create table trending_items (
  id              uuid primary key default gen_random_uuid(),
  type            trending_item_type not null,
  source          text not null,
  source_id       text not null,
  slug            text not null,
  title           text not null,
  description     text,
  url             text not null,
  author          text,
  vendor          text,
  agents          text[] not null default '{}',
  tags            text[] not null default '{}',
  language        text,
  license         text,
  thumbnail_url   text,
  trending_score  double precision not null default 0,
  absolute_popularity double precision not null default 0,
  cross_source_count int not null default 1,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  last_modified_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  raw             jsonb not null default '{}'::jsonb,
  constraint trending_items_source_unique unique (source, source_id)
);

create index trending_items_type_last_seen_idx
  on trending_items (type, last_seen_at desc);
create index trending_items_score_recent_idx
  on trending_items (trending_score desc)
  where last_seen_at > now() - interval '30 days';
create index trending_items_tags_gin on trending_items using gin (tags);
create index trending_items_raw_gin on trending_items using gin (raw jsonb_path_ops);

create trigger trending_items_set_updated_at
  before update on trending_items
  for each row execute function set_updated_at();

-- Daily metric snapshots ---------------------------------------------------
create table trending_metrics (
  id                bigserial primary key,
  item_id           uuid not null references trending_items(id) on delete cascade,
  captured_at       timestamptz not null default now(),
  downloads_total   bigint,
  downloads_7d      bigint,
  stars_total       bigint,
  installs_total    bigint,
  upvotes           int,
  comments          int,
  velocity_delta_7d double precision,
  source_rank       int,
  raw               jsonb not null default '{}'::jsonb,
  constraint trending_metrics_one_per_day
    unique (item_id, (captured_at::date))
);

create index trending_metrics_item_captured_idx
  on trending_metrics (item_id, captured_at desc);

-- Asset attachments --------------------------------------------------------
create table trending_assets (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references trending_items(id) on delete cascade,
  kind              text not null,
  url               text not null,
  alt               text,
  simple_icons_slug text,
  brand_color       text,
  bytes             bigint,
  content_type      text,
  fetched_at        timestamptz not null default now(),
  raw               jsonb not null default '{}'::jsonb
);
create index trending_assets_item_idx on trending_assets (item_id);

-- Materialized view: top-1000 per type per day ----------------------------
create materialized view trending_score_history as
select * from (
  select
    date_trunc('day', now())::date as snapshot_date,
    i.type,
    i.id            as item_id,
    i.slug,
    i.title,
    i.url,
    i.trending_score,
    rank() over (partition by i.type order by i.trending_score desc) as rank
  from trending_items i
  where i.last_seen_at > now() - interval '30 days'
) s where rank <= 1000;

create unique index trending_score_history_pk
  on trending_score_history (snapshot_date, type, item_id);
create index trending_score_history_rank_idx
  on trending_score_history (snapshot_date, type, rank);

-- =========================================================================
-- trending_score(): per-type recomputation
--   score = 0.40*z(downloads_7d)
--         + 0.25*z(velocity_delta_7d)
--         + 0.20*z(absolute_popularity)
--         + 0.10*recency_decay(last_modified, half_life=14d)
--         + 0.05*cross_source_count_normalized
-- Z-scores per type. n<2 or stddev=0 zeroes that component (not infinity).
-- Recency decay = exp(-ln(2) * age_days / 14)  in (0,1].
-- =========================================================================
create or replace function trending_score() returns void
language plpgsql as $$
declare
  type_row trending_item_type;
begin
  for type_row in select unnest(enum_range(null::trending_item_type)) loop
    with latest as (
      select distinct on (m.item_id) m.item_id, m.downloads_7d, m.velocity_delta_7d
      from trending_metrics m
      join trending_items i on i.id = m.item_id
      where i.type = type_row
      order by m.item_id, m.captured_at desc
    ),
    base as (
      select
        i.id,
        coalesce(l.downloads_7d, 0)::double precision      as downloads_7d,
        coalesce(l.velocity_delta_7d, 0)::double precision as velocity_delta_7d,
        i.absolute_popularity,
        i.cross_source_count,
        case
          when i.last_modified_at is null then 0
          else exp(-ln(2) * extract(epoch from (now() - i.last_modified_at)) / (14*86400))
        end as recency
      from trending_items i
      left join latest l on l.item_id = i.id
      where i.type = type_row
    ),
    stats as (
      select
        avg(downloads_7d)        as mu_d,  stddev_samp(downloads_7d)        as sd_d,
        avg(velocity_delta_7d)   as mu_v,  stddev_samp(velocity_delta_7d)   as sd_v,
        avg(absolute_popularity) as mu_p,  stddev_samp(absolute_popularity) as sd_p,
        max(cross_source_count)  as max_cs,
        count(*)                 as n
      from base
    )
    update trending_items t
       set trending_score =
             case when s.n < 2 then 0 else
               0.40 * coalesce((b.downloads_7d        - s.mu_d) / nullif(s.sd_d,0), 0)
             + 0.25 * coalesce((b.velocity_delta_7d  - s.mu_v) / nullif(s.sd_v,0), 0)
             + 0.20 * coalesce((b.absolute_popularity- s.mu_p) / nullif(s.sd_p,0), 0)
             end
             + 0.10 * b.recency
             + 0.05 * (b.cross_source_count::double precision / nullif(s.max_cs,0))
      from base b
      cross join stats s
     where t.id = b.id and t.type = type_row;
  end loop;
end $$;

create or replace function refresh_trending_score_history() returns void
language plpgsql as $$
begin
  perform trending_score();
  refresh materialized view concurrently trending_score_history;
end $$;

-- pg_cron: nightly 03:00 UTC
select cron.schedule(
  'trending-recompute-nightly',
  '0 3 * * *',
  $$ select refresh_trending_score_history(); $$
);

-- RLS: service role bypasses; anon read-only ------------------------------
alter table trending_items   enable row level security;
alter table trending_metrics enable row level security;
alter table trending_assets  enable row level security;

create policy "service_role_write" on trending_items
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
create policy "public_read" on trending_items
  for select using (true);

create policy "service_role_write" on trending_metrics
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
create policy "public_read" on trending_metrics for select using (true);

create policy "service_role_write" on trending_assets
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
create policy "public_read" on trending_assets for select using (true);
