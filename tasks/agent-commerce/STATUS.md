# Agent Commerce — Status Snapshot

- **Date:** 2026-04-30
- **Branch:** `feat/repo-detail-v4-w5`
- **Scope:** `/agent-commerce` page + 9 fetchers + AISO drain integration

---

## 1. Shipped this sprint

| Phase | Commit | Artifact | What |
|---|---|---|---|
| Recovery | `c668fab3` | `package.json` | Commit deps for agent-commerce + model-usage features |
| Init | `5179492b` | full pipeline + UI + APIs | Recovery commit — fetchers, page, routes |
| Base x402 | `b730fc0b` | `scripts/fetch-base-x402-onchain.mjs` | Free Blockscout v2 indexer (re-add) |
| On-chain | `92d38136` | section 04c + husky | On-chain settlements UI section |
| Data refresh | `a51f943a` | `data/agent-commerce.json` + `.data/*.json` | Full pipeline refresh 2026-04-30 |
| Phase A2 | `9b9d537b` | `tasks/agent-commerce/phase-a2-ticker-status.md` | Ticker integration status spec |
| Phase A1 | `1f9eb644` | `tasks/agent-commerce/phase-a1-aiso-spec.md` | AISO infra spec |
| Phase A3 | `89ec7f2e` | `tasks/agent-commerce/phase-a3-solana-spec.md` | Solana x402 facilitator spec |
| AISO producer | `74c27bde` | `scripts/submit-agent-commerce-aiso.ts` | Enqueue agent-commerce repos to AISO drain |
| Solana fetcher | `b95af7a0` | `scripts/fetch-solana-x402-onchain.mjs` | Solana on-chain settlement fetcher |
| Dune fetcher | `3e16d528` | `scripts/fetch-dune-x402.mjs` + `.dune/x402-volume.sql` | Dune historical volume |
| UI Solana | `b7d56e57` | section 04c-sol in `src/app/agent-commerce/page.tsx` | Solana settlements panel |
| Cron | `2112375a` | `.github/workflows/cron-agent-commerce.yml` | Daily 04:31 UTC pipeline |
| UI polish | `5c67f118` | AISO badge on movers + 04d Dune chart + Solana RPC tune | Movers AISO badge, Dune section, RPC env |
| Polish | `73bcbb48` | 5 fixes | Redis dual-write, push-recency gate, --limit flag, cron robustness |

Phase docs cross-ref:
- [phase-a1-aiso-spec.md](./phase-a1-aiso-spec.md)
- [phase-a2-ticker-status.md](./phase-a2-ticker-status.md)
- [phase-a3-solana-spec.md](./phase-a3-solana-spec.md)

---

## 2. Architecture map

```
.github/workflows/cron-agent-commerce.yml  (daily 04:31 UTC)
   │
   ├─► fetch-agentic-market.mjs       ──┐
   ├─► fetch-openrouter.mjs            │
   ├─► fetch-coingecko.mjs             │
   ├─► fetch-aa-bundlers.mjs           │   writes
   ├─► fetch-base-x402-onchain.mjs     ├──► data/agent-commerce.json
   ├─► fetch-solana-x402-onchain.mjs   │     +  .data/*.json
   ├─► fetch-live-pricing.mjs          │
   ├─► fetch-social-buzz.mjs           │
   └─► fetch-build-signals.mjs         ──┘
                                          │
                       scripts/_data-store-write.mjs
                                          │
                                          ▼
                                   Redis (Upstash/Railway)
                                          │
                                          ▼
   src/app/agent-commerce/page.tsx (Server Component)
       └── renders sections 00 · 01 · 02 · 03 · 04 · 04c (Base) · 04c-sol (Solana) · 04d (Dune) · 05 · 06 · 07

──── Independent path ────
scripts/submit-agent-commerce-aiso.ts  ──► .data/aiso-rescan-queue.jsonl
                                                  │
                                                  ▼
       .github/workflows/cron-aiso-drain.yml  (every 30 min)
                                                  │
                                                  ▼
                                              AISO API
```

---

## 3. Open items needing user action

- [ ] **Set `SOLANA_RPC_URL` GitHub secret** to a paid endpoint (Helius / Alchemy). Public RPC hard-429s the runner IP.
- [ ] **Paste `.dune/x402-volume.sql` into Dune**, save, share the query id, then add `--query-id <ID>` to `cron-agent-commerce.yml`.
- [ ] **Set `AGENT_COMMERCE_WEBHOOK_URL`** if Slack notifications are desired (currently being added by another agent in parallel).

---

## 4. Known issues / parking lot

- Inline `require("fs")` in page.tsx IIFEs — anti-pattern; being fixed in parallel.
- Base x402 fetcher `writeDataStore` — import wired, call missing; being fixed in parallel.
- Phase E design audit pending — running in parallel.

---

## 5. Verification commands

```bash
# Smoke test the daily pipeline locally (no Redis):
DATA_STORE_DISABLE=1 npx tsx scripts/submit-agent-commerce-aiso.ts --dry-run --limit 5

# Smoke test Solana fetcher (will 429 on public RPC; use SOLANA_RPC_URL for paid):
node scripts/fetch-solana-x402-onchain.mjs --max-pages-per-addr 1 --addr CodeNut

# Smoke test Dune fetcher (needs DUNE_API_KEY in env + saved query id):
node scripts/fetch-dune-x402.mjs --dry-run
```

---

## 6. References

- Handoff: phase docs in this directory
  - [phase-a1-aiso-spec.md](./phase-a1-aiso-spec.md) — AISO infra
  - [phase-a2-ticker-status.md](./phase-a2-ticker-status.md) — ticker integration
  - [phase-a3-solana-spec.md](./phase-a3-solana-spec.md) — Solana facilitator
- Cron: [`.github/workflows/cron-agent-commerce.yml`](../../.github/workflows/cron-agent-commerce.yml)
- AISO drain: [`.github/workflows/cron-aiso-drain.yml`](../../.github/workflows/cron-aiso-drain.yml)
- Page: [`src/app/agent-commerce/page.tsx`](../../src/app/agent-commerce/page.tsx)
- Data-store writer: [`scripts/_data-store-write.mjs`](../../scripts/_data-store-write.mjs)
- AISO producer: [`scripts/submit-agent-commerce-aiso.ts`](../../scripts/submit-agent-commerce-aiso.ts)
- Dune SQL: [`.dune/x402-volume.sql`](../../.dune/x402-volume.sql)
