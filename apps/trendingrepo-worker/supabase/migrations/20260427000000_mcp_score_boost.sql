-- =========================================================================
-- TrendingRepo: MCP-specific score boost + asset uniqueness
-- 2026-04-27
-- =========================================================================

-- 1) trending_assets: enforce one row per (item_id, kind). Logos and badges
--    are upserted by run-mcp-fetcher.ts using onConflict='item_id,kind'.
alter table trending_assets
  add constraint trending_assets_item_kind_unique unique (item_id, kind);

-- 1b) Top-level merge_keys text[] for cross-source dedup. Using a real array
--     column lets PostgREST .overlaps() find rows in O(log n) via a GIN index,
--     instead of doing JSON path scans inside raw.
alter table trending_items
  add column if not exists merge_keys text[] not null default '{}';
create index if not exists trending_items_merge_keys_gin
  on trending_items using gin (merge_keys);

-- 2) Replace trending_score() so type='mcp' picks up an extra boost from
--    cross_source_count, security_grade, and is_official_vendor (all live
--    in raw on trending_items, populated by the merger).
--
-- Boost components (additive on top of the existing per-type score):
--   +0.05 * min(cross_source_count - 1, 3)  ->  up to +0.15
--   +0.10 if raw->>'security_grade' in ('A','B')
--   +0.10 if raw->>'is_official_vendor' = 'true'
-- Other types behave exactly as before (+0.05 normalized cross_source line
-- in the original function), so this change does NOT alter their score.

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
        i.raw,
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
             + case
                 when type_row = 'mcp'::trending_item_type then
                     0.05 * least(greatest(b.cross_source_count - 1, 0), 3)
                   + case when (b.raw->>'security_grade') in ('A','B') then 0.10 else 0 end
                   + case when (b.raw->>'is_official_vendor')::boolean is true then 0.10 else 0 end
                 else 0
               end
      from base b
      cross join stats s
     where t.id = b.id and t.type = type_row;
  end loop;
end $$;
