# Phase 4 — Monetization Layer

**Goal:** turn the API into a paid product. This is what "make money" means in code.
**Effort:** 2-3 days of focused work.
**Prereq:** Phases 1B + 2 shipped (live data-store + reliability). Phase 3 not strictly required but recommended (better data sells better).

## Reality check (verified, no bluffing)

What's already wired:
- Stripe checkout endpoint working (`POST /api/checkout/stripe`)
- User tier enforcement in code (`free` / `pro` / `team`) — alerts are tier-gated TODAY
- Session auth (HMAC-signed cookie via `POST /api/auth/session`)
- Rate limiting (`src/lib/api/rate-limit.ts`) but **by IP only**
- Public API surface: ~30 GET endpoints under `src/app/api/`
- OpenAPI spec at `docs/openapi.yaml` (incomplete — internal routes excluded)

What's missing (blockers for revenue):
- ❌ **API key CRUD** — no way to issue/revoke keys, no per-customer attribution
- ❌ **Per-key rate limiting** — current limiter buckets by IP, not by key
- ❌ **API usage metering** — only MCP tool calls are logged today; HTTP API calls aren't
- ❌ **Stripe usage-based billing** — checkout creates the customer but no metered events report up
- ❌ **Public docs site** — `docs/API.md` exists but isn't served at `api.starscreener.com/docs`
- ❌ **Status page** — uptime + p50/p95 per endpoint, fed from Phase 2 health endpoint
- ❌ **Webhook alerts as paid feature** — alert engine exists per MOAT.md, delivery is at 0%

Per `starscreener-inspection/MOAT.md` (the moat verdict): **agent-native alert delivery + sub-minute latency on a curated AI watchlist** is the real defensible product. Phase 4 ships that as the paid tier.

## Four workstreams

### 4.1 — API key CRUD + per-key rate limiting (THE BLOCKER)
**Why:** without per-key attribution, you can't bill anyone individually. This unblocks every other workstream.

**Deliverables:**
- Schema: `api_keys(id, user_id, name, hash, prefix, created_at, last_used_at, revoked_at?)` — Railway Postgres
- Endpoints (all require user session auth):
  - `POST /api/keys` — generate new key, returns plaintext ONCE (then hash-only stored)
  - `GET /api/keys` — list user's keys (no plaintext, just prefix + name + last-used)
  - `DELETE /api/keys/:id` — revoke
- Middleware: read `Authorization: Bearer ssk_...` header, validate hash, attach `userId` + `tier` to request context
- Refactor `src/lib/api/rate-limit.ts` to bucket by API key (fall back to IP for unauth requests)
- Per-tier limits: free 60 req/min, pro 600 req/min, team 1500 req/min, enterprise 10k req/min

**Effort:** ~6-8 hours (Postgres schema + endpoints + middleware + tests)
**Dep:** Railway Postgres provisioned (similar to how we did Redis in Phase 1B)

### 4.2 — Usage metering + Stripe usage-based billing
**Why:** flat-rate Stripe checkout already works, but the moneymaker is metered usage at the pro/team/enterprise tiers.

**Deliverables:**
- `src/lib/billing/usage-meter.ts` — log each API call: `(api_key_id, endpoint, status, billable_units, ts)` to Postgres
- Background worker: every hour, aggregate usage → push usage records to Stripe
- New endpoint `GET /api/usage?from=2026-04-01&to=2026-04-30` — returns the same numbers Stripe sees (auditability)
- Stripe metered products: stars-checked, mentions-fetched, alert-deliveries, webhook-pushes
- Hard caps per tier with HTTP 429 + clear error message + upgrade CTA

**Effort:** ~6-8 hours (Stripe products setup + meter + reconciliation report)

### 4.3 — Public docs site + OpenAPI completion
**Why:** developers can't pay for an API they don't understand.

**Deliverables:**
- Complete `docs/openapi.yaml` — every public endpoint documented including `/api/stream` SSE shape, webhook payload, error codes
- Deploy https://api.starscreener.com/docs (or `/docs` on the existing domain) — Mintlify or simple Stoplight static site
- `docs/QUICKSTART.md` — "get an API key + first request in 60 seconds" with copy-paste curl examples
- SDK examples for top 5 use cases: "list breakouts", "subscribe to webhook", "query timeseries", "check repo momentum", "MCP setup"

