---
name: STARSCREENER project context
description: Project-specific conventions, anti-patterns, and hard rules. Inject this file at the top of every ruflo agent's system prompt before they touch this codebase.
type: project-context
priority: critical
---

# STARSCREENER — agent operating context

You are working inside `c:\Users\mirko\OneDrive\Desktop\STARSCREENER`. Read [CLAUDE.md](../../CLAUDE.md) and [docs/ENGINE.md](../../docs/ENGINE.md) before any non-trivial edit.

## Hard rules (NEVER violate)

1. **No `git push`, `git push --force`, `git reset --hard`, `git rebase -i`, `npm publish`, or `vercel --prod`.** If a task seems to need any of these, stop and surface to operator.
2. **Never modify `.gitignore`, `CLAUDE.md`, or `CLAUDE.local.md`** unless the task explicitly names them.
3. **Never use `git add -A` or `git add .`** — always specify file paths. Parallel-session merge anti-pattern (see CLAUDE.md "Anti-Patterns Already Burned").
4. **Always run `npm run typecheck` after edits.** If it fails, revert your changes — do not commit broken types.
5. **Never write to these paths** (production cron output, operator state, build artifacts):
   - `data/*.json`, `data/_meta/*.json`, `.data/**`
   - `.next/**`, `dist/**`, `build/**`, `node_modules/**`, `coverage/**`
   - `.claude/**`, `.claude-flow/**`, `.swarm/**`, `.agents/**`, `.audit/**`, `.codex/**`, `.hive-mind/**`
   - `*.tsbuildinfo`, `ruvector.db`, `*.log`
6. **Twitter collector mode** — never switch back to API mode. Direct mode + GitHub Actions git commit is the only working path on Vercel. See CLAUDE.md "Anti-Patterns Already Burned".
7. **Data reads MUST go through the data-store**, not `readFileSync`. See [src/lib/data-store.ts](../../src/lib/data-store.ts) and `refreshXxxFromStore()` pattern.
8. **Mutating API routes need Zod**. Project has a meta-lint (`npm run lint:guards`) that catches this — run it before declaring done.

## Per-task budgets (defaults)

- Max 5 file edits per task. If you need more, decompose into sub-tasks.
- Max 20 Bash commands per task.
- Max 100k tokens per swarm run.
- If a budget feels insufficient, surface it instead of silently exceeding.

## Edit hygiene

- **K1 think before coding** — state assumptions if the task is ambiguous; ask if uncertain.
- **K2 simplicity first** — minimum code that solves the problem. No speculative features. No flexibility flags that weren't requested.
- **K3 surgical changes** — touch only what the task names. Don't refactor adjacent code, format unrelated files, or reorder imports.
- **K4 verify before claiming done** — typecheck green + targeted tests passing + (for visual changes) a screenshot or compiled-output grep targeting the specific marker.
- **No comments unless the WHY is non-obvious.** Don't narrate WHAT the code does — names already do that.
- **No hedge words** ("likely", "probably") covering unverified claims. State facts you can prove or say "unknown".

## Stack-specific

- **Next.js 15 App Router**, RSC + client islands. Server components are the default; only mark `"use client"` when you must.
- **Strict TypeScript 5.** No `any` without comment. No `as unknown as T` — fix the type.
- **Tailwind 4** for styling. Project's design tokens in `src/app/globals.css` and `src/components/ui/*`. Don't introduce inline styles where a token exists.
- **Validation**: Zod on all API boundaries.
- **Tests**: vitest (`src/**/__vitest__/*.test.ts`, `src/**/__tests__/*.test.tsx`) + node:test + Playwright e2e.

## Repo orientation (where to look)

- New here? `docs/ARCHITECTURE.md`
- Engine map: `docs/ENGINE.md`
- Site wiremap: `docs/SITE-WIREMAP.md`
- Data layer plan: `tasks/data-api.md`
- Audit ledger: `.audit/2026-05-03/SCORECARD.md`
- Tomorrow's runbook: `.audit/2026-05-03/TOMORROW.md`

## When in doubt

Surface the question to the operator. Don't guess. Don't burn budget on assumptions.
