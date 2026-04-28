# Session Handoff — 2026-04-27

> Paste the section under `--- ROLE PROMPT ---` into a new Claude Code session
> as the opening user message. It briefs the next Claude on where prior work
> ended, what NOT to re-implement, and what's actually worth shipping next.

---

## Where things stand

**Tech-debt audit roll-up**: [docs/AUDIT_COMPLETE.md](./AUDIT_COMPLETE.md). **71 of 87 findings closed (82%).** The remaining 16 are all `WK-*` — non-actionable on this branch because `apps/trendingrepo-worker/` is no longer present.

**Operator runbook**: [docs/RUNBOOK.md](./RUNBOOK.md) — auto-commit semantics, command index, CI guards reference, persistence discipline.

**Original audit doc**: [TECH_DEBT_AUDIT.md](../TECH_DEBT_AUDIT.md). **Original handoff** that started everything: [docs/AUDIT_HANDOFF.md](./AUDIT_HANDOFF.md).

### CI guards (5, all wired into `npm run lint:guards`)

| Guard | Catches |
|---|---|
| `lint:tokens` | `text-zinc-*` / `bg-gray-*` / etc. anywhere under `src/components` + `src/app` |
| `lint:err-message` | API routes shaping `err.message` into a response body (APP-03 regression) |
| `lint:zod-routes` | Mutating routes (POST/PUT/DELETE/PATCH) without `parseBody` import (25 legacy routes grandfathered + 7 true exceptions) |
| `lint:runtime` | Routes missing explicit `export const runtime = "nodejs"` or `"edge"` |
| `lint:err-envelope` | `NextResponse.json({ error: ... })` without `ok: false` discriminator |

### Other operational scripts

| Command | Purpose |
|---|---|
| `npm run audit:status` | Closure rate per category (parses TECH_DEBT_AUDIT.md + git log; **undercounts** because auto-commit absorbs work under unrelated messages) |
| `npm run typecheck` | tsc strict, project-wide. Should be 100% clean as of this handoff. |
| `npm run lint` | **Broken at branch level** — `eslint-patch` rejects ESLint 9.36 + `eslint-config-next`. Don't try to use it; `lint:guards` covers the audit-critical stuff. |

## Canonical helpers — DO NOT RE-IMPLEMENT

The following primitives exist; extend them, don't fork:

| Module | Use for |
|---|---|
| [src/lib/api/parse-body.ts](../src/lib/api/parse-body.ts) | `parseBody(req, ZodSchema, { allowEmpty? })` for any mutating route. `allowEmpty: true` for cron triggers that send `Content-Length: 0`. |
| [src/lib/api/error-response.ts](../src/lib/api/error-response.ts) | `serverError(err, { scope })` for 5xx. `errorEnvelope(message, code?)` for 4xx. Canonical body shape: `{ ok: false, error: string, code?: string }`. |
| [src/lib/api/cache.ts](../src/lib/api/cache.ts) | `READ_FAST_HEADERS` / `READ_MEDIUM_HEADERS` / `READ_SLOW_HEADERS` / `READ_HEAVY_HEADERS`. Pick by cron cadence. |
| [src/lib/admin/scan-sources.ts](../src/lib/admin/scan-sources.ts) | `SCAN_SOURCES` whitelist + script paths. |
| [src/lib/stripe/idempotency.ts](../src/lib/stripe/idempotency.ts) | `acquireStripeEventLock(redis, eventId)` Redis-SETNX idempotency. |
| [src/components/shared/ErrorBoundary.tsx](../src/components/shared/ErrorBoundary.tsx) | V2-styled boundary; wrap heavy canvases / chart mounts. |
| [src/lib/derived-repos/sparkline.ts](../src/lib/derived-repos/sparkline.ts) | `synthesizeSparkline` + `synthesizeRecentRepoSparkline`. |
| [src/lib/derived-repos/loaders/pipeline-jsonl.ts](../src/lib/derived-repos/loaders/pipeline-jsonl.ts) | mtime-cached `.data/repos.jsonl` loader. |
| [src/lib/derived-repos/loaders/trending-aggregates.ts](../src/lib/derived-repos/loaders/trending-aggregates.ts) | OSSInsights aggregation + `baseRepoFromTrending`. |
| [src/lib/derived-repos/decorators/{twitter,producthunt,cross-signal}.ts](../src/lib/derived-repos/decorators/) | Per-channel decorators; orchestrator at `src/lib/derived-repos.ts` chains them. |
| [src/lib/pipeline/storage/debounced-persist.ts](../src/lib/pipeline/storage/debounced-persist.ts) | `createDebouncedPersist({ flush, label, debounceMs })` factory. |
| [src/hooks/useDebouncedSearch.ts](../src/hooks/useDebouncedSearch.ts) | Debounced fetch + AbortController; replaces hand-rolled patterns. |
| [src/hooks/useCompareRepos.ts](../src/hooks/useCompareRepos.ts) | Cross-component dedup'd `/api/repos?ids=` fetcher (30s cache + in-flight Map). |
| [src/hooks/usePhysicsBubbles.ts](../src/hooks/usePhysicsBubbles.ts) | Generic verlet integrator + pointer capture for bubble canvases. Three canvases share it. |
| [mcp/src/runtime.ts](../mcp/src/runtime.ts) | `withMetering` + `run` + `UNTRUSTED_CONTENT_NOTICE` for the MCP server. |

