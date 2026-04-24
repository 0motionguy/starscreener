-- TrendingRepo — Builder layer Supabase migration (idempotent).
-- Apply via Supabase SQL editor: paste + Run. Safe to run multiple times.
--
-- Tables:
--   builder_builders      cookie-bound / OAuth identities
--   builder_ideas         thesis + anchors + stack + phase
--   builder_reactions     use/build/buy/invest conviction signals
--   builder_sprints       time-boxed idea phases
--   builder_predictions   forecasted outcomes (p20/p50/p80)

-- =========================================================================
-- Tables
-- =========================================================================

create table if not exists public.builder_builders (
  id text primary key,
  handle text not null,
  github_login text,
  depth_score real not null default 0.5,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table if not exists public.builder_ideas (
  id text primary key,
  slug text not null unique,
  author_builder_id text not null references public.builder_builders(id),
  thesis text not null,
  problem text not null,
  why_now text not null,
  linked_repo_ids jsonb not null default '[]'::jsonb,
  stack jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  phase text not null default 'seed',
  current_sprint_id text,
  public boolean not null default true,
  agent_readiness jsonb,
  x_post_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists builder_ideas_author_idx on public.builder_ideas(author_builder_id);
create index if not exists builder_ideas_phase_idx on public.builder_ideas(phase);
create index if not exists builder_ideas_created_idx on public.builder_ideas(created_at desc);
create index if not exists builder_ideas_linked_gin on public.builder_ideas using gin(linked_repo_ids);
create index if not exists builder_ideas_tags_gin on public.builder_ideas using gin(tags);

create table if not exists public.builder_reactions (
  id text primary key,
  kind text not null check (kind in ('use','build','buy','invest')),
  subject_type text not null check (subject_type in ('repo','idea')),
  subject_id text not null,
  builder_id text not null references public.builder_builders(id),
  payload jsonb not null default '{}'::jsonb,
  public_invest boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists builder_reactions_subject_idx on public.builder_reactions(subject_type, subject_id);
create index if not exists builder_reactions_builder_idx on public.builder_reactions(builder_id, created_at desc);
create unique index if not exists builder_reactions_unique_builder_kind_subject
  on public.builder_reactions(builder_id, kind, subject_type, subject_id);

create table if not exists public.builder_sprints (
  id text primary key,
  idea_id text not null references public.builder_ideas(id) on delete cascade,
  phase text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  commitments jsonb not null default '[]'::jsonb,
  actual_commits integer not null default 0,
  highlights jsonb not null default '[]'::jsonb,
  outcome text,
  next_sprint_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists builder_sprints_idea_idx on public.builder_sprints(idea_id, starts_at);

create table if not exists public.builder_predictions (
  id text primary key,
  subject_type text not null check (subject_type in ('repo','pair','idea')),
  subject_id text not null,
  archetype text not null,
  question text not null,
  method text not null,
  horizon_days integer not null,
  p20 real not null,
  p50 real not null,
  p80 real not null,
  metric text not null,
  unit text not null,
  opened_at timestamptz not null default now(),
  resolves_at timestamptz not null,
  outcome jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists builder_predictions_subject_idx on public.builder_predictions(subject_type, subject_id);
create index if not exists builder_predictions_resolves_idx on public.builder_predictions(resolves_at);

-- =========================================================================
-- RLS: deny-all by default; service key bypasses everything server-side.
-- =========================================================================

alter table public.builder_builders enable row level security;
alter table public.builder_ideas enable row level security;
alter table public.builder_reactions enable row level security;
alter table public.builder_sprints enable row level security;
alter table public.builder_predictions enable row level security;

-- Drop + recreate policies so re-runs don't error on duplicate name.
drop policy if exists "public read ideas" on public.builder_ideas;
create policy "public read ideas" on public.builder_ideas
  for select using (public = true);

drop policy if exists "public read reactions" on public.builder_reactions;
create policy "public read reactions" on public.builder_reactions
  for select using (true);

drop policy if exists "public read predictions" on public.builder_predictions;
create policy "public read predictions" on public.builder_predictions
  for select using (true);

drop policy if exists "public read builders" on public.builder_builders;
create policy "public read builders" on public.builder_builders
  for select using (true);

drop policy if exists "public read sprints" on public.builder_sprints;
create policy "public read sprints" on public.builder_sprints
  for select using (true);

-- All writes require the service key (bypasses RLS).
