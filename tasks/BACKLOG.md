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
- Document or script the Windows OneDrive `.next` dev-server workaround. On 2026-05-03 the local `.next` directory was converted to a junction at `%TEMP%\trendingrepo-next-dev`; `next dev` also needed `NODE_PATH=C:\Users\mirko\OneDrive\Desktop\STARSCREENER\node_modules` so Turbopack SSR chunks emitted under `%TEMP%` could resolve externals like `react/jsx-runtime` and Next's app-route runtime.
