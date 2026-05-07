# Swarm 2x2 — Operating Contract

Authoritative spec for the four-agent parallel topology. Every swarm session reads this on start. CLAUDE.md links here.

---

## Topology

Two Claude Code sessions + two Codex CLI sessions, each in a dedicated git worktree on a dedicated branch. Same `.git` directory, isolated working trees and indexes.

```
                    github.com/0motionguy/starscreener
                              (remote)
                                  |
                          C:\dev\trendingrepo
                          (main checkout — human review only)
                                  |
        +-------------------------+-------------------------+
        |              |                       |            |
     tl (3023)      tr (3024)              bl (3025)     br (3026)
   Claude #1       Claude #2              Codex #1      Codex #2
        |              |                       |            |
  bot/swarm-tl-   bot/swarm-tr-          bot/swarm-bl-  bot/swarm-br-
     claude         claude                  codex         codex
        |              |                       |            |
        +----- each push -> Vercel Preview per branch -----+
                                  |
                                main -> production
```

Worktree paths:

- `C:\dev\trendingrepo-wt\tl` -> `bot/swarm-tl-claude` (Claude #1, port 3023)
- `C:\dev\trendingrepo-wt\tr` -> `bot/swarm-tr-claude` (Claude #2, port 3024)
- `C:\dev\trendingrepo-wt\bl` -> `bot/swarm-bl-codex` (Codex #1, port 3025)
- `C:\dev\trendingrepo-wt\br` -> `bot/swarm-br-codex` (Codex #2, port 3026)

The legacy `C:\Users\mirko\Worktrees\AGN-*` worktrees belong to prior tickets and are untouched by the swarm.

---

## Port Assignments

| Slot | Worktree | Branch                | Dev Port |
|------|----------|-----------------------|----------|
| tl   | `…\tl`   | `bot/swarm-tl-claude` | 3023     |
| tr   | `…\tr`   | `bot/swarm-tr-claude` | 3024     |
| bl   | `…\bl`   | `bot/swarm-bl-codex`  | 3025     |
| br   | `…\br`   | `bot/swarm-br-codex`  | 3026     |

`PORT` is set in each worktree's `.env.local`. Never hardcode in `package.json` — the value must travel with the worktree.

---

## The 8-Rule Contract

Every agent in the swarm follows these rules. No exceptions.

1. **One worktree, one branch, one agent.** Never `cd` into another agent's worktree, even to "just check something."
2. **Stage by exact path only.** Always `git add <SPECIFIC-FILE>`. Never `git add -A`, `git add .`, or repo-spanning pathspec wildcards.
3. **Commit immediately after each Write.** Small commits are durable boundaries; staged files are shared mutable state.
4. **Push after every commit.** The matching Vercel Preview must reflect current branch state.
5. **Never `git checkout` a branch another agent owns** — even from your own worktree. Each branch has exactly one writer.
6. **Resolve conflicts inside your own worktree via `git pull --rebase`.** Don't switch branches to escape a conflict.
7. **Cross-agent dependencies route through `main`.** Upstream agent ships first via its draft PR; downstream agent rebases onto the new `main`. No direct branch-to-branch merges.
8. **Long-running commands run inside the owning worktree only.** `npm run build`, `npm test`, `npm run dev` from the main checkout while agents work corrupts the Next.js `.next` cache — race condition guaranteed.

---

## Runbook — Start a Session

From inside your assigned worktree (PowerShell):

```powershell
# Verify you are in the right worktree on the right branch
cd C:\dev\trendingrepo-wt\tl       # example for slot tl
git rev-parse --show-toplevel       # must match the worktree path
git branch --show-current           # must be bot/swarm-tl-claude

# Sync to remote tip of your branch
git fetch origin
git pull --rebase origin bot/swarm-tl-claude

# Read mandatory session-opening docs (CLAUDE.md step 1-7)
# - CLAUDE.md, docs/ENGINE.md, docs/SITE-WIREMAP.md
# - docs/AUDIT-2026-05-04.md, docs/forensic/00-INDEX.md
# - tasks/CURRENT-SPRINT.md, tasks/BACKLOG.md
# - npm run freshness:check

# Start dev server on this slot's port
npm run dev -- -p $env:PORT         # PORT is sourced from .env.local
```

Confirm the port and worktree match the slot before doing any work. If the port is wrong, the Vercel Preview screenshot will not match what the agent verifies locally.

---

## Runbook — Ship a Change

From inside your worktree only:

```powershell
# 1. Stage exact files (one git add per path)
git add src/components/Foo.tsx
git add src/components/Foo.test.tsx

# 2. Commit immediately — do not let staging linger
git commit -m "feat(foo/AGN-1234): explicit summary"

# 3. Push to your branch
git push origin bot/swarm-tl-claude

# 4. Open the draft PR (first push only)
gh pr create --draft --base main --head bot/swarm-tl-claude `
  --title "AGN-1234: explicit summary" `
  --body "Summary + test plan"

# 5. Wait for Vercel Preview check (~3 min). Capture URL from PR checks panel.
gh pr checks --watch

# 6. Verify visual changes against the Preview URL (M4: visual fix needs visual proof).

# 7. Mark PR ready and merge via the main checkout (human or CI).
gh pr ready
```

Repeat steps 1-3 for every Write. Do not batch.

---

## Vercel Previews

- Each push to `bot/swarm-{tl,tr,bl,br}-{claude,codex}` creates a Preview at:
  ```
  https://starscreener-git-bot-swarm-<slug>-<vercel-org>.vercel.app
  ```
- The Preview URL appears in the PR's GitHub checks panel within ~3 min.
- The Preview is the canonical visual proof surface. `tsc`, `npm run build`, `curl 200` are not visual proof.
- If the Preview does not reflect your latest commit, you forgot to push (rule 4).

---

## Anti-Patterns

### Staged-file theft (already burned, 2026-05-02)

**Symptom:** Agent A writes `file-a.ts` and runs `git add -A`. Agent B, working concurrently in the same checkout, writes `file-b.ts` and runs `git commit -m "wip(b)"`. Agent B's commit contains both `file-a.ts` and `file-b.ts`. Agent A's later `git commit` is empty or carries someone else's work.

**Why it happens:** Staging (`.git/index`) is per-checkout, not per-process. `git add` mutates a shared file. `git commit` snapshots whatever is staged at that instant — author identity does not enter into it.

**Why worktrees fix it:** Each worktree has its own `index` file. `C:\dev\trendingrepo-wt\tl\.git` (a pointer file) resolves to a worktree-specific index under the main `.git/worktrees/tl/index`. Two worktrees cannot stomp each other's stage.

**Why worktrees only fix it if the contract is followed:** If an agent `cd`s into another agent's worktree (rule 1) or runs `git add -A` from a path that resolves to the wrong worktree, the isolation collapses. Rules 1 and 2 are the load-bearing ones.

### `.next` cache race

Running `npm run dev` or `npm run build` from `C:\dev\trendingrepo` while the four worktree agents are also building corrupts the `.next` cache. Symptoms: phantom 500s, missing chunk graph, `ENOENT` loops on Windows + OneDrive (see memory `project_onedrive_dev_server_block`). The main checkout is read-only during swarm operation.

### Cross-branch merges

`git merge bot/swarm-tr-claude` from a `bot/swarm-tl-claude` worktree imports unreviewed code, defeats branch protection, and produces a Preview that does not match either agent's PR. Cross-agent dependencies go through `main` (rule 7).

---

## Coordination

- The user (Basil) assigns tasks in chat per session ("tl: AGN-1234, br: AGN-1500"). No shared task list across sessions.
- Each session may use its own `TaskCreate` to break its task into subtasks. The harness scopes these per-session — they do not leak across agents.
- Shared schema or shared module changes: upstream agent ships first to `main`, downstream agent rebases. Announce in chat once the upstream PR is merged so the downstream knows to rebase.

---

*Authoritative spec — agents must read this on session start. CLAUDE.md links here.*