**Effort:** ~4-6 hours (spec audit + docs site provisioning + writing)

### 4.4 — Status page + webhook alerts as paid feature
**Why:** SLA proof + delivery is THE moat per the MOAT.md verdict.

**Deliverables:**
- `src/app/status/page.tsx` — public page reading from Phase 2 health endpoint, showing per-source uptime + per-endpoint p50/p95 latency
- Webhook subscriber CRUD (extends the Phase-1 alert rules):
  - `POST /api/webhooks` — register URL + event filter
  - `GET /api/webhooks` — list
  - `DELETE /api/webhooks/:id` — revoke
  - `POST /api/webhooks/:id/test` — fire a test event
- Webhook delivery worker: dequeue alert events, POST to subscribed URLs with HMAC signature, retry with backoff
- Per-tier limits: free=0 webhooks, pro=3, team=unlimited, enterprise=unlimited+priority delivery

**Effort:** ~6-8 hours (status page + webhook CRUD + delivery worker)

## Pricing tier proposal (from earlier session, refined)

| Tier | Price | Limits | Features |
|---|---|---|---|
| Free | $0 | 60 req/min, 0 webhooks, 3 alert rules | All public endpoints, MCP server |
| Pro | $19/mo | 600 req/min (10x), 3 webhooks, 60 alert rules | Timeseries query, `/api/usage` self-service |
| Team | $49/mo + $19/seat | 1500 req/min (25x), unlimited webhooks/alerts, 5 keys/seat | Per-team usage dashboard, webhook test endpoint |
| Enterprise | custom | 10k req/min (100x), priority webhook delivery | Dedicated MCP endpoint, on-prem Redis option, Slack support |

## Critical security gate

Before launching paid tier:
- [ ] All admin/cron routes properly auth-gated (verified in Phase 1B audit; recheck before launch)
- [ ] No PII in usage logs beyond `api_key_id`
- [ ] HMAC signature on all outbound webhooks
- [ ] Rate-limit middleware in place BEFORE any expensive computation
- [ ] Stripe webhook signature verification (POST `/api/webhooks/stripe`)
- [ ] CORS policy: `*` for read endpoints, restricted for write/admin

## Verification gates per workstream

**4.1 (API keys):**
- Issue key → echoed once → never returned again (hash-only storage)
- Revoke key → next request returns 401
- Per-tier rate limits enforced (e.g. free tier hits 429 at request 61 in a minute, pro doesn't)
- Key prefix visible in user dashboard (last 4 chars of prefix, not full key)

**4.2 (usage metering):**
- Hourly worker runs successfully against Postgres
- `/api/usage` reconciles within 1% of what Stripe records
- Stripe invoice generation works for a test customer

**4.3 (docs):**
- `docs/openapi.yaml` validates against OpenAPI 3.x schema
- All public endpoints have an example response
- Live docs site responds < 200ms p50

**4.4 (status + webhooks):**
- Status page shows real per-source uptime in last 24h
- Webhook delivery succeeds with HMAC verified by sample receiver
- Webhook retries 3 times with exponential backoff on 5xx, gives up on 4xx

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| API key brute force | Rate-limit auth attempts globally, log failures, lock-out after N |
| Webhook receivers can't be trusted | HMAC signature + verify-delivery flag (don't deliver to URLs that fail signature check at registration time) |
| Stripe usage reports lag | `/api/usage` reads from Postgres directly; Stripe reconciliation is async, async drift documented |
| Free tier abuse (signup farms) | Email verification + global IP rate limit on key creation |
| Team tier seat-counting fairness | Stripe handles seat math; we just enforce key-per-seat in app |

## When to start Phase 4

After Phases 1B + 2 + 3 are stable for 1 week. Phase 4 is THE biggest scope and benefits from a fresh, clean session. Pre-flight: provision Railway Postgres + finalize Stripe products in dashboard before coding.

## Sequencing within Phase 4

Recommended order:
1. **4.1 first** (API keys) — blocker for everything else
2. **4.2 next** (metering + Stripe) — turns it into actual revenue
3. **4.4 third** (webhooks + status page) — the moat
4. **4.3 last** (docs site) — polish for launch

Total: 22-30 hours of focused work. Realistic in 3 days with parallel-subagent pattern, 5 days solo.
