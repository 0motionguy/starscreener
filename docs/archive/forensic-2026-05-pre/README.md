# Forensic Auto-Reports - Archived 2026-05-05

These 387 reports were auto-generated 2026-05-03 -> 2026-05-05 and were poisoning
Claude's context inside `docs/`. Archived here verbatim - DO NOT use to understand
current code. Cross-reference current state via `docs/INDEX.md` or the living
docs labeled `status: living`.

If a finding here is still active, open a fresh ticket and reference both this
folder and the current code path.

## Provenance

These were committed in two large agent-driven batches on 2026-05-05:

- `2c8000a5` chore(wave3): preserve agent session deliverables - 1071 files (no-verify)
- `f9fb1242` fix(types): wave3 typecheck - 27 errors -> 0

There is no single generator script. The reports are produced ad-hoc by parallel
sub-agent sessions and committed in `chore(wave...)` batches. To stop future
floods, see `docs/archive/forensic-generator-redirect.md`.

## Scope

- 387 markdown files moved from `docs/forensic/` on 2026-05-05.
- `00-INDEX.md` (the original canonical index, ~32K) is included in this archive.
- Numeric-prefix files (`05-...md`, `06-...md`, ..., `15-...md`) are also included.
