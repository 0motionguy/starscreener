---
name: append-only-jsonl
description: JSONL collector output is append-only — aggregator dedupes downstream
paths:
  - .data/**
  - src/collectors/**
  - src/lib/aggregate/**
  - scripts/scrape-*.mjs
  - scripts/collect-*.ts
  - scripts/_*-shared.mjs
---

# Append-only JSONL

From `CLAUDE.md:50`:

> **Append-only JSONL.** Each scan adds new lines, never replaces. Aggregator dedupes downstream.

## Why

- Replacing the file mid-run truncates partial state — if a scraper crashes the file is empty, the surface shows nothing.
- Cross-source mention sweeps + freshness audits read line history (per-line `_meta` timestamps).
- Append matches the "keep-last-50" rule (`CLAUDE.md:89`): read existing → union with new batch → dedupe → keep top 50. **Never write fewer than `min(50, existing.length)` rows.** Lint guard: `npm run lint:keep-last-50` (`package.json:53`).

## What to NOT do

- `fs.writeFile("<source>.jsonl", newRows.join("\n"))` — destroys history.
- `fs.truncateSync` + re-write — same trap.
- Emit empty when the upstream scrape fails. Past incidents: `/reddit/trending` "0 0" and `/twitter` "only 16" both happened 2026-05-08 because scrapers wrote fewer rows than the page filter required (`CLAUDE.md:89`).

## What to do instead

```ts
// pattern: read → union → dedupe → keep ≥50 → append
const existing = await readJsonlLines(path);
const next = dedupe([...existing, ...newRows]).slice(0, 50);
await writeJsonlLines(path, next); // OR: appendFile() with new lines only
```

Aggregator (downstream in `src/lib/aggregate/`) dedupes on canonical id. Collectors do NOT need to rewrite history — they just need to never delete recent rows.

## Where this lives

- Raw JSONL: `.data/<source>.jsonl` (git-tracked, whitelisted in `.gitignore` per `CLAUDE.md:36`).
- Per-source meta: `.data/_meta/<source>.json` (last-write timestamps consumed by freshness audit).
- Aggregators: `src/lib/aggregate/`, `src/lib/pipeline/`.

## When editing

- Grep the file you're editing for `writeFile`, `writeFileSync`, `truncate` — none of these should clobber the JSONL.
- `npm run audit:freshness` (`scripts/audit-freshness.mjs`) reports any source past its freshness budget. `tasks/CURRENT-SPRINT.md` carries any open freshness gaps.
- Don't add a collector that only writes file — dual-write Redis via `scripts/_data-store-write.mjs` (`CLAUDE.md:84`).
