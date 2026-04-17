# Migrating StarScreener from In-Memory to Postgres

Today, every store (repos, scores, categories, reasons, snapshots, mentions, alerts) lives in-memory behind a `*Store` interface and is persisted to JSONL files in `.data/`. This doc sketches the drop-in path to Postgres when we outgrow that.

## Why move

- Vercel serverless functions are stateless — in-memory state resets on cold start. JSONL files land on `/tmp` which is ephemeral.
- Multi-region / multi-instance deploys will fragment in-memory state.
- Query patterns (filtered, sorted, paginated) are cheap in SQL and expensive in-memory at scale.

## Design principles

1. **No API changes.** Every store already implements an interface (`RepoStore`, `ScoreStore`, etc.) in `src/lib/pipeline/storage/memory-stores.ts`. The Postgres implementation must preserve that contract exactly.
2. **Facade stays stable.** `pipeline.ts` depends only on the interface. Swapping implementations is a singleton-construction change, not a callsite change.
3. **Snapshots are append-only.** Scores, categories, reasons, alerts are upsert-by-id.
4. **Still write JSONL in dev.** Keep the file-persistence path for local offline work.

## Suggested stack

- Postgres 16 (Neon / Supabase / Railway)
- Drizzle ORM (type-safe, migration-first, ~0 runtime cost)
- `DATABASE_URL` env var (already present in `.env.example`)

## Proposed schema (sketch)

```sql
-- Canonical repos
create table repos (
  id             text primary key,
  full_name      text not null unique,
  owner          text not null,
  name           text not null,
  description    text,
  stars          integer not null,
  forks          integer not null,
  momentum_score integer,
  movement_status text,
  rank           integer,
  category_id    text,
  category_rank  integer,
  created_at     timestamptz not null,
  updated_at     timestamptz not null default now(),
  last_refreshed_at timestamptz
);
create index repos_category on repos(category_id);
create index repos_momentum on repos(momentum_score desc);

-- Point-in-time snapshots (timeseries)
create table snapshots (
  repo_id      text not null references repos(id) on delete cascade,
  captured_at  timestamptz not null,
  stars        integer not null,
  forks        integer not null,
  contributors integer,
  primary key (repo_id, captured_at)
);
create index snapshots_captured on snapshots(captured_at desc);

-- Scores (latest per repo)
create table scores (
  repo_id        text primary key references repos(id) on delete cascade,
  overall        integer not null,
  components     jsonb not null,
  modifiers      jsonb not null,
  is_breakout    boolean not null default false,
  is_quiet_killer boolean not null default false,
  movement_status text,
  updated_at     timestamptz not null default now()
);

-- Classifications (latest per repo)
create table classifications (
  repo_id      text primary key references repos(id) on delete cascade,
  category_id  text not null,
  confidence   real not null,
  signals      jsonb not null,
  updated_at   timestamptz not null default now()
);

-- Reasons (latest per repo)
create table reasons (
  repo_id    text primary key references repos(id) on delete cascade,
  summary    text not null,
  details    jsonb not null,
  updated_at timestamptz not null default now()
);

-- Social mentions
create table mentions (
  id          text primary key,
  repo_id     text not null references repos(id) on delete cascade,
  source      text not null,  -- 'hn' | 'reddit' | 'github'
  url         text not null,
  title       text,
  score       integer,
  created_at  timestamptz not null
);
create index mentions_repo_created on mentions(repo_id, created_at desc);

-- Alerts
create table alert_rules (
  id         text primary key,
  user_id    text not null,
  trigger    jsonb not null,
  target     jsonb not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table alert_events (
  id          text primary key,
  rule_id     text not null references alert_rules(id) on delete cascade,
  user_id     text not null,
  repo_id     text not null references repos(id) on delete cascade,
  trigger     jsonb not null,
  payload     jsonb not null,
  fired_at    timestamptz not null,
  read_at     timestamptz
);
create index alert_events_user_fired on alert_events(user_id, fired_at desc);
```

## Migration steps

1. **Deps.** `npm install drizzle-orm drizzle-kit postgres` (add `@libsql/client` instead if you pick Turso).
2. **Schema.** The canonical descriptor already lives at `src/lib/db/schema.ts`. Each table is a `TableDescriptor` — column names, types, primary keys, foreign keys, and indices. When you add Drizzle, port those descriptors to `pgTable(...)` declarations in the same file; the column names are already snake_case so the port is mechanical.
3. **Generate migrations.** `npx drizzle-kit generate:pg` — writes SQL under `./drizzle/`.
4. **Apply.** `npx drizzle-kit push:pg` against the target database (use `DATABASE_URL`).
5. **Implement stores.** The scaffolds live at `src/lib/db/stores.ts` — classes like `PostgresRepoStore` that already implement the `RepoStore` / `SnapshotStore` / ... interfaces from `src/lib/pipeline/types.ts`. Each method currently throws `NOT_IMPLEMENTED`; swap the bodies for Drizzle queries one at a time. Hot-path operations (`getAll`, `getLatest`, batch writes) can be covered with simple `select`/`insert` plus one composite index from the schema.
6. **Wire the switch.** In `src/lib/pipeline/storage/singleton.ts`, branch on `process.env.DATABASE_URL`:
   - `DATABASE_URL` unset → keep the in-memory singletons (JSONL persistence remains active).
   - `DATABASE_URL` set → construct `PostgresXStore` instances and export those as the singletons instead.
7. **Backfill.** One-shot script that reads `.data/*.jsonl`, maps each line to an `insert`, and streams into Postgres. Idempotent — use `on conflict do update` so retries are safe.
8. **Flip.** Set `STARSCREENER_PERSIST=false` (JSONL is now redundant), redeploy, verify with `/api/pipeline/status`.

## Alternative backends

### Supabase Postgres
Drop-in. Use the `DATABASE_URL` from Project Settings → Database → Connection string. Comes with auth / storage / realtime if you want to build on it later.

### Neon (serverless Postgres)
Drop-in. Same Drizzle schema, different connection URL. Cold-start-friendly driver (`@neondatabase/serverless`) plays better with Vercel than long-lived `postgres` pools.

### Turso (SQLite at the edge)
Use `@libsql/client` instead of `postgres`. Schema is mostly compatible — swap `jsonb` for `text` + `json` helpers, and `timestamp` for `text` (ISO 8601). Faster for read-heavy workloads near the edge; worse for the high-write cron ingest.

## Notes

- Keep `hydrateAll()` / `persistAll()` as no-ops in the Postgres path (or reuse them for cache warm-up).
- `memory-stores.ts` caps snapshot retention at `SNAPSHOT_HISTORY_CAP = 120` (~30 days at 6h cadence). Postgres should do the same via a monthly-partition + retention job once volume matters.
- Add connection pooling (PgBouncer / Neon pooler) because serverless functions open-close connections frequently.
- The debounced persist in `singleton.ts` (`schedulePersist` / `PERSIST_DEBOUNCE_MS`) stays relevant — it still governs the JSONL fallback path while a DB is warming up, and it's the seam you'd replace with `flushCache → commit` if the Postgres path ever needs batching.
