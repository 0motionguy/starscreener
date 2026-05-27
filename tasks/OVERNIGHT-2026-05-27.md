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

### Wave 1 — ✅ SHIPPED

- `apps/trendingrepo-worker/src/fetchers/consensus-analyst/prompt.ts` — extended SYSTEM_PROMPT, ItemReportSchema, buildItemUserMessage with tagline + citations[].
- New file: `__tests__/prompt.test.ts` — 17 tests covering CitationSchema (https-only, length cap), ItemReportSchema back-compat (legacy 505 items still validate), buildCitationCandidates (GitHub-first, rank-sorted, URL-encoded, excludes 'ours'), buildItemUserMessage (citationCandidates in payload).
- Worker typecheck green. 17/17 tests pass. Full worker suite 354/354 (1 sql-skipped, 2 todo).
- Commits: `adbe171f6` (prompt), `3830225b7` (test).
- App-side compatibility: `src/lib/consensus-verdicts.ts` already normalizes both fields as optional — zero app changes required.

### Wave 2 — ✅ SHIPPED

- New files only:
  - `src/lib/github-pool-sweeper.ts` — pure `planSweep()` + impure `runSweep()` with lazy-imported ioredis. Two grace windows: 48h quarantine, 24h reset-stale.
  - `src/lib/__tests__/github-pool-sweeper.test.ts` — 19 tests (node:test pattern, matches existing suite). All green.
  - `src/app/api/cron/github-pool-sweep/route.ts` — GET/POST CRON_SECRET-authed, ?dry=1 mode, same shape as account-purge.
- App typecheck green.
- Commits: `b3d265a06`, `dd611d2a4`, `9a0ecd948`.
- Operator action on review: add cron entry (suggested `33 4 * * *` UTC daily, off-peak).

### Wave 3 — ✅ SHIPPED

- New file: `apps/trendingrepo-worker/src/fetchers/consensus-analyst-tail/index.ts` — daily `0 5 * * *` sweep of consensus-trending ranks 31-200, skipping fullNames already in consensus-verdicts.items. Reuses primary's SYSTEM_PROMPT + ItemReportSchema + buildItemUserMessage. CONSENSUS_TAIL_LIMIT env override (default 60, max 120). Two-stage merge to absorb concurrent primary runs.
- 2-line additive edit: `registry.ts` (import + array entry). No surgical conflict with active session.
- Worker typecheck green. registry.test.ts passes (confirms registration).
- Commits: `7e5e65f7d` (fetcher), `e635dcc20` (registry).
- Probe verified: consensus-trending has 200 items, so tail covers 170. Current consensus-verdicts has 505 items (historical). Fresh consensus-trending tail ≤ 170 candidates per run.

### Wave 4 — ✅ VERIFIED, no code change

Probed TOOLBOX worker `toolbox-trendingrepo-worker-1`:
- Container: `Up (healthy)`, image `vps-20260527154301-7a1a00c`.
- `/healthz`: `ok:true, db:true, redis:true`.
- `.env`: SUPABASE_URL and SUPABASE_SERVICE_ROLE are present-but-blank (kill-switch posture confirmed).
- 24h log scan: ZERO actual Supabase HTTP calls. The kill-switch is doing its job.
- BUT: `loadOverrides()` (apps/trendingrepo-worker/src/platform/overrides.ts) runs every 60s and logs `"source overrides db load failed; falling back to cache"` because `getDb()` throws on blank env BEFORE making a network call. That's 1440 warning lines/day of pure log noise — harmless (zero egress) but ugly.

**Follow-up suggestion (deferred, NOT shipped tonight to avoid touching `overrides.ts` while active session is committing nearby):**
- Add an env-presence precheck at the top of `loadOverrides()`. If SUPABASE_URL is empty, log ONCE at startup and noop on subsequent ticks. ~5 lines. Safe and isolated. Defer to Basil's review.

Also flagged in log scan: `repo-metadata` has GraphQL errors (1-5 per batch out of 40). Could be secondary rate limit (cost-points), 404s on archived repos, or token quarantine cascade. Not in tonight's scope. Worth a debug session.

### Wave 5 — ⏭️ SKIPPED (subsumed by Wave 1)

Discovered on starting: the rendering surfaces for `tagline` and `citations[]` already exist:
- `src/components/repo/RepoSignalSummary.tsx` (ConsensusBody helper at line 237) renders `item.tagline` as a leading `<strong>` paragraph and `item.citations` as a "Sources: a · b · c" row.
- `src/lib/seo/repo-jsonld.ts` already includes `citation` in the Article graph at line 91-94.

Once Wave 1 deploys, Kimi starts emitting both fields → they automatically appear on `/repo/[owner]/[name]` pages AND in the structured-data graph for AI-search engines. No additional component work needed.

Net: Wave 5 was a phantom — the codebase was already ready.

---

## Verification on Basil's wake

1. **Worker deploy** (manual step — left for Basil):
   - `docker build --platform linux/amd64 --provenance=false -t toolbox-trendingrepo-worker:vps-$(date +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD) apps/trendingrepo-worker`
   - `docker save <TAG> | gzip | ssh toolbox 'gunzip | docker load'`
   - `ssh toolbox "sed -i 's|image: toolbox-trendingrepo-worker:.*|image: <TAG>|' /opt/toolbox-trendingrepo-worker/docker-compose.yml && docker compose up -d"`

2. **Verify Kimi prompt change is live**:
   - Wait for the next `0 * * * *` consensus-analyst tick after deploy
   - SSH probe consensus-verdicts:
     ```
     ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 node -e "
       const Redis = require(\"ioredis\"); const r = new Redis(process.env.REDIS_URL);
       (async () => {
         const data = await r.get(\"ss:data:v1:consensus-verdicts\");
         const zlib = require(\"zlib\");
         const parsed = data.startsWith(\"gz1:\")
           ? JSON.parse(zlib.gunzipSync(Buffer.from(data.slice(4), \"base64\")).toString())
           : JSON.parse(data);
         const first = Object.values(parsed.items)[0];
         console.log({ tagline: first.tagline, citations: first.citations });
         r.disconnect();
       })();
     "'
     ```
   - Expect: `tagline` is non-empty, `citations` is an array of ≥2 https URLs.

3. **Verify rendering on /repo/[owner]/[name]**:
   - `curl -s -A "Mozilla/5.0" https://trendingrepo.com/repo/<fresh-top-30-owner>/<name> | grep -oE "(pf-summary-tagline|pf-summary-sources)"`
   - Expect: both class names present.

4. **Wire the sweep cron** (operator decision, leave for Basil):
   - Add to `.github/workflows/post-deploy-smoke.yml` OR a new dedicated workflow:
     ```yaml
     - cron: '33 4 * * *'   # daily at 04:33 UTC
       call: 'POST /api/cron/github-pool-sweep' with CRON_SECRET
     ```

5. **One-shot sweep dry-run** (safe, returns plan without deleting):
   - `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://trendingrepo.com/api/cron/github-pool-sweep?dry=1"`
   - Expect: JSON shows `scanned: ~22`, `expired: [...]` matching the ghosts seen in earlier probe.

6. **Verify tail fetcher schedule visible**:
   - `ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 wget -qO- http://127.0.0.1:8080/healthz | jq .'`
   - Then trigger an ad-hoc run after deploy:
     `ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 node /app/dist/index.js consensus-analyst-tail --dry-run'`
