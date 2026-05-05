---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-193 Read-only Redis key families follow-up (2026-05-04)

Timestamp (local): 2026-05-04T17:10:00+08:00  
Workspace: `C:\Users\mirko\OneDrive\Desktop\STARSCREENER`

## Mandatory preflight

- Read completed: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check`: **FAIL** (`ECONNREFUSED`), localhost `:3023` missing in this heartbeat.
- Classification: localhost outage, not stale-source-only.

## Scope

Follow-up on AGN-151 read-only key list:

1. `claude-rss`
2. `funding-events`
3. `llm-daily-by-feature`
4. `llm-daily-by-model`
5. `llm-daily-summary`
6. `llm-model-metadata`
7. `openai-rss`
8. `twitter-trending`

Method: source-level writer/reader verification (`rg`) only; no assumptions from prior audit text.

## Verification matrix

| Key | Writer evidence | Reader evidence | Status |
|---|---|---|---|
| `claude-rss` | `scripts/scrape-claude-rss.mjs` writes `STORE_KEY="claude-rss"` via `writeDataStore` | `src/lib/rss-feeds.ts` reads `getDataStore().read("claude-rss")` | Active, not orphan |
| `openai-rss` | `scripts/scrape-openai-rss.mjs` writes `STORE_KEY="openai-rss"` via `writeDataStore` | `src/lib/rss-feeds.ts` reads `getDataStore().read("openai-rss")` | Active, not orphan |
| `llm-model-metadata` | `src/app/api/cron/llm/sync-models/route.ts` writes `store.write('llm-model-metadata', ...)` | `src/app/api/cron/llm/aggregate/route.ts`, `src/lib/model-usage.ts` read it | Active, not orphan |
| `llm-daily-by-model` | `src/app/api/cron/llm/aggregate/route.ts` writes `store.write('llm-daily-by-model', ...)` | `src/lib/model-usage.ts` and aggregate route read it | Active, not orphan |
| `llm-daily-by-feature` | `src/app/api/cron/llm/aggregate/route.ts` writes `store.write('llm-daily-by-feature', ...)` | `src/lib/model-usage.ts` and aggregate route read it | Active, not orphan |
| `llm-daily-summary` | `src/app/api/cron/llm/aggregate/route.ts` writes `store.write('llm-daily-summary', ...)` | `src/lib/model-usage.ts` and aggregate route read it | Active, not orphan |
| `twitter-trending` | `scripts/compute-consensus.ts` writes `store.write("twitter-trending", ...)` | same file reads it; freshness route tracks it | Conditional writer; depends on `compute-consensus` execution |
| `funding-events` | No writer found in `src/` or `scripts/` for `funding-events` | `src/lib/funding/aggregate.ts` + `src/app/api/funding/events/route.ts` read it | **Read-only orphan candidate** |

## Root cause of AGN-151 false positives

The AGN-151 static inventory appears to have missed some writer patterns because several writes are routed through:

- API route handlers (`src/app/api/cron/**`) instead of scripts.
- Constant indirection (`STORE_KEY`) and non-literal write wrappers.

That explains false read-only classification for RSS + LLM daily families.

## Actionable outcome for AGN-193

- Reclassify as **true read-only orphan**: `funding-events`.
- Reclassify as **writer exists**: `claude-rss`, `openai-rss`, `llm-model-metadata`, `llm-daily-by-model`, `llm-daily-by-feature`, `llm-daily-summary`.
- Mark as **conditional/cron-dependent**: `twitter-trending` (writer exists but only when consensus compute runs).

## Recommended next patch scope (separate implementation issue)

1. Extend key-inventory scanner to include `src/app/api/**` writes.
2. Resolve constant aliases in writer detection (for `STORE_KEY`-style writes).
3. Add a periodic guard report that flags keys with readers but no proven writer matches (`funding-events` should stay red until producer exists).
