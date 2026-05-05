# Forensic Generator Redirect - Notes for Orchestrator

Date: 2026-05-05
Author: Phase 1.1 sub-agent

## Finding

There is **no single generator script** that writes to `docs/forensic/AGN-*.md`.
A targeted search confirmed this:

- `git log --diff-filter=A --name-only -- 'docs/forensic/AGN-*.md'` shows two
  bulk-add commits on 2026-05-05 only:
  - `2c8000a5` chore(wave3): preserve agent session deliverables - 1071 files
  - `f9fb1242` fix(types): wave3 typecheck - 27 errors -> 0
- `Grep "docs/forensic"` across `scripts/`, `.github/workflows/`, repo root:
  zero generator scripts. Only one file (`scripts/check-no-err-message-echoes.mjs`)
  *references* a forensic doc as a data source, but it does not write.
- `Grep "generate-forensic"`, `Glob "**/generate*forensic*"`: zero hits.

The reports are produced ad-hoc by parallel sub-agent sessions (each agent writes
its own forensic report at session end) and committed by a single orchestrator
"chore(wave...): preserve agent session deliverables" sweep that bulk-stages
everything under `docs/forensic/` without inspection.

## Implication

The "generator" is the **agent dispatch / commit-sweep workflow**, not a script
file. There is no single path edit that redirects future output. Two options for
the orchestrator:

### Option A: change the agent prompt template (recommended)

Wherever the agent fleet is dispatched, the prompt or skill template tells each
agent to write its forensic deliverable under `docs/forensic/AGN-NNNN-...-DATE.md`.
That destination string is the lever. Update it to:

```
docs/archive/forensic/<YYYY-MM-DD>/AGN-NNNN-...-<slug>.md
```

Search likely locations:

- `.claude/agents/` (project + bundled agent definitions)
- `.claude/skills/` (especially `audit-repair`, `forensic-prune`)
- `.paperclip/` task templates if dispatch is paperclip-driven
- Any per-agent `instructionsFilePath` referenced in fleet config

The `.claude/skills/project/forensic-prune/SKILL.md` (already in repo) describes
the *correct* future path - new generations should land in
`docs/archive/forensic/<YYYY-MM-DD>/`. Apply this convention everywhere agents
are told where to write.

### Option B: add a pre-commit guard

If updating every agent prompt is impractical, add a pre-commit hook that
rejects writes to `docs/forensic/` and rewrites the path to
`docs/archive/forensic/<today>/`. Lower-trust and noisier; prefer Option A.

## What was done in Phase 1.1

- Moved `docs/forensic/` (387 files) to `docs/archive/forensic-2026-05-pre/`
  via `git mv`. Full-dir move worked on Windows (no per-file fallback needed).
- Added `docs/archive/forensic-2026-05-pre/README.md` explaining the archive.
- Updated 9 high-impact doc references (CLAUDE.md, CONTRIBUTING.md,
  docs/ARCHITECTURE.md, docs/decisions/0002-multi-tier-cache-architecture.md,
  docs/runbook-aiso-operator-checklist.md, docs/runbook-github-pool-exhausted.md,
  docs/runbooks/github-pool-exhausted.md, docs/runbooks/vercel-deploy-failing.md,
  docs/protocols/PAPERCLIP-AGENT-ONBOARDING-CHECKLIST.md).
- Did NOT rewrite the ~31 historical heartbeat audit-trail entries in
  `tasks/CURRENT-SPRINT.md` and `tasks/BACKLOG.md` - those are historical
  evidence records of what was read at that time, and rewriting would create
  false records (K3 surgical-changes guardrail). They remain as a known
  stale-link audit item; the linked file still exists at the new archive path
  for any reader who follows them.
- Did NOT rewrite the ~21 release-validation/perf docs that each contain a
  single mention - those are themselves auto-generated artefacts and will be
  regenerated to the new path once the orchestrator lever is pulled.

## Action items for the orchestrator

1. Locate where agents are told to write to `docs/forensic/` (agent prompts,
   skill templates, or paperclip task definitions).
2. Replace `docs/forensic/` with `docs/archive/forensic/<YYYY-MM-DD>/` in those
   templates.
3. Optionally add a `.gitignore`-style guard or commit hook that flags any new
   write to `docs/forensic/`.
