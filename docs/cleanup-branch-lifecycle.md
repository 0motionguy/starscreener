# Cleanup-branch lifecycle

Authoritative spec for how `cleanup/*` and `hygiene/*` branches start, mature, ship, and get archived.

History — 2026-05-31 found `cleanup/2026-05-30-hygiene` carrying:
- 11 commits the operator wanted shipped (auth modal + logo + CSP),
- a producthunt-removal commit (`a53df3bbd`) that another agent added,
  which conflicts with the active producthunt-reader feature on the
  prod-deploy branch,
- 18 unrelated hygiene commits (Storybook removal, INDEX cleanup,
  dead-script purge) of mixed authorship and review state.

The cleanup branch had drifted into "we can't safely merge because
parallel agent did X" territory. This doc + the `wt:health` script
(see [SWARM-2x2.md](SWARM-2x2.md)) make that preventable.

## States

```
            (1) created
                  |
                  v
            (2) accumulating ----+
                  |              |
                  v              |  >7 days → freeze
            (3) reviewed         |
                  |              |
                  v              |
            (4) shipped / archived
```

1. **created** — `git checkout -b cleanup/<YYYY-MM-DD>-<topic>` from
   `main` (or the active prod-deploy branch when the cleanup targets
   prod-only debt). Commit message of the first commit explains the
   scope: what is being cleaned up, who asked.

2. **accumulating** — every commit on the branch must fit the
   declared scope. Out-of-scope commits go on a different branch.
   This is the most common drift mode and the one a parallel-agent
   session can violate silently — see SWARM-2x2 enforcement.

3. **reviewed** — operator audits the branch tip vs `main` (or the
   prod-deploy branch). For each commit, decision is one of:
   - **ship** — cherry-pick to the prod-deploy branch
   - **defer** — leave on cleanup branch for a future wave
   - **reject** — revert / drop (parallel-agent contamination)
   Cleanup branch is NEVER fast-forward-merged to prod-deploy whole.
   Cherry-pick is the only path to prod, so reviewing happens
   per-commit, not all-at-once.

4. **shipped / archived** — once the operator's per-commit decisions
   are recorded, the cleanup branch is renamed to
   `archive/cleanup-<YYYY-MM-DD>-<topic>` and pushed to origin for
   history. New cleanup waves start their own branch.

## Hard rules

- **Weekly reconcile.** Any `cleanup/*` branch > 7 days old AND > 7
  commits ahead of its target SHOULD be reconciled (state 3 → 4).
  After 14 days, freeze new commits and reconcile MUST happen.
- **No catch-all naming.** `cleanup/hygiene` is forbidden — every
  cleanup branch carries a date + topic so parallel waves don't
  collide.
- **No merges from cleanup to prod-deploy.** Cherry-pick only. A
  whole-branch merge bundles the entire mixed bag and surfaces
  per-commit issues only at conflict time.
- **No agent should run `git stash -u`** on a cleanup branch — see
  CLAUDE.md "anti-patterns already burned" (orphan untracked-files
  commits). Use `git checkout -b wip/<topic>` instead.

## Detect drift

Session start (every swarm slot):
```
npm run wt:health             # warn, exit 0
npm run wt:health:strict      # fail (exit 1) on red flag
```

The script reports each worktree's staged/unstaged/untracked counts,
ahead/behind vs origin, and flags pending changes to high-conflict
files (Sidebar.tsx, shell.css, package.json, next.config.ts, Clerk
config). If any worktree is > 7 commits ahead OR > 7 behind origin,
or has pending changes to a high-conflict file, the lint reports a
red flag — investigate before doing more work in that worktree.

## Current open cleanup branch (snapshot 2026-05-31)

`cleanup/2026-05-30-hygiene` carries 29 commits ahead of
`bot/swarm-a6-producthunt-reader`:

- **11 shipped** via cherry-pick on 2026-05-31 (auth modal + logo +
  CSP). Live on prod at tip `e848b2ec5`.
- **1 rejected** — `a53df3bbd chore(hygiene): purge ProductHunt
  source end-to-end` conflicts with active producthunt-reader
  feature; not in scope of this cleanup wave.
- **17 deferred** — Storybook removal, INDEX cleanup, dead-script
  purge, NEXTAUTH_* env vars removal. Awaiting per-commit operator
  decision (E.2 from handover-2026-05-31-hardening). Default action
  if no decision by 2026-06-07: rename to
  `archive/cleanup-2026-05-30-hygiene` and defer to a future
  reconcile.
