# Codex Review System

Owner: Mirko
Tooling: BenedictKing `codex-review` skill + local `codex review` CLI
Scope: STARSCREENER application, worker, MCP server, scripts, data contracts, and user-facing features
Started: 2026-04-27

This system turns code review into a repeatable sequence. It is for two kinds of review:

1. **Diff review** for current branch or uncommitted work.
2. **Feature review** for the whole codebase, sliced by product/runtime area.

`codex review` is strongest when it reviews a clear diff or a narrow feature slice with explicit intent. Do not ask it to "review everything" in one pass; run the steps below and log each pass in `docs/review/CODEX_REVIEW_LOG.md`.

## Ground Rules

- Preserve user work. Check `git status --short` before every pass and do not revert unrelated edits.
- Exclude generated/vendor/runtime directories from feature review: `node_modules/`, `.next/`, `.data/`, `dogfood-output/`, `.code-review-graph/`, logs, and local skill packs such as `awesome-codex-skills/`.
- Treat P0/P1/P2 findings as fix-now unless the fix would change product direction. P3+ can be tracked.
- Validate before reporting a pass as done.
- Keep every finding tied to a file path, risk, reproduction path, and proposed fix.

## Standard Validation

Run the relevant checks before each codex pass:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

For the worker:

```powershell
Push-Location apps/trendingrepo-worker
npm run typecheck
npm test
npm run build
Pop-Location
```

For MCP:

```powershell
Push-Location mcp
npm run build
Pop-Location
```

## Diff Review

Use this for uncommitted changes:

```powershell
git status --short
git diff --stat HEAD
npm run typecheck
npm run lint
npm test
codex review --uncommitted --title "STARSCREENER uncommitted review" --config model=gpt-5.3-codex --config model_reasoning_effort=high
```

Use this for a branch review against `main`:

```powershell
git fetch origin main
git diff --stat origin/main...HEAD
npm run typecheck
npm run lint
npm test
codex review --base origin/main --title "STARSCREENER branch review" --config model=gpt-5.3-codex --config model_reasoning_effort=xhigh
```

If untracked files include local/vendor material, do not stage them for review. Either move them out of the repo or add an explicit scope note in the log.

## Feature Review Order

Review the codebase in this order. Each row is one codex prompt/pass plus local verification.

| Step | Area | Primary paths | Main risks |
| --- | --- | --- | --- |
| 1 | HTTP/API boundary | `src/app/api/**`, `src/lib/api/**`, `src/portal/**` | auth gaps, unbounded inputs, cache leaks, unsafe mutation |
| 2 | Pipeline and data store | `src/lib/pipeline/**`, `src/lib/data-store.ts`, `data/**`, `.data/*.jsonl` shape only | data loss, stale reads, broken derived repos, schema drift |
| 3 | Source ingestion scripts | `scripts/scrape-*`, `scripts/collect-*`, `src/lib/*-trending.ts` | external I/O timeouts, parser drift, synthetic data, rate limits |
| 4 | Worker runtime | `apps/trendingrepo-worker/src/**`, `apps/trendingrepo-worker/tests/**` | scheduler failure, publish correctness, Redis/Supabase assumptions |
| 5 | User-facing app | `src/app/**/page.tsx`, `src/components/**`, `src/lib/hooks/**` | broken flows, hydration issues, accessibility, stale client state |
| 6 | Admin, auth, billing | `src/app/admin/**`, `src/app/api/admin/**`, `src/app/api/checkout/**`, `src/app/api/webhooks/stripe/**`, `src/lib/api/session.ts` | privilege bypass, webhook verification, session confusion |
| 7 | MCP and agent surface | `mcp/**`, `src/tools/**`, `skills/**`, `src/app/portal/**` | prompt injection, unsafe tool output, schema mismatch |
| 8 | CI, deploy, ops | `.github/**`, `railway.json`, `next.config.ts`, `docs/protocols/**` | missing checks, env drift, deploy rollback gaps |

Use this prompt shape for each feature pass:

```text
Review STARSCREENER <area>. Scope: <paths>. Intent: <what this feature must guarantee>.
Focus on P0/P1/P2 correctness, security, data integrity, and missing regression tests.
Return findings only when they include file/line, impact, reproduction path, and concrete fix.
Do not report style-only issues.
```

Example:

```powershell
codex review "Review STARSCREENER HTTP/API boundary. Scope: src/app/api/**, src/lib/api/**, src/portal/**. Intent: every mutation is authenticated, every request is bounded and validated, and responses do not leak private state. Focus on P0/P1/P2 correctness, security, data integrity, and missing regression tests. Return findings only when they include file/line, impact, reproduction path, and concrete fix. Do not report style-only issues." --config model=gpt-5.3-codex --config model_reasoning_effort=xhigh
```

## Finding Format

Log every accepted issue with this shape:

```markdown
### CR-YYYYMMDD-NNN - P1 - Short title

- Status: open | fixed | accepted-risk
- Area: API boundary
- Files: `path:line`
- Impact: What breaks or what can be abused.
- Reproduction: Exact request, data shape, or user flow.
- Fix: Smallest defensible change.
- Verification: Test or command that proves the fix.
```

## Exit Criteria

A feature step is complete only when:

- Validation commands for that area pass or the failure is logged with a blocker.
- `codex review` produced no unresolved P0/P1/P2 findings, or each finding has a linked fix plan.
- `docs/review/CODEX_REVIEW_LOG.md` has the command, result, and next action.

