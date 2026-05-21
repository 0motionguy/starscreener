# HANDOVER — Mentions Ledger Rebuild (2026-05-21)

**Status:** plan approved, EXECUTION not started.
**Source plan:** `C:\Users\mirko\.claude\plans\all-this-plus-deploy-ready-zippy-hamster.md`
**Branch:** `fix/csp-clerk-cname-fonts` (no commits yet from this work)
**Owner of next session:** Data Pipeline & Component Architect (see § Role Prompt below)

This is a **fresh-session handover**. Read this top-to-bottom before any edit.

---

## HARD ARCHITECTURE RULE (operator-confirmed 2026-05-21)

> **EVERY collector / fetcher / aggregator / seed-job runs on toolbox**
> (the VPS worker at `apps/trendingrepo-worker/`). Nothing new lands in
> `scripts/scrape-*.mjs`. That directory is duplicated tech-debt being
> retired in a separate cleanup ticket.

The toolbox is the canonical home for ingestion. The worker writes to
Redis (`ss:data:v1:*` for snapshot slugs, `ss:mentions:v1:*` for the new
ledger). Next.js reads via the refresh-then-get pattern. No exceptions.

**SSH to toolbox** (already wired in `~/.ssh/config`):

```
Host toolbox
  HostName 193.53.40.118
  User root
  IdentityFile ~/.ssh/AndyAikey.pem
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

So the executing session can:
```bash
ssh toolbox                                          # interactive
ssh toolbox 'cd trendingrepo-worker && pm2 status'   # one-shot
```

Use this to verify Redis state, kick the seed job, watch cron logs, or
restart the worker process after deploy.

---

## Source status (operator-confirmed 2026-05-21 15:30 GMT+8)

Operator console check on toolbox confirms `tb_signals` table has **38 active
signal types**, most refreshed in the last 6 hours. The 13 sources this
homepage cares about:

| Signal | TOOLBOX status | Trendingrepo wiring | Action (agent) |
|---|---|---|---|
| `trending.hn.mentions` | 🟢 fresh + flowing | wired (`src/lib/hackernews.ts`) | none — seed includes |
| `trending.reddit.mentions` | 🔴 0 rows (OAuth missing) | reader wired, no data | A3 — restore Reddit OAuth on toolbox |
| `social.x.mentions` (Twitter via Nitter) | 🟡 0 rows | PR #183 unmerged | A4 — rebase + merge PR #183 (`nt.vern.cc`) |
| `trending.bluesky.mentions` | 🟢 fresh + flowing | wired (`src/lib/bluesky.ts`) | none — seed includes |
| `trending.lobsters` | 🟢 fresh + flowing | wired (`src/lib/lobsters-trending.ts`) | none — seed includes |
| `trending.devto.mentions` | 🟢 fresh in TOOLBOX | env flag `TOOLBOX_READ_DEVTO_MENTIONS` OFF | A5 — flip Railway env + gate |
| `trending.github.stars.velocity` | 🟢 fresh | wired (1h/24h/7d/30d shape unverified) | A1 — verify shape during fetcher build |
| `trending.github.collections.hot` | 🟢 fresh + flowing | wired (`src/lib/hot-collections.ts`) | none |
| `trending.producthunt.launches` | 🟢 fresh in TOOLBOX | no reader adapter in trendingrepo | A6 — add `src/lib/producthunt.ts` |
| `trending.huggingface.models` | 🟢 fresh | wired, but unfiltered | A10 — `pipeline_tag IN ('text-generation','conversational')` |
| `funding.startup` | 🟢 fresh | wired (funding page) | none |
| `funding.sec.formd` | 🟢 fresh | wired (funding page) | none |
| `content.openai.announcements` | 🟢 fresh | wired (`src/lib/rss-feeds.ts`) | none |
| `trending.claude.rss` | 🟢 fresh | wired | none |
| `trending.awesome-skills` | 🟢 fresh (60 rows, slow signal) | shipped P0 | hold — slow signal, probably NOT for homepage |
| Trendshift | — no public API per research | — | skip (HTML scrape deferred) |

**Net effect on Reddit "out-of-scope" note below:** A3 restores Reddit OAuth on
the toolbox in <30 min of focused work; the rebuild now ships WITH Reddit.
The original out-of-scope note (line ~237) is superseded.

---

## TL;DR

The trending hub's Mentions column is architecturally wrong. Today's
collectors snapshot-replace a 7-day window, so when data goes stale (it is
3 days stale right now) almost every row reads `0`. The operator wants a
**cumulative ledger** — every detected mention ID adds to a per-(repo,
source) total that grows forever. Stars stay windowed (24h/7d/30d);
mentions become a single all-time number per source.

**Storage choice (operator-confirmed):** Redis SETs.
`SADD ss:mentions:v1:<repo>:<source> <mention-id>` → idempotent insert.
`SCARD` → cumulative count.

**Time horizon (operator-confirmed):** all-time forever, no eviction.

**Reddit collector is dead** (OAuth blocked, RSS fallback hardcodes
score=0). Operator put Reddit restore in a **separate task**. This rebuild
ships without Reddit.

**GitHub source icon** semantics is deferred — prototype 3 options for
operator to pick after the ledger is live.

---

## Why this exists

**Symptoms:**
- Current build: only X/Twitter logo shows on most rows; everyone else "0"
- OG/live screenshot: every row has 3–4 source icons + accurate cumulative
  count (e.g., `HKUDS/AI-Trader 65 mentions`)

**Root cause** (verified by 3 parallel Explore agents, 21 files inspected):

1. The 5 collectors (HN, Reddit, Bluesky, Dev.to, Lobsters) all run hourly
   via `apps/trendingrepo-worker/src/fetchers/*` and write
   `data/<source>-mentions.json` as a 7-day-windowed, top-50-per-repo
   snapshot. They **overwrite**, they don't accumulate.
2. `src/lib/derived-repos/decorators/mentions-rollup.ts` lines 243–382
   re-buckets the snapshot at read time to compute `count24h` / `count7d`.
   If the data is older than 24h (currently it is — last fetched
   2026-05-18), every `count24h` is zero.
3. The UI filters by `count24h > 0`. With the data 3 days stale, only
   Twitter (a separate Apify pipeline, last refreshed 2026-04-23) had any
   non-zero counts.
4. Per-mention stable IDs already exist for every source (HN `id`, Reddit
   `id`, Bluesky `uri`, Dev.to `id`, Lobsters `shortId`). The plumbing is
   there. The storage model is wrong.

---

## Architecture

### Storage layer (Redis)

Per detected mention:
```
SADD ss:mentions:v1:<owner>/<name>:<source>  <mention-id>
```

Example keys after seed:
```
ss:mentions:v1:vercel/next.js:hackernews    → 1284 members
ss:mentions:v1:vercel/next.js:reddit        → 432
ss:mentions:v1:vercel/next.js:bluesky       → 78
```

Per-repo index hash for fast read-side aggregation:
```
ss:mentions:v1:<owner>/<name>:_index  → { hackernews: 1284, reddit: 432, ... }
```

Optional global leaderboard for "top by mentions" sort:
```
ZADD ss:mentions:leaderboard:v1  <total>  <repo>
```

Memory cost: ~50 bytes per mention. 1M mentions ≈ 50 MB. Scales for years.

### Worker layer — NEW `apps/trendingrepo-worker/src/fetchers/mentions-ledger/`

Runs every 15 min (cron `7,22,37,52 * * * *`), offset from the upstream
collector windows. Reads the 5 snapshot slugs via `readDataStore<T>()`,
extracts every mention's stable ID, runs `SADD` in a pipeline. When SADD
adds a new member, increments the `_index` hash via `HINCRBY`. Idempotent —
re-running adds nothing new.

### Lib layer — NEW `src/lib/mentions-ledger.ts`

Standard refresh-then-get pattern (mandatory per `CLAUDE.md`):
```ts
export async function refreshMentionsLedgerFromStore(): Promise<void>;
export function getMentionsLedger(): Map<string, MentionsLedgerEntry>;
export function getRepoMentionsLedger(fullName: string): MentionsLedgerEntry | null;

interface MentionsLedgerEntry {
  fullName: string;
  perSource: Partial<Record<SocialPlatform, number>>;
  total: number;
  sources: SocialPlatform[];
}
```

### Decorator rewrite — `src/lib/derived-repos/decorators/mentions-rollup.ts`

Replace window-bucketed `count24h/count7d` with a single `count` per source
from the ledger. Keep `total24h` / `total7d` / `count24h` / `count7d` as
backwards-compat aliases (all pointing at the cumulative total) for one
deploy cycle, then delete.

### UI layer — `src/components/trending/MentionSourcePips.tsx`

- Read `repo.mentions.perSource[key].count` (no more 24h/7d branching).
- Filter `count > 0`.
- Resize: strip variant 20×20 px, table-cell variant 18×18 px.
- Cell shows max 4 icons + `+N` overflow chip + total at 13px tabular-nums.

---

## Phases

| Phase | Scope | Estimate |
|------|------|----------|
| A | Worker fetcher `mentions-ledger` + registry registration + unit test | 3–4 h |
| B | Lib reader + decorator rewrite + types extension | 2–3 h |
| C | UI cell rebuild + CSS resize | 1 h |
| D | One-shot **worker job** (NOT script): `apps/trendingrepo-worker/src/jobs/seed-mentions-ledger/index.ts` — reads existing snapshot slugs from Redis + the historical event log; triggered by `node dist/index.js --job seed-mentions-ledger` on toolbox | 1–2 h |
| E | typecheck + lint:guards + test + build + local probe + cumulative-count assertion | 1 h |
| F | Operator visual sign-off | ~15 min (operator-side) |

**Total ~9–11 h** focused work.

---

## File-by-file changes

| File | Phase | Status |
|------|-------|--------|
| `apps/trendingrepo-worker/src/fetchers/mentions-ledger/index.ts` | A | NEW |
| `apps/trendingrepo-worker/src/fetchers/mentions-ledger/index.test.ts` | A | NEW |
| `apps/trendingrepo-worker/src/registry.ts` | A | MODIFY — register + cron |
| `src/lib/mentions-ledger.ts` | B | NEW |
| `src/lib/__tests__/mentions-ledger.test.ts` | B | NEW |
| `src/lib/derived-repos/decorators/mentions-rollup.ts` | B | REWRITE within existing function signature |
| `src/lib/types.ts` | B | EXTEND `RepoMentionsRollup` with `total` + `perSource[].count` |
| `src/components/trending/MentionSourcePips.tsx` | C | SIMPLIFY filter + read new fields |
| `public/shell.css` | C | RESIZE `.spip` (20px), `.smark` (18px), `.ms-count` (13px bold) |
| `apps/trendingrepo-worker/src/jobs/seed-mentions-ledger/index.ts` | D | NEW (toolbox one-shot job — NOT a script) |

---

## Existing patterns to reuse — DON'T REINVENT

- **Refresh-then-get**: `src/lib/trending.ts` — canonical reference.
- **`writeDataStore` / `readDataStore`**: `apps/trendingrepo-worker/src/lib/redis.ts:155–220`.
- **Worker registry shape**: `apps/trendingrepo-worker/src/registry.ts:79–126`.
- **Per-source mention ID extraction** — already exists in each collector,
  reuse exactly:
  - HN `id` at `apps/trendingrepo-worker/src/fetchers/hackernews/index.ts:106`
  - Reddit `id` at `.../reddit/index.ts:170`
  - Bluesky `uri` at `.../bluesky/index.ts:123`
  - Dev.to `id` at `.../devto/index.ts:99`
  - Lobsters `shortId` at `.../lobsters/index.ts:63`
- **Seed source**: `data/repo-mentions-detail.jsonl` (27,196 lines append-only
  event log discovered during exploration — this IS the historical seed).
- **`MentionSourcePips`** — keep the `SourceLogo` SVG sub-component; only
  resize containers in CSS + change the filter predicate.

---

## Verification gate

Phase E + F success requires ALL of:

1. `npm run typecheck` exits 0.
2. `npm run lint:guards` exits 0.
3. `npm test` ≥ 1343 / 1343 (no regression).
4. `npm run build` exits 0; 91+ routes.
5. After `ssh toolbox 'cd trendingrepo-worker && npm run job:seed-mentions-ledger'`:
   ≥ 100 repos in Redis have `_index` hash populated with ≥ 2 sources.
   (Note: the seed is a worker JOB, not a `scripts/` mjs — see Phase D in the
   File-by-file table. There is no `scripts/seed-mentions-ledger.mjs`.)
6. After server restart (port 3023): probing HTML confirms ≥ 30 rows
   render ≥ 2 source icons in the mentions cell.
7. `curl -s http://localhost:3023/api/repos | jq` shows
   `mentions.perSource.<src>.count` non-zero on popular repos.
8. Operator hard-refreshes http://localhost:3023/ and visually approves
   the mentions column matches the OG screenshot quality.

---

## Out of scope (do NOT touch in this work)

- Reddit OAuth / Apify pipeline restore
- Twitter Apify actor restart
- New GitHub mention collector (issues / PRs / discussions)
- v6 production deploy / PR #2023 merge
- Performance polish (Home LCP)
- Hover preview position (already shipped)
- Anything in `apps/trendingrepo-worker/` outside the new ledger fetcher
- **Retiring `scripts/scrape-*.mjs`** — these duplicate the worker
  fetchers and operator wants them gone, but that's a separate cleanup
  ticket. This work MUST NOT create new `scripts/scrape-*` entries.

## Toolbox access (READY — no operator handoff needed)

| Item | Value |
|------|-------|
| SSH alias | `toolbox` |
| HostName | 193.53.40.118 |
| User | root |
| Key | `~/.ssh/AndyAikey.pem` |
| Config | already in `~/.ssh/config` — `ssh toolbox` just works |

The executing session can verify state with:
```bash
ssh toolbox 'redis-cli SCARD ss:mentions:v1:vercel/next.js:hackernews'
ssh toolbox 'redis-cli HGETALL ss:mentions:v1:vercel/next.js:_index'
ssh toolbox 'cd trendingrepo-worker && pm2 logs --lines 100'
```

---

## Role Prompt for the new session

> Paste this verbatim to start the executing session.

```
ROLE: Data Pipeline & Component Architect — Mentions Ledger Rebuild

WORKSPACE: c:\dev\trendingrepo on branch fix/csp-clerk-cname-fonts.
REPO CONSTITUTION: read CLAUDE.md + CLAUDE.local.md before any edit.

YOUR JOB: execute the plan at
docs/HANDOVER-2026-05-21-MENTIONS-LEDGER.md (this file) and its source
~/.claude/plans/all-this-plus-deploy-ready-zippy-hamster.md
across 5 phases (A → E) plus operator visual sign-off (Phase F).

NON-NEGOTIABLE CONSTRAINTS:
- K3 surgical: only the 10 files in the "File-by-file changes" table.
- K2 simplicity: no abstractions for single-use code.
- K4 verify: every phase has a runnable verification step; do not
  claim a phase done without running it.
- **TOOLBOX-ONLY for ingestion**: every collector / fetcher / seed-job
  lives in `apps/trendingrepo-worker/`. NOTHING new in
  `scripts/scrape-*.mjs` (operator-flagged tech debt).
- Data layer: refresh-then-get pattern (src/lib/data-store.ts).
- NO `git add .` / `git add -A`. Stage exact files only.
- NO Vercel deploy / promote / git connect / unpause without explicit
  per-invocation approval. Production is HOSTUP.
- NO new exports from route.ts files (Next 15 forbids).
- NO commits without explicit operator "commit" greenlight.

FIRST STEPS:
1. Read CLAUDE.md, CLAUDE.local.md, this handover doc, and
   src/lib/data-store.ts.
2. Read the source plan at
   ~/.claude/plans/all-this-plus-deploy-ready-zippy-hamster.md.
3. Verify branch state with `git status --short` — should match the
   carry-forward WIP from this session (mostly homepage + icons edits).
4. Execute Phase A (worker side ledger writer).
5. After each phase, run the verification step. Report findings.
6. Hand off to operator for Phase F visual approval.

ARCHITECTURE SUMMARY (also detailed in this doc):
- Mentions = cumulative ledger, not windowed snapshot.
- Storage: Redis SETs per (repo, source). SADD insert, SCARD count,
  HINCRBY for an _index hash for fast read.
- TOOLBOX-ONLY for ingestion: every fetcher / aggregator / seed-job
  lives in apps/trendingrepo-worker/. Nothing new in scripts/scrape-*.
- Worker writes; src/lib reads via refresh-then-get; UI renders.
- Stars/velocity stays windowed (24h/7d/30d). ONLY mentions change.
- Reddit dead — out of scope.
- GitHub icon decision deferred; prototype 3 options for operator.

TOOLBOX ACCESS (already in ~/.ssh/config — no operator handoff):
- ssh toolbox          # 193.53.40.118, root, ~/.ssh/AndyAikey.pem
- Verify state: ssh toolbox 'redis-cli SCARD ss:mentions:v1:<repo>:<src>'

VERIFICATION GATE: § "Verification gate" of this doc. All 8 criteria
must pass before declaring done.

OPERATOR PREFERENCES (from CLAUDE.local.md):
- Terse replies: "yes" / "next" / "fix" = trust + greenlight.
- Caps + exclamations = speed, not anger.
- One order at a time; do not batch shortcuts.
- "Boil the ocean": ship complete with tests + docs.

START NOW.
```

---

## 10-Agent Swarm Dispatch (2026-05-21 — operator-confirmed cadence)

The single-specialist Role Prompt above is the fallback. For maximum velocity
the operator dispatches 10 agents in 3 waves. The plan + risk register lives
at `~/.claude/plans/plan-handover-now-goofy-wolf.md`.

### Allocation table

| # | Agent | Slot/Branch | Owns | Depends | Proof |
|---|---|---|---|---|---|
| 1 | **A1-Fetcher** | tl / `bot/swarm-tl-claude-a1` | `apps/trendingrepo-worker/src/fetchers/mentions-ledger/{index.ts,index.test.ts}` + `registry.ts` (1-hunk: cron `7,22,37,52 * * * *`) | none | `cd apps/trendingrepo-worker && npm test -- mentions-ledger`; `ssh toolbox 'pm2 restart worker && pm2 logs --lines 50'` shows fetcher fire |
| 2 | **A2-LibReader** | tr / `bot/swarm-tr-claude-a1` | `src/lib/mentions-ledger.ts` (NEW), `src/lib/__tests__/mentions-ledger.test.ts` (NEW), extend `RepoMentionsRollup` in `src/lib/types.ts` with `total` + `perSource[].count` | none — mirrors refresh-then-get from `src/lib/trending.ts` | `npm run typecheck && npm test -- mentions-ledger` |
| 3 | **A3-Reddit-OAuth** | bl / `bot/swarm-bl-codex-a1` | `apps/trendingrepo-worker/src/fetchers/reddit/index.ts` (OAuth client-credentials), `apps/trendingrepo-worker/src/lib/env.ts` (`REDDIT_CLIENT_ID/SECRET`), `.env.example` | none | `ssh toolbox 'redis-cli KEYS ss:tb:reddit:*'` returns > 0 rows |
| 4 | **A4-Twitter-PR183** | br / `bot/swarm-br-codex-a1` | Rebase + merge PR #183 (Nitter via `nt.vern.cc`) — touches `apps/trendingrepo-worker/src/fetchers/twitter/index.ts` + `registry.ts` (1 hunk) | none | `ssh toolbox 'redis-cli HLEN ss:tb:social:x:mentions'` > 0 |
| 5 | **A5-DevTo-EnvFlag** | tl / `bot/swarm-tl-claude-a2` (after A1 merges) | `.env.example` + `apps/trendingrepo-worker/src/lib/env.ts` + `apps/trendingrepo-worker/src/fetchers/devto/index.ts` gate flip. **Operator manual: set `TOOLBOX_READ_DEVTO_MENTIONS=true` on Railway dashboard.** | none | `ssh toolbox 'redis-cli KEYS ss:tb:devto:mentions:*'` > 0 |
| 6 | **A6-ProductHunt-Reader** | tr / `bot/swarm-tr-claude-a2` (after A2 merges) | `src/lib/producthunt.ts` (NEW reader, mirrors `src/lib/hackernews.ts`), wire into decorator chain | none — worker fetcher already exists | `curl localhost:3024/api/repos \| jq '.[0].producthunt'` non-null |
| 7 | **A7-Decorator-Rewrite** | bl / `bot/swarm-bl-codex-a2` (after A2 merges) | `src/lib/derived-repos/decorators/mentions-rollup.ts` REWRITE: replace 24h/7d bucketing with `getRepoMentionsLedger()` reads; keep aliases for one cycle | A2 (consumes new `RepoMentionsRollup` type) | `curl localhost:3025/api/repos \| jq '[.[] \| select(.mentions.total>0)] \| length'` ≥ 100 |
| 8 | **A8-UI-Pips** | br / `bot/swarm-br-codex-a2` (after A4 + A7) | `src/components/trending/MentionSourcePips.tsx` + `public/shell.css` (`.spip` 20px, `.smark` 18px, `.ms-count` 13px tabular-nums) | A7 | Vercel Preview screenshot: ≥ 30 rows show ≥ 2 source icons |
| 9 | **A9-Seed-Job** | tl / `bot/swarm-tl-claude-a3` (after A1 + fetcher fired once on toolbox) | `apps/trendingrepo-worker/src/jobs/seed-mentions-ledger/index.ts` (NEW one-shot; reads `data/repo-mentions-detail.jsonl` + 5 snapshot slugs from Redis; SADD + HINCRBY in pipeline) | A1 | `ssh toolbox 'cd trendingrepo-worker && npm run job:seed-mentions-ledger'` then `redis-cli HGETALL ss:mentions:v1:vercel/next.js:_index` shows ≥ 2 sources |
| 10 | **A10-HF-LLM-Filter** | tr / `bot/swarm-tr-claude-a3` (after A6) | `apps/trendingrepo-worker/src/fetchers/huggingface/index.ts` (filter `pipeline_tag`), `apps/trendingrepo-worker/src/fetchers/huggingface/__tests__/llm-filter.test.ts` (NEW) | none structural | `ssh toolbox 'redis-cli SMEMBERS ss:tb:hf:models'` shows only LLM tags |

### Wave schedule

| Wave | Concurrent agents | Notes |
|---|---|---|
| **Wave 1** | A1 (tl) · A2 (tr) · A3 (bl) · A4 (br) | Pure independents. No shared files. |
| **Wave 2** | A5 (tl) · A6 (tr) · A7 (bl) · A8 (br) | Each rebases onto wave-1's merged PRs. A8 needs A4 + A7. |
| **Wave 3** | A9 (tl) · A10 (tr) | A9 requires A1 fetcher fired once on toolbox. bl/br idle — operator runs E2E. |

### Merge order (strict)

A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8 → A9 → A10.

**Rebase hot zones:** `registry.ts` (A1+A4), `env.ts` (A3+A5), `types.ts` (A2+A7), `mentions-rollup.ts` (A6 sibling + A7 rewrite).

### Risk register

| Risk | Mitigation |
|---|---|
| registry.ts merge storms (A1+A4) | Land A1 first; A4 rebases. One-line-per-PR registry edits — no reformatting. |
| A7 decorator drift from A2 type contract | A2 PR body pins `RepoMentionsRollup` shape as canonical. A7 + A8 cite it. Reject A7 if it adds fields A2 didn't ship. |
| A9 seed runs before A1 fires → wrong key shape | Block A9 merge until `ssh toolbox 'pm2 logs mentions-ledger --lines 20'` confirms A1 has fired ≥ once. |
| PR #183 (A4) is external; may have stale conflicts | Operator rebases PR #183 to current `main` before assigning. If conflicts > 3 files, defer A4 to sequential follow-up. |
| A5 env flag is a no-op without Railway action | A5 PR description must include: "Operator confirms `TOOLBOX_READ_DEVTO_MENTIONS=true` set on Railway prod env." |

### Per-agent role prompt template

Each swarm session pastes this verbatim (replace `{AGENT-ID}`, `{OWNS}`, `{DEPENDS}`, `{PROOF}` from the table above):

```
ROLE: {AGENT-ID} — Mentions Ledger Swarm Agent

WORKSPACE: c:\dev\trendingrepo-wt\{slot}  (worktree per docs/SWARM-2x2.md)
BRANCH: {branch from table}
PORT: 3023 (tl) / 3024 (tr) / 3025 (bl) / 3026 (br)

YOUR SLICE: {OWNS}
DEPENDS ON: {DEPENDS}
PROOF OF DONE: {PROOF}

NON-NEGOTIABLE CONSTRAINTS:
- K3 surgical: only the files in YOUR SLICE. Touch nothing else.
- K2 simplicity: no abstractions for single-use code.
- K4 verify: PROOF OF DONE must run green before claiming complete.
- TOOLBOX-ONLY for ingestion: NOTHING new in `scripts/scrape-*.mjs`.
- Refresh-then-get: data reads go through src/lib/data-store.ts.
- NO `git add .` / `git add -A`. Stage exact files only.
- NO Vercel deploy / promote / git connect / unpause.
- NO commits without explicit operator "commit" greenlight.

CONTEXT:
- Full plan: ~/.claude/plans/plan-handover-now-goofy-wolf.md
- Handover doc (THIS FILE): docs/HANDOVER-2026-05-21-MENTIONS-LEDGER.md
- Architecture: cumulative Redis-SET ledger per (repo, source).
  Storage: SADD ss:mentions:v1:<owner>/<name>:<source> <mention-id>
  Index:   HINCRBY ss:mentions:v1:<owner>/<name>:_index <source> 1
- SSH access: ssh toolbox (193.53.40.118, ~/.ssh/AndyAikey.pem)

FIRST STEPS:
1. cd to your worktree and confirm branch + clean git status.
2. Read the handover doc + plan top-to-bottom.
3. Read the files in YOUR SLICE (Read first, then Edit).
4. Implement, run PROOF OF DONE locally, report back with diff summary
   + proof command output.
5. Wait for operator "commit" before staging.

OPERATOR PREFERENCES (CLAUDE.local.md):
- Terse replies: "yes" / "next" / "fix" = greenlight.
- "Boil the ocean": ship complete with tests.

START NOW.
```

### Operator dispatch sequence

```bash
# Wave 1 — 4 parallel sessions in 4 worktrees
cd C:/dev/trendingrepo-wt/tl && claude   # paste A1 prompt
cd C:/dev/trendingrepo-wt/tr && claude   # paste A2 prompt
cd C:/dev/trendingrepo-wt/bl && codex    # paste A3 prompt (or claude if no codex)
cd C:/dev/trendingrepo-wt/br && codex    # paste A4 prompt

# Wait for all 4 PRs merged + green
# Then Wave 2 — same 4 slots, A5/A6/A7/A8 prompts
# Then Wave 3 — only tl + tr, A9/A10 prompts
```

### Single-command verification gate (after all 10 merge)

```bash
npm run typecheck && \
npm run lint:guards && \
npm test && \
npm run build && \
ssh toolbox 'cd trendingrepo-worker && npm run job:seed-mentions-ledger && redis-cli HLEN ss:mentions:v1:vercel/next.js:_index' && \
curl -s http://localhost:3000/api/repos | jq '[.[] | select(.mentions.total > 0)] | length' && \
node scripts/smoke-prod-30-routes.mjs
```

Pass criteria:
- typecheck / lint:guards / build exit 0
- ≥ 1343 tests pass (bumps if A1/A2/A9/A10 add specs)
- toolbox `HLEN` ≥ 2 (Vercel/next.js has ≥ 2 sources after seed)
- `/api/repos` shows ≥ 100 repos with `mentions.total > 0`
- 30/30 prod smoke routes return 200

---

## What this session shipped (background context for next session)

This session built up to the handover via several waves of UI work that
ARE merged on `fix/csp-clerk-cname-fonts`:

- Spec-kit run on the v6 cutover (constitution, spec, plan, tasks,
  analyze) — see `specs/001-v6-prod-cutover/`.
- Homepage redesign:
  - Hero subtitle trimmed.
  - Sidebar removed (full-width table).
  - Category tabs moved above filter strip.
  - Unified tab row: Top · Gainer · Trend · Skills · Agents · LLMs · MCP.
  - Featured 3 cards re-purposed: #1 Top, #1 Breakout, #1 Trend.
  - Real GitHub avatars in featured cards + table.
  - Tag chips removed from featured cards.
  - All categories use the same `TrendingTable` shape (via
    `src/lib/category-adapters.ts`).
  - Compare icon redrawn as double-arrow swap.
  - Hover preview anchors at cursor and floats up-right.
  - Mentions cell switched to inline SVG brand marks (geometry-only
    for devto/arxiv/lobsters) and active-only filter.
  - lucide-react icon migration (Star, Heart, Bell, ArrowLeftRight).

The mentions visual rework landed but the underlying DATA is still
windowed-snapshot — which is the architectural bug this handover
addresses.

Pre-existing build issue `Github` not exported by lucide-react was
fixed by removing the unused import.

PR #2023 (v6 production cutover) remains operator-owned and IS NOT
related to this work.
