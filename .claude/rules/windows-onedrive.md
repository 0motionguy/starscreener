---
name: windows-onedrive
description: Windows + OneDrive — `.next` junction workaround is required, CSS edits can be silently reverted
paths:
  - next.config.ts
  - next.config.mjs
  - src/**/*.css
  - src/**/*.module.css
  - src/app/**/*.css
---

# Windows + OneDrive — the `.next` trap + CSS silent-revert trap

## The trap

From `CLAUDE.md:43`:

> Windows + OneDrive gotcha: dev server hits ENOENT loops without the `.next` junction workaround in `next.config.ts:12-25`. CSS edits can also be silently reverted by OneDrive sync — see memory note `project_onedrive_dev_server_block`.

**Verified** (`next.config.ts` lines 14-27 — the comment block spans 14-27, not strictly 12-25; `CLAUDE.md` line range is slightly off):

```ts
// Note on Windows + OneDrive: this project lives under a synced folder
// and OneDrive can race Turbopack's `.next/static/development/_buildManifest.js.tmp`
// writes on cold-start (ENOENT loops). Two mitigations are baked in:
//   1. We avoid touching `.next` between dev runs (no rm -rf in scripts);
//      once the cache is populated Turbopack rewrites are atomic enough
//      to coexist with OneDrive.
//   2. If you need a clean slate, replace `.next` with a directory
//      junction pointing outside the synced tree:
//        rmdir /S /Q .next
//        mklink /J .next %TEMP%\trendingrepo-next-dev
//      Turbopack's "stay inside project root" check is satisfied because
//      the junction is inside the project; the writes land outside it.
//      Production builds on Vercel ignore the junction (the runner
//      builds on a fresh ext4 lambda).
```

## Current repo location

Per `CLAUDE.md:96`:

> Repo lives at `C:\dev\trendingrepo` (off OneDrive — CSS edits and `.next` cache are no longer at risk of silent revert).

The main repo is now off OneDrive. The workaround stays documented because:

1. Swarm worktrees (`C:\dev\trendingrepo-wt\{tl,tr,bl,br}` per `CLAUDE.md:97`) can still land in synced paths if mis-configured.
2. The `next.config.ts` comment is load-bearing for future operators.
3. Founder may clone fresh into a OneDrive-synced path again on another machine.

## When editing

- **Don't `rm -rf .next` between dev runs.** This is the #1 cause of ENOENT loops (`next.config.ts:18-19`).
- If you need a clean slate, use the `mklink /J` junction recipe quoted above. Do NOT use a symlink — junctions are what Turbopack's "stay inside project root" check accepts.
- After a CSS edit on a synced path: `git status` to confirm the file is staged with your change. OneDrive sync has been observed reverting CSS files mid-edit. If the diff disappears, re-apply and immediately `git add <path>` + `git commit -m "wip(css): ..."` to lock the edit (per the parallel-session staging rule in `CLAUDE.md:87`).
- The `next.config.ts:12-27` comment block is documentation, not dead code. Do not "clean it up" — the comment is the runbook.

## Related quirks

- Windows worktree junction trap: `rm -rf .claude/worktrees/wf_*` follows junction into main `node_modules/`. Prefer `git worktree remove -f -f` (memory: `reference_windows_worktree_junction_trap` — global rule applies here too).
- `.next` is in `outputFileTracingExcludes['/**']` (`next.config.ts:92-100`) but **NOT** with the `./.next/**/*` pattern — see the inline warning at `next.config.ts:84-91` that adding it breaks the lambda manifest.
