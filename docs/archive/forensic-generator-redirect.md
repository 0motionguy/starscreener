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
