---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# ADR 0005: docs/_generated/ commit policy

- Status: Accepted (2026-05-05)
- Related: ADR 0004 (Redis primary)
- Origin: Wave 5 docs restructure

## Context

Multiple guard scripts write into `docs/_generated/`:

- `engine.json`, `engine.md` -- workflow inventory (changes when workflows
  change). Producer: `scripts/derive-engine-inventory.mjs`. Referenced by
  `docs/ENGINE.md` and `docs/INDEX.md`.
- `broken-links.md` -- doc-link checker output. Producer:
  `scripts/check-internal-doc-links.mjs`. Regenerated on every guard pass.
- `hook-smoke-test.md` -- hook test evidence. Producer: manual hook smoke run
  per `.claude/hooks/README.md`. Point-in-time evidence.
- `health-board.md` -- aggregated guard rollup (when produced).
- `cron-overlap.md` -- cron-overlap detector output (when produced).

Without a policy, every CI run produces phantom diffs. PRs fill with churn
from regenerated reports while the genuine workflow-inventory drift gets
buried in the same commit. Tracking everything is noisy; ignoring everything
loses PR-time visibility for the inventory that operators actually grep.

## Decision

**Hybrid** -- track stable indexes, gitignore high-churn reports.

- **Tracked** (committed to git):
  - `docs/_generated/engine.json` -- canonical workflow + cron + env-var
    inventory. PR reviewers must see drift; operators grep this for ground
    truth. Generation is deterministic (no `generated_at` timestamp).
  - `docs/_generated/engine.md` -- human-readable digest of `engine.json`.
    Same drift-visibility argument.
- **Gitignored** (not committed; regenerated on demand):
  - `docs/_generated/broken-links.md` -- high-churn; freshness > history.
  - `docs/_generated/health-board.md` -- derived rollup; auto-regenerated on
    demand; no human consumer between runs.
  - `docs/_generated/cron-overlap.md` -- informational; only matters at PR
    time when reviewer runs the detector.
  - `docs/_generated/hook-smoke-test.md` -- point-in-time evidence,
    regenerated as needed; not load-bearing across sessions.

## Consequences

Positive:

- Stable engine inventory shows up in PRs. Operators can grep for what
  changed (workflow added, env var renamed, cron route deleted).
- High-churn reports stop polluting commit history.
- Pre-commit hooks no longer race against parallel-agent regen.

Negative:

- Health-board and other gitignored reports vanish between local runs. This
  is acceptable -- they are derived from other sources and cheap to
  regenerate (`node scripts/derive-engine-inventory.mjs` and friends).
- `engine.json` requires deterministic generation -- no `generated_at`
  timestamp in the payload, no map ordering by hash. Producer scripts must
  sort keys and arrays. (Wave 5 fix already applied.)

## Activation

1. Append to `.gitignore`:

```
docs/_generated/broken-links.md
docs/_generated/health-board.md
docs/_generated/cron-overlap.md
docs/_generated/hook-smoke-test.md
```

2. Existing tracked copies of those four files: leave in place. They will
   be overwritten by future regen runs. The gitignore takes effect for new
   commits; existing tracked files are not auto-removed by gitignore. If a
   future cleanup wants them gone from history, it should `git rm` them in
   a dedicated commit -- out of scope here.

3. `docs/decisions/README.md` index updated to add row for ADR 0005.
   `docs/INDEX.md` "Generated docs" section updated to mark which are
   tracked vs gitignored.

## Verification

```
git check-ignore -v docs/_generated/broken-links.md
git check-ignore -v docs/_generated/health-board.md
git check-ignore -v docs/_generated/cron-overlap.md
git check-ignore -v docs/_generated/hook-smoke-test.md
node scripts/check-living-docs-have-frontmatter.mjs
```

Each `check-ignore` should print the matching `.gitignore` line. The
frontmatter check should still pass (this ADR carries `status: living`).
