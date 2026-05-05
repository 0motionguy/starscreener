# AGN-151 Redis namespace inventory + orphan scan (2026-05-04)

Timestamp (local): 2026-05-04T16:31:00+08:00
Workspace: `C:\Users\mirko\OneDrive\Desktop\STARSCREENER`

## Mandatory preflight evidence

- Read completed: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` result: `PASS freshness all green`.
- Freshness classification: **not** a localhost outage. `localhost:3023` responded and all 50 tracked sources were GREEN. Remaining note: `Sentry: MISSING` in readiness row.

## Namespace contract verification

- App data-store namespace in `src/lib/data-store.ts`:
  - payload namespace: `ss:data:v1`
  - meta namespace: `ss:meta:v1`
- Worker mirror namespace in `apps/trendingrepo-worker/src/lib/redis.ts`:
  - payload namespace: `ss:data:v1`
  - meta namespace: `ss:meta:v1`

Result: app and worker namespace constants are aligned.

## Static key inventory (code-derived)

Method:
- Parsed literal keys in `writeDataStore("<slug>", ...)`.
- Parsed literal keys in both `readDataStore("<slug>", ...)` and `store.read("<slug>")`.
- Excluded `__tests__` and `tests/` paths to avoid test-only noise.

Counts:
- literal write keys: `59`
- literal read keys: `46`
- union keys: `67`
- write-only keys: `21`
- read-only keys: `8`

### Write-only keys (candidate producer-only/orphaned consumers)

1. `awesome-skills`
2. `base-x402-onchain`
3. `consensus-verdicts`
4. `funding-news-crunchbase`
5. `funding-news-x`
6. `manual-repos`
7. `mcp-dependents`
8. `mcp-downloads`
9. `mcp-downloads-pypi`
10. `mcp-liveness`
11. `mcp-smithery-rank`
12. `revenue-manual-matches`
13. `skill-derivative-count`
14. `solana-x402-onchain`
15. `trending-lite`
16. `trending-skill-lobehub`
17. `trending-skill-skillsmp`
18. `trending-skill-smithery`
19. `trendshift-daily`
20. `twitter-ingestion-audit`
21. `twitter-scans`

### Read-only keys (candidate missing writers / legacy names)

1. `claude-rss`
2. `funding-events`
3. `llm-daily-by-feature`
4. `llm-daily-by-model`
5. `llm-daily-summary`
6. `llm-model-metadata`
7. `openai-rss`
8. `twitter-trending`

## Interpretation

- Several write-only keys are expected side-channel producer outputs (for admin/audit/debug or multi-stage derivation), but should still be validated for real consumers before cleanup.
- Read-only keys are stronger orphan risk candidates: they may depend on missing workflows/writers, renamed keys, or stale legacy paths.
- Prior forensic claim about null `mcp-*` meta is now partially mitigated by existing backfill tooling (`scripts/backfill-meta.mjs`), but live Redis verification is still required.

## Live scan blockers in this heartbeat

- No Redis credentials in this shell:
  - `REDIS_URL`: missing
  - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`: missing
- Live keyspace scan (`SCAN ss:data:v1:*` + `SCAN ss:meta:v1:*`) was therefore not executable from this workspace.
- Paperclip API host from env (`http://192.168.192.1:3100`) was unreachable in this shell, so queue-depth API checks could not be completed here.

## Recommended next action (child task candidate)

Run a production-authorized live scan script with Redis env present:

1. Enumerate payload keys `ss:data:v1:*`.
2. Enumerate meta keys `ss:meta:v1:*`.
3. Report payload-without-meta and meta-without-payload counts.
4. Cross-check live keys against this code-derived inventory to flag:
   - live-only (unknown) keys
   - code-only (dead) keys
5. Attach JSON artifact with key families and counts.
