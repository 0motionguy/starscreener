---
last-verified: 2026-05-05
verified-by: claude
status: living
supersedes: 0001-supabase-append-only-data-lake.md
---

# ADR 0004: Redis primary + worker-only Supabase analytics

- Status: Accepted (2026-05-05)
- Supersedes: ADR 0001 (Supabase append-only data lake - deferred)
- Related: ADR 0002 (Multi-tier cache architecture), ADR 0003 (Cache tiers)
- Reality-check evidence: `docs/archive/ADR-0001-status-2026-05-05.md`

## Context

ADR 0001 proposed an append-only data lake with main-app dual-write (phase
1a), backfill (1b), and reader cutover (1c). Reality: only the worker side
shipped. Main app reads/writes exclusively from Redis via
`src/lib/data-store.ts`. No bad-scan replay or longitudinal analytics
incident has surfaced demanding the lake.

## Decision

Codify the de-facto architecture:

1. **Redis is the primary store** for all main-app reads and writes.
   Three-tier read order (Redis -> bundled JSON -> in-memory LKG) per ADR 0002.
2. **Supabase is worker-only**, hosting `trending_items`, `trending_metrics`,
   `trending_assets`. Used for cross-fetcher correlation in
   `apps/trendingrepo-worker/src/lib/db.ts:upsertItem()`.
3. **No main-app dual-write**. The cron payloads schema in
   `apps/trendingrepo-worker/supabase/migrations/0001_create_cron_payloads.sql`
   is provisioned but unused; left for a future activation if needed.

## Consequences

Positive:
- Simpler operational model. One source of truth (Redis) for all hot paths.
- Worker isolation: Supabase outages don't take down trendingrepo.com.
- Lower complexity for new collectors - only need to know about the
  data-store dual-write, not the lake.

Negative:
- No longitudinal history without going through the worker's Supabase tables.
- Bad-scan replay is harder; mitigated by bundled JSON snapshots per deploy
  + collector dual-write to file mirror.
- A future ADR may activate ADR 0001 phases 1a/1b/1c if a use case demands it.

## Activation criteria for ADR 0001

If any of these surface, re-evaluate (and supersede this ADR):
- Need to replay a bad-scan retroactively across all main-app collectors
- Cross-collector longitudinal analysis (e.g. Twitter mentions over the last 6 months by repo)
- Compliance / audit requirement for an immutable history of every payload

Until then, ADR 0001 stays deferred and ADR 0004 is the operating reality.

## References

- `docs/DATABASE.md` - implementation detail
- `docs/decisions/0002-multi-tier-cache-architecture.md` - cache layout
- `apps/trendingrepo-worker/src/lib/db.ts` - worker write path
- `src/lib/data-store.ts` - main-app read path
