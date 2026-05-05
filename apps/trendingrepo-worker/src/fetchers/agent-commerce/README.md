# agent-commerce — data-only

This directory is **not a fetcher**. It does not contain an `index.ts`
and is intentionally absent from `registry.ts` / `FETCHERS[]`.

It hosts the hand-curated seed (`seed-data.json`) consumed by:

- `scripts/build-agent-commerce-seed.mjs` — composes the live
  `data/agent-commerce.json` payload (run nightly by
  `.github/workflows/cron-agent-commerce.yml`).
- `scripts/fetch-agent-commerce-live.mjs` — enriches each seed entry
  with live signals (GitHub stars, npm downloads, etc.).

If you ever port the agent-commerce composition into a worker fetcher,
keep this file as the seed source and add a sibling `index.ts` that
reads it; only THEN should you wire it into `registry.ts`.