4. Verify by running one agent dispatch and confirming the new file lands under
   `docs/archive/forensic/<today>/`.

## Phase 2 follow-up (2026-05-05)

Closed out by AGN-1606 sub-agent. Three-pronged redirect:

- **Scripts patched** to write under `docs/archive/forensic/<YYYY-MM-DD>/`:
  - `scripts/agn792-aiso-scan.mjs` (line 9 — outDir)
  - `scripts/aiso-monthly-regression-watcher.mjs` (line 14 area — FORENSIC_DIR
    became per-run `forensicDir(startedAt)`)
- **Skill template strengthened.** `.claude/skills/project/forensic-prune/SKILL.md`
  now declares `docs/archive/forensic/<YYYY-MM-DD>/` as the canonical output path
  for any forensic write — script-generated OR ad-hoc agent-written. Future
  dispatches that quote this skill will land in the right place.
- **Gitignore safety net.** `.gitignore` now contains `/docs/forensic/`. Any
  parallel-agent sweep that ignores the skill template still won't pollute the
  repo — the writes stay on disk only and never get committed.

After Phase 1.1, commit `2724ae58` ("docs(forensic+ops): land 2026-05-05
productivity reviews + AISO scans + worker churn") had re-added 78 files into
`docs/forensic/` because the orchestrator commit-sweep (`git add docs/`) caught
ad-hoc agent writes that bypassed Phase 1.1's archive. AGN-1606 moved those
89 in-flight files (78 originally tracked + 11 fresh untracked) back to
`docs/archive/forensic-2026-05-pre/` via `git mv -f`. 13 had filename collisions
with the original archive snapshot — the in-flight (newer) version wins because
those agents had appended new content during Phase 1.1+.

`docs/forensic/` is now empty and removed from disk.

## Phase 3 follow-up (2026-05-05, Wave 4)

`tasks/NEXT-WAVE-2026-05-06.md` flagged that `docs/forensic/` kept regenerating
even after the Wave 3 patches. Investigation found the residual writers were not
scripts at all -- they were two skill templates and the project doc-index that
still pointed agents at the old path:

- **`.claude/skills/project/audit-repair/SKILL.md`** (lines 22, 49) instructed
  agents to read AND update `docs/forensic/00-INDEX.md` on every audit-repair
  invocation. Patched to read the historical archive INDEX
  (`docs/archive/forensic-2026-05-pre/00-INDEX.md`) and write new findings under
  `docs/archive/forensic/<YYYY-MM-DD>/`.
- **`.claude/skills/project/forensic-prune/SKILL.md`** (procedure steps 3-5)
  declared the canonical output path correctly at the top, then the procedure
  itself told invokers to "Keep `docs/forensic/00-INDEX.md` at the top level"
  and "Rewrite `docs/forensic/00-INDEX.md` as a SHORT pointer doc". Internal
  contradiction. Patched the procedure to match the canonical-path declaration:
  the directory is gone, INDEX lives at `docs/archive/forensic/INDEX.md`.
- **`docs/INDEX.md`** (Forensic section, ~lines 392-401) still listed
  `docs/forensic/00-INDEX.md` and two AGN-1490/1524 reports as if they were the
  live root. Repointed the section header + table to
  `docs/archive/forensic/<YYYY-MM-DD>/`.
- **`CLAUDE.md` Anti-Patterns Already Burned** gained an explicit bullet:
  "Don't write under `docs/forensic/`." So even agents that don't load any skill
  see the rule on every session opening.

In-flight cleanup: 7 ad-hoc agent files arrived in `docs/forensic/` during the
Wave 4 investigation itself (AGN-1641, 1642, 1644, 1645, 1647, 1648, 1152) plus
a regenerated `00-INDEX.md`. All moved/removed; directory deleted.

Root cause (Wave 4 confirmed): the gitignore-only guard from Wave 3 stopped
files from being **committed**, but did not stop them from being **written**.
Agents follow whatever path their session prompts (CLAUDE.md, skill templates,
docs/INDEX.md) name. As long as a single live prompt named `docs/forensic/...`,
agents would create the directory + write into it on the next session, the
session-end commit-sweep would skip the gitignored path, and the next agent's
opening protocol read of `docs/forensic/00-INDEX.md` would fail or follow a
re-generated stub. The fix had to remove every live mention from the prompt
surface, not just the ignore list.
