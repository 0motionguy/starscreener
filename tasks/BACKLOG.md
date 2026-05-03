# BACKLOG — Items deferred from current sprint

## From audit (2026-05-04) — not in Sprint 1
- Profile completeness scanner (Sprint 3)
- Image coverage backfill (Sprint 3)
- Cross-mention completeness (Sprint 3)
- News + funding RSS sources (Sprint 2)
- AI vendor blog RSS (Sprint 2)
- Workflow consolidation (Sprint 5)
- VPS migration (Sprint 6, optional)

## Discovered during current work
- Document or script the Windows OneDrive `.next` dev/build workaround. On 2026-05-03 the local `.next` directory was a junction at `%TEMP%\trendingrepo-next-dev`; `next dev` and `next build` both need `NODE_PATH=C:\Users\mirko\OneDrive\Desktop\STARSCREENER\node_modules` so chunks emitted under `%TEMP%` can resolve externals like `react/jsx-runtime` and Next's app-route runtime.
- Decide expanded freshness semantics for advisory side channels: `mcp-dependents` needs `LIBRARIES_IO_API_KEY`, `mcp-smithery-rank` needs `SMITHERY_API_KEY`, `skill-install-snapshots` currently has no install data, `model-usage` can have successful zero-event cron runs, and `hotness-snapshots` can publish only populated domains. Either provision the missing keys/data or mark these rows non-blocking in `/api/cron/freshness/state`.
