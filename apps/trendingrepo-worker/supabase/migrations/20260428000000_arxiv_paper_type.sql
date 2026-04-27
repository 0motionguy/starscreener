-- =========================================================================
-- TrendingRepo: arXiv 'paper' item type + lab-boost in trending_score()
-- 2026-04-28
-- =========================================================================

do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'paper'
      and enumtypid = 'trending_item_type'::regtype
  ) then
    alter type trending_item_type add value 'paper';
  end if;
end $$;

create or replace function trending_score() returns void
language plpgsql as $$
declare
  type_row trending_item_type;
  frontier_labs text[] := array[
    'openai','anthropic','deepmind','google-research','meta-fair',
    'microsoft-research'
  ];
  strong_labs text[] := array[
    'huggingface','allen-ai','mistral','nvidia-research','apple-ml',
    'ai21','cohere','stability-ai','together-ai','reka-ai','xai',
    'deepseek','qwen','moonshot-ai','bair-berkeley','mit-csail',
    'stanford-nlp','stanford-ai-lab','mila','cmu-ml-blog'
  ];
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
                 when type_row = 'paper'::trending_item_type then
                     case when (b.raw->>'lab_id') = any(frontier_labs) then 0.10
                          when (b.raw->>'lab_id') = any(strong_labs)   then 0.05
                          else 0 end
                   + case
                       when jsonb_typeof(b.raw->'cross_source_ids') = 'array'
                            and jsonb_array_length(b.raw->'cross_source_ids') >= 2
                       then 0.05
                       else 0
                     end
                 else 0
               end
      from base b
      cross join stats s
     where t.id = b.id and t.type = type_row;
  end loop;
end $$;
