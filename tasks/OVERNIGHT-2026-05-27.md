---
created: 2026-05-27
operator: Basil (asleep)
agent: Claude Opus 4.7 1M (autonomous overnight)
branch: bot/swarm-overnight-2026-05-27
base: a45811988 (current `bot/swarm-a6-producthunt-reader` HEAD)
worktree: C:/dev/trendingrepo-wt/overnight-2026-05-27
constraint: another session is actively committing on `bot/swarm-a6-producthunt-reader` — work isolated, no overlap
---

# Overnight Wave — 2026-05-27

Greenlit by Basil after the Supabase egress incident was resolved. Five
self-contained waves, each ending in a per-file commit so progress is durable
and reviewable independently. Worktree-isolated so the parallel session on
the source branch keeps shipping without merge friction.

## Ground state (verified before starting)

- Worker container `toolbox-trendingrepo-worker-1`: `Up (healthy)`, image `vps-20260527154301-7a1a00c`
- `/healthz`: `ok:true, db:true, redis:true`
- `consensus-verdicts`: 505 items, generator `nanogpt` / model `moonshotai/kimi-k2.6`, computed 2026-05-27T13:02
- Live prod page `/repo/NousResearch/hermes-agent`: Kimi prose in meta description, "EMERGING SIGNAL" rendering — **e2e confirmed working**
- GH token pool on Redis: 12 unique tokens publishing state, only 2 actively used in last 2h (`...yyJC`, `...dog2`)
- Supabase: `SUPABASE_URL` blanked on TOOLBOX, kill-switch `WORKER_SUPABASE_WRITES` default-off in code

## Waves

### Wave 1 — Richer Kimi citation blogs (90 min target)

**Why:** today's `ConsensusItemReport` includes optional `tagline` + `citations[]` in
the schema but Kimi never emits them. Adding them unlocks (a) the "Sources"
row on every repo profile, (b) JSON-LD `citation` for AI-search engines.

**Scope (worker only):**
- `apps/trendingrepo-worker/src/fetchers/consensus-analyst/prompt.ts`
  - Extend `SYSTEM_PROMPT` to require `tagline` (1-line expert framing) + `citations[]` (2-5 entries, real https URLs from the input sources data) in output JSON.
  - Extend `ItemReportSchema` Zod to validate the new fields. Both fields optional in the schema so old payloads stay valid during the rolling deploy.
- `apps/trendingrepo-worker/src/fetchers/consensus-analyst/__tests__/prompt.test.ts` — new file, validates the schema accepts both shapes.

**Verification:**
- `npm run typecheck` from the worker root, green.
- Unit test passes.
- DO NOT deploy — leave for Basil to approve on wake; the deploy step is on him so a fresh image doesn't conflict with whatever the parallel session is shipping.

**Risk:** zero file overlap with the active session (they're in `community-profile/`, `star-activity/`, not `consensus-analyst/`).

### Wave 2 — GH pool hygiene + sweep job (60 min target)

**Why:** Redis has 22 `pool:github:tokens:*` keys with stale reset-windows
(some 5675 minutes in the past) marking healthy tokens as quarantined.
Confusing and would mask a real exhaustion event.

**Scope (Next.js app side, all NEW files — zero conflict risk):**
- `src/lib/github-pool-sweeper.ts` — pure function: read all `pool:github:tokens:*`, drop keys where `quarantinedUntilMs < now - 48h` AND `resetUnixSec * 1000 < now - 24h`. Return summary `{ scanned, expired, expiredLabels[] }`.
- `src/app/api/cron/github-pool-sweep/route.ts` — POST endpoint authenticated via `CRON_SECRET`, calls the sweeper, returns the summary. Daily cron.
- `src/lib/__tests__/github-pool-sweeper.test.ts` — vitest unit covering: keeps fresh, expires stale, handles malformed payloads, handles Redis brownout.

**Verification:**
- `npm run typecheck`
- `npm run test:hooks -- github-pool-sweeper`

**Wiring:** point `.github/workflows/post-deploy-smoke.yml` or similar at the new endpoint with a daily schedule — actually defer this, leave it as a one-shot operator-callable endpoint and let Basil add the cron entry on review.

### Wave 3 — Registry-tail consensus-analyst sweep (60 min target)

**Why:** primary `consensus-analyst` is `TOP_N=30` hourly, registry has 1000+
repos → each repo only gets analyzed once every ~33 hours. Daily sweep over
the tail brings everything inside a 24h window.

**Scope (new fetcher, zero overlap):**
- `apps/trendingrepo-worker/src/fetchers/consensus-analyst-tail/index.ts` — daily `0 5 * * *` (5:00 UTC, off-peak), pulls next N=120 registry repos skipping anything already in `consensus-verdicts.items`, runs same Kimi → NanoGPT flow, read-then-merges (same protect-existing semantics).
- Imports `SYSTEM_PROMPT`, `buildItemUserMessage`, `ItemReportSchema` from the existing `consensus-analyst/prompt.ts` — no logic duplication, only fetcher scaffolding.
- `apps/trendingrepo-worker/src/registry.ts` — 1-line registration (the registry already adds new fetchers via 1 line).

**Risk:** the 1-line edit to `registry.ts` is the only existing-file touch. Active session is unlikely to be editing the import block for this exact slot.

**Verification:**
- `npm run typecheck` worker side, green.
- Dry-run: `docker exec ... node /app/dist/index.js consensus-analyst-tail --dry-run` after a local rebuild (or skip dry-run and document on wake).

### Wave 4 — Verify Supabase posture clean (30 min)

**Why:** Basil's grace period ends 2026-06-23; need to confirm worker has
not written anything to Supabase in the last 24h.

**Scope (ops only, no code):**
- SSH probe TOOLBOX worker logs grep for `supabase` references / errors
- Document findings in this file (append a "Wave 4 results" section)

### Wave 5 — Additive citation row component (90 min target)

**Why:** when Wave 1 lands and Kimi starts emitting citations, the
RepoSignalSummary already renders them in its current shape — but we can
add a more prominent "Sources cited" row below the prose. ADDITIVE
component, no edits to existing files (avoids active-session conflict).

**Scope (new file only):**
- `src/components/repo/RepoCitationsRow.tsx` — server component, takes `citations: ConsensusCitation[]` prop, renders an inline source list with favicon-style chips.
- DO NOT wire it into `RepoSignalSummary.tsx` yet (that's the file the active session might touch). Leave wiring for Basil's review.
- Tests via `npm run test:hooks` (vitest is allowed for components per existing pattern).

## Stop conditions

- typecheck fails → fix and continue
- the active session pushes to the same file I'm about to touch → skip that wave, log it here
- 4 hours wall budget elapsed → wrap, write handover, open PR

## Open PR conditions

- All committed waves green via typecheck
- HANDOVER doc written summarizing what shipped, what didn't, what to verify
- PR opened against main (NOT `bot/swarm-a6-producthunt-reader` — avoid auto-rebase pain)

---

## Wave results (filled as work progresses)

### Wave 1 — _pending_
### Wave 2 — _pending_
### Wave 3 — _pending_
### Wave 4 — _pending_
### Wave 5 — _pending_