## V2 design system — non-negotiable

Use `var(--v2-bg-*)`, `--v2-line-*`, `--v2-ink-*`, `--v2-sig-*` tokens and `.v2-mono`/`.v2-btn`/`.v2-btn-ghost`/`.v2-card`/`.v2-stat` classes. **Never** introduce Tailwind `text-zinc-*`/`bg-gray-*`/`text-neutral-*`/`bg-slate-*`/etc. Tokens defined in [src/app/globals.css:162-220](../src/app/globals.css). V2 primitives live in [src/components/v2/](../src/components/v2/). The `lint:tokens` guard fails the build on regression.

## Branch / commit policy

The operator (`Kermit457`) runs an aggressive auto-commit process that sweeps every working-tree change into the next stability commit. Two practical rules:

1. **Edit + verify + commit in one shell sequence.** Standalone single-file edits left in the working tree may be reverted to HEAD by the auto-commit if the operator's process treats them as a stale edit. Run `git add <file> && git commit -m ...` immediately after the Edit tool returns.
2. **The auto-commit can absorb your work under an unrelated commit message.** Don't be alarmed when `git status` clears unexpectedly — `git log --grep=<TICKET-ID>` may not find your commit, but the diff landed somewhere. Files in the same area as operator's in-flight V2 redesign are most likely to get absorbed.

**Resolving merge state from a race**: when `git commit` errors with "Committing is not possible because you have unmerged files", the auto-commit raced. Resolve with:
```bash
git checkout --ours data/<file>.json
git add data/<file>.json
```
Then unstage any operator WIP files you don't own and commit your work alone.

## Test infrastructure

- Pipeline tests via PowerShell: `.\node_modules\.bin\tsx.cmd --test src/lib/pipeline/__tests__/<file>.test.ts`
- Script tests via Node: `node --test scripts/__tests__/<file>.test.mjs`
- CLI tests: `node --test cli/__tests__/cli.test.mjs`
- **No React testing infrastructure** — `@testing-library/react` + `happy-dom` not installed. The 4 hooks (`useDebouncedSearch`, `usePhysicsBubbles`, `useCompareRepos`, `useWindowWidth`) currently have zero coverage. Adding test infra is its own focused task.

---

## --- ROLE PROMPT ---

You are picking up tech-debt cleanup + feature polish work mid-stream on the **STARSCREENER** repo (Next.js 15 App Router + Tailwind 4, project root `c:\Users\mirko\OneDrive\Desktop\STARSCREENER`). The major audit pass is done — the remaining work is mechanical migrations, perf hardening, and net-new feature work.

**Read first** (in this order, do not skip):
1. `docs/SESSION_HANDOFF.md` — this file
2. `docs/AUDIT_COMPLETE.md` — final closure report; what's done + truly open
3. `docs/AUDIT_HANDOFF.md` — original handoff with mid-audit context
4. `docs/RUNBOOK.md` — operator's lessons (auto-commit semantics, Recharts gotchas, persistence discipline)
5. `CLAUDE.md` — project conventions (data-store reads MUST go through `data-store.ts`, collectors run in `direct` mode not `api`, etc.)

**Status**:
- 71/87 audit findings closed (82%); the 16 remaining `WK-*` are non-actionable until `apps/trendingrepo-worker/` returns to this branch.
- 5 CI guards via `npm run lint:guards` — all green at session start.
- `npm run typecheck` clean at session start.
- ~58 commits across two sessions; the most recent run added bonus tooling (parseBody migrations, MCP scheme guard, README badges).

**Mirko's voice**: direct, action-oriented. He wants commits + verification, not proposals. Pick the next item, ship it, verify, commit, move on. He's OK with you picking the next sprint autonomously.

**Operating rules**:
1. **Cite `file:line` for every claim.** No vibes.
2. **Each commit is independently shippable.** Verify typecheck before commit.
3. **Stay inside the requested scope.** Don't widen.
4. **Use the canonical helpers** — list at the top of `docs/SESSION_HANDOFF.md`. Don't re-implement.
5. **Commit fast.** The operator's auto-commit can sweep working-tree work; staging-then-committing in one shell sequence wins the race.
6. **No old design.** V2 tokens only. The `lint:tokens` guard catches regressions.

**Pick from this queue** (ranked by ROI):

### Mechanical / continuation

- **A. parseBody legacy ratchet** — 25 routes left in the `lint:zod-routes` legacy list. Each migration is ~10 min: import `parseBody` + `errorEnvelope`, define a Zod schema, replace the typeof ladder, drop the route from the legacy list in `scripts/check-zod-on-mutating-routes.mjs`. Recent examples: commits `602dc24`, `19269aa`. Add `allowEmpty: true` for cron routes.
- **B. README badges auto-update script** — currently the badges in `README.md` are hardcoded ("71/87 closed", "100%", "0 critical"). Wire a tiny `scripts/update-readme-badges.mjs` that reads `npm run audit:status` output + `lint:tokens` exit code, regenerates the three badge URLs. ~30 min.

