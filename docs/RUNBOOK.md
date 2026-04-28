# STARSCREENER — Operator Runbook

Consolidates the operational learnings from the tech-debt audit cleanup
sessions (2026-04-26 → 2026-04-27). When a workflow surprised someone,
it lands here so the next session doesn't re-hit the trap.

For the higher-level architecture see [`ARCHITECTURE.md`](./ARCHITECTURE.md);
for the audit closure roll-up see [`AUDIT_HANDOFF.md`](./AUDIT_HANDOFF.md).

---

## Auto-commit on this branch

The operator (`Kermit457`) runs an aggressive auto-commit process that
sweeps every working-tree change into the next stability commit. Two
practical implications:

1. **Edit + verify + commit immediately, in one shell sequence.** Standalone
   single-file edits left in the working tree may get reverted to HEAD by
   the auto-commit if the operator's process treats them as a stale edit.
   The fix:
   ```bash
   # do the edit; verify typecheck; then immediately:
   git add <file> && git commit -m "..."
   ```
   Files that already have other operator-side modifications are NOT
   reverted — those are treated as "in-flight work" and your additional
   edits ride along.

2. **Auto-commit can land your work under unrelated commit messages.** This
   is documented in the role prompt as a feature: typecheck-clean code
   ships even if your direct commit races. Don't be alarmed when
   `git status` clears unexpectedly — check the log.

3. **Resolving merge state from a race.** When `git commit` errors with
   "Committing is not possible because you have unmerged files", the
   auto-commit raced and left `data/*.json` files in an unmerged state.
   Resolve with:
   ```bash
   git checkout --ours data/<file>.json
   git add data/<file>.json
   ```
   Then unstage any operator WIP files you don't own and commit your work.

## Local commands

| Command | Purpose |
|---|---|
| `npm run dev` | Turbopack dev server on `:3023` |
| `npm run typecheck` | TS strict, project-wide |
| `npm run lint` | ESLint (currently broken at branch level — `eslint-patch` / Next.js compat issue; safe to ignore) |
| `npm run lint:guards` | Audit-bonus regression guards (V2 tokens, err.message, parseBody, runtime) |
| `npm run audit:status` | Closure rate per category (parses `TECH_DEBT_AUDIT.md` + `git log`) |
| `npm test` | Full pipeline test suite |
| `.\node_modules\.bin\tsx.cmd --test <path>` | Run single test file via PowerShell when bash flakes on tsx |
| `npm run verify:data-store` | End-to-end Redis check (needs `REDIS_URL`) |

## CI guards (regression catchers)

Each guard is a standalone `node` script under `scripts/check-*.mjs`. All
exit non-zero on violation; together they form `npm run lint:guards`.

| Guard | Catches |
|---|---|
| `lint:tokens` | New `text-zinc-*`/`bg-gray-*`/etc. anywhere under `src/components`+`src/app` (V2 design system regression). |
| `lint:err-message` | Routes shaping `err.message` into a response body (APP-03 regression). |
| `lint:zod-routes` | Mutating routes (POST/PUT/DELETE/PATCH) without `parseBody` import. 34 legacy routes grandfathered with "migrate when next touched." |
| `lint:runtime` | Routes missing `export const runtime = "nodejs"` (or `"edge"`). nodejs is the safe default. |

Adding new exemptions is intentionally manual — every entry in the
allow-list maps must carry a one-line rationale.

## Pipeline state-reset for tests

| Function | Module | When to call |
|---|---|---|
| `__resetDerivedReposCache()` | `src/lib/derived-repos.ts` | Between tests that mutate underlying data versions |
| `__resetProcessedEventsForTests()` | `src/lib/stripe/events.ts` | Stripe idempotency tests |
| `__resetPipelineReposCacheForTests()` | `src/lib/pipeline-repos` | Pipeline-repo cache flushes |
| `_resetForTests()` | `scripts/_data-store-write.mjs` | Data-store writer cached client reset |

## Branch policy

- `apps/trendingrepo-worker/` is currently broken on this branch (registry
  imports fetcher dirs that aren't on disk). Don't touch worker-dir items
  until that's resolved upstream.
- The operator's auto-commit lands data refreshes (`chore(data): refresh
  ...`) every few minutes. This is normal traffic — no action needed.
- Don't switch the Twitter collector back to `api` mode — it silently
  fails on Vercel's serverless filesystem (committed fix `edf99d2`).

## Recharts gotchas

- `TooltipProps<...>` typing is broken in our version — Recharts doesn't
  expose `payload` on `TooltipProps`. Leave the localized `as` cast and
  move on. Audit UI-16 attempted a typed-prop fix and reverted.
- The string `dataKey` (`"counts.${src}"`) DOES work even though the docs
  are unclear about it. Verified via UI-14.

## Pipeline persistence + bulk passes

`schedulePersist` invocations during `recomputeAll` go through
`withSuspendedPersistHook`. If you add a new bulk-mutation phase, wrap it
the same way — never manually call `schedulePersist` inside a bulk pass.
The phase functions (`phaseAssemble`, `phaseScore`, `phaseClassify`,
`phaseReasons`, `phaseRankAndEvents`, `phaseAlerts`) all run inside the
existing wrapper.

## Stripe webhook

- The route uses `request.text()` (not `.json()`) because
  `stripe.webhooks.constructEvent` hashes the raw body — a JSON
  reparse-then-stringify changes whitespace and breaks the HMAC.
- `runtime = "nodejs"` is required (Stripe SDK uses Node's crypto
  module). The `lint:runtime` guard catches a future Edge experiment that
  would silently break sig verification.
- Idempotency is via `acquireStripeEventLock` (Redis SETNX) keyed on
  `event.id`. Both `recomputeAll` and `recomputeRepo` paths emit
  `alert_triggered` after LIB-08 so event-stream subscribers see the
  same observable behavior either way.

## Known broken / parked

| Surface | State | Next action |
|---|---|---|
| `npm run lint` | `eslint-patch` rejects ESLint 9.36 + `eslint-config-next` | Pin or upgrade together; `lint:guards` covers the audit-critical guards in the meantime |
| `apps/trendingrepo-worker/` | Registry imports missing fetcher dirs | Resolve upstream before touching WK-* findings |
| `src/components/news/newsTopMetrics.ts` | Operator WIP (untracked) | Will land or be deleted by operator |
| `src/app/signals/page.tsx` | Operator WIP (uncommitted) | Same |
