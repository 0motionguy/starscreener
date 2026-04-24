# Builder layer — Supabase migration

The builder layer (Ideas, Reactions, Predictions, Sprints, Builders) reads and
writes through the `BuilderStore` interface in
[`src/lib/builder/store.ts`](../src/lib/builder/store.ts). Two implementations:

- **`JsonBuilderStore`** (default) — atomic writes to
  `data/builder/store.json`. Good for local dev and pre-launch traffic
  (<10 writes/min).
- **`SupabaseBuilderStore`** — PostgREST-backed (no `@supabase/supabase-js`
  dep; calls `https://<ref>.supabase.co/rest/v1/*` directly over `fetch`).

## 1. Apply the migration

Copy the SQL below into the Supabase SQL editor (or `psql -f`). The tables are
independent of the existing `repos` table; `linked_repo_ids` stores repo slugs
as text so we avoid cross-table FKs during the rollout.

```sql
-- builder_builders -------------------------------------------------------
create table if not exists public.builder_builders (
  id text primary key,
  handle text not null,
  github_login text,
  depth_score real not null default 0.5,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

-- builder_ideas ----------------------------------------------------------
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

-- builder_reactions ------------------------------------------------------
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

-- builder_sprints --------------------------------------------------------
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

-- builder_predictions ----------------------------------------------------
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

-- RLS: deny-all by default; service key bypasses everything server-side.
alter table public.builder_builders enable row level security;
alter table public.builder_ideas enable row level security;
alter table public.builder_reactions enable row level security;
alter table public.builder_sprints enable row level security;
alter table public.builder_predictions enable row level security;

-- Public reads for the three tables that power the feed.
create policy "public read ideas" on public.builder_ideas
  for select using (public = true);
create policy "public read reactions" on public.builder_reactions
  for select using (true);
create policy "public read predictions" on public.builder_predictions
  for select using (true);
create policy "public read builders" on public.builder_builders
  for select using (true);
create policy "public read sprints" on public.builder_sprints
  for select using (true);
-- All writes require the service key (bypasses RLS).
```

## 2. Flip the store

In `.env.local`:

```
BUILDER_STORE=supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_…   # or SUPABASE_SERVICE_ROLE_KEY for legacy
```

Restart the dev server. Every write now goes to Postgres; reads fall back to
the same interface.

## 3. Backfill from JSON (optional)

If you've accumulated ideas/reactions in `data/builder/store.json` during the
JSON phase, seed them:

```bash
tsx scripts/migrate-builder-json-to-supabase.ts
```

The script streams each entity via the Supabase PostgREST endpoint using
`Prefer: resolution=merge-duplicates` so re-runs are safe.

## 4. Why no `@supabase/supabase-js`

The client adds ~90kb gzipped and is irrelevant for our read/write shape — we
use 5 tables, plain `select`/`insert`/`upsert`, and no realtime. A thin
fetch wrapper in `src/lib/builder/supabase.ts` gives us typed results without
the dep.