### Net-new tooling

- **C. Hook test infrastructure** — install `@testing-library/react` + `happy-dom`, add `vitest` config. Then write tests for the 4 hooks (`useDebouncedSearch`, `usePhysicsBubbles`, `useCompareRepos`, the `useWindowWidth` inside `Terminal.tsx`). Pays off long-term as more hooks ship.
- **D. Bundle size audit** — `@next/bundle-analyzer` after `next build` to find the heavy imports. Recharts (~100KB) + framer-motion (~40KB) are likely top 2; `dynamic()` import patterns may already cover these but the analyzer would prove it.
- **E. E2E homepage smoke** — Playwright happy-path covering the FAQ JSON-LD wording, TerminalBar render, BubbleMap mount. Catches the "I shipped 50 commits, did /home still load?" question.

### Performance / strategic

- **F. Cold-Lambda perf measurement** — instrument `getDerivedRepos()` first-call timing on a fresh Vercel deploy. The 5s cache floor + 4-loader pattern was the LIB-01 fix; a real measurement (not theoretical) would tell us whether the cache key composition is paying off or whether further work in `_cache` invalidation is needed.
- **G. Branded types for slugs** — `RepoFullName = string & { __brand: "RepoFullName" }` etc. Prevents passing a raw string where a validated slug is expected. Would touch many call sites — focused half-day.

### Worker reunification (deferred)

- **H. WK-01 + WK-02** — 6-line PRs once the worker dir is back. WK-01 = remove `huggingface` stub from FETCHERS. WK-02 = `import aiBlogs from './fetchers/ai-blogs/index.js'` + append. After that, WK-03..WK-16 are mostly small.

**Default suggestion**: Start with **A** (parseBody ratchet, 5 routes per session = ~5 sessions to clear it). Mechanical, low-risk, ships value every commit. If you want net-new instead, pick **C** (hook test infra) since it unblocks higher-confidence shipping for any future React work.

**Skip**: anything in `apps/trendingrepo-worker/` (dir gone), anything labeled "WK-*" (parked), `npm run lint` (broken at branch level).

End of role prompt.

---

## Pitfalls observed

1. **Auto-commit races on standalone single-file edits.** If your edit is the *only* change in a file and you don't commit immediately, the operator's auto-commit may revert it. Edit + `git add && git commit` in one shell sequence.

2. **Files with operator in-flight work absorb your edits invisibly.** When the operator is mid-V2-redesign on a file (e.g. `src/app/page.tsx`, `src/components/news/newsTopMetrics.ts`), your changes ride along into the operator's next stability commit. `git status` will clear unexpectedly — check `git log --oneline -3` to see what landed.

3. **`apps/trendingrepo-worker/` is GONE.** All 16 `WK-*` audit findings + `SCR-07` describe code that doesn't exist on this branch. Don't try to fix them. If the dir returns, the closing commits are ~6-line PRs each.

4. **Recharts `TooltipProps<...>` typing is broken in our version.** Audit `UI-16` attempted a typed-prop fix and reverted — Recharts doesn't expose `payload` on `TooltipProps`. Leave the localized `as any` cast and move on.

5. **The `recharts` string `dataKey` (`"counts.${src}"`) does work** even though the docs are unclear. Verified via `UI-14`.

6. **`commit git status` (with the leading word `command`) bypasses the `rtk` proxy** and gives raw git output when the proxy parser flakes. Use it when you need accurate state.

7. **`schedulePersist` invocations during `recomputeAll` go through `withSuspendedPersistHook`.** If you add a new bulk-mutation phase, wrap it the same way. Don't manually call `schedulePersist` inside a bulk pass.

8. **Stripe webhook needs `runtime = "nodejs"` and raw `request.text()`.** The Stripe SDK depends on Node's crypto module + the HMAC verify hashes the unparsed body. The `lint:runtime` guard now requires every route declare its runtime explicitly so a future Edge experiment can't silently break sig verification.

9. **`lint:zod-routes` Map duplicate-key gotcha.** The script's `ALLOW_NO_PARSEBODY` is a JS Map — duplicate keys get overwritten by the LATER `set`. If you add an entry to the "True exceptions" block at the top, also remove it from the "Grandfathered legacy" block at the bottom or your reason gets clobbered.

10. **`process.env.NODE_ENV !== "development"` is the right check for fail-closed admin gates** (APP-07). `=== "production"` fails open in staging/preview/test. If you add a new admin or cron escape hatch, mirror this pattern.

11. **Operator-WIP files with broken refs get committed and auto-fixed.** Don't waste time fixing what looks like operator's typecheck errors — by the time you Edit, the operator may have already pushed a fix. Re-run `npm run typecheck` instead of patching what you saw 30 seconds ago.

End of handoff.
