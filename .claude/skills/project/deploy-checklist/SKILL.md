---
name: deploy-checklist
description: Fires before "git push", "deploy", "ship", "release", "merge to main", "push to prod", "vercel deploy", "ship it", or when the user is about to merge to main. Runs the preflight gates -- typecheck, lint, tests, freshness check, operator-doc refresh prompt -- in order.
---

# Deploy Checklist

STARSCREENER ships to Vercel on merge to `main`. Cron workflows run from GitHub Actions.
A bad push wedges the home page (ISR cache poisons for 30 min) and can break every cron
slot at once. Run this checklist EVERY time before push to main.

## When to fire

Trigger phrases:
- "git push", "push to main", "push to prod"
- "deploy", "ship", "ship it", "release"
- "merge to main", "vercel deploy", "production push"
- "ready to push", "ready to ship"

## The ordered gates -- do not reorder

Run each command and confirm clean exit before the next. Stop on first failure.

1. **Typecheck**
   ```
   npm run typecheck
   ```
   Must be clean. No `any`-cast workarounds. If a type error is "in unrelated code",
   it is still your problem -- fix or revert.

2. **Lint + guards**
   ```
   npm run lint
   npm run lint:guards
   ```
   `lint:guards` catches the project-specific footguns (Zod on mutating routes,
   missing error envelopes, runtime drift, edge-runtime in cron). Do not skip.

3. **Tests**
   ```
   npm test
   ```
   Runs node:test + tsx + vitest serially. If you scoped changes narrowly, also run
   the relevant subsuite for fast feedback:
   - `npm run test:hooks` (vitest)
   - `npm run test:e2e` (Playwright)

4. **Freshness check**
   ```
   npm run freshness:check
   ```
   Surfaces any data source past its budget. If anything is stale, REPAIR before
   shipping (per CLAUDE.md session-opening protocol). A stale source plus a deploy
   often masks the cron failure as a "deploy issue".

5. **Operator doc refresh prompt**
   - Open `docs/OPERATOR.md` and ask: does the "what shipped vs open" section reflect
     this push? If not, update it in the same PR.
   - This is the operator-only situational-awareness doc -- skipping it is how the
     repo ends up in "engine drift".

6. **Git hygiene**
   - `git status` -- confirm only intended files are staged.
   - `git log --oneline origin/main..HEAD` -- review the commit list one more time.
   - NO `git add -A` / `git add .` -- name the specific files (parallel-session theft).

7. **Push**
   ```
   git push
   ```
   Watch the Vercel deploy and the next cron slot. If the deploy goes red or the
   first cron after it 500s, ROLLBACK immediately -- do not "fix forward" under load.

## Anti-patterns

- Skipping `freshness:check` because "the change is unrelated to data".
- Running tests in watch mode and assuming green -- run the full suite once.
- `git push --force` to main -- never, unless explicitly requested in writing.
- Pushing while a cron workflow is mid-run on the same data slug (race the writer).
- "It typechecks, ship it" -- M4: typecheck is not visual proof, not functional proof.
