---
name: forensic-prune
description: Fires on prompts about forensic doc cleanup, "too many forensic files", "archive forensic", "prune docs/forensic", "forensic generator", "forensic INDEX is huge", "forensic noise", "auto-generated audit reports", or when docs/forensic/ has grown unwieldy.
---

# Forensic Prune

`docs/forensic/` is generated audit/investigation output. It accumulates fast and
swamps the index. This skill archives the existing reports, redirects the generator
to date-bucketed subfolders, and rebuilds the lean INDEX.

## CANONICAL OUTPUT PATH (all forensic writes)

**Any new forensic deliverable -- script-generated OR ad-hoc agent-written --
MUST land under `docs/archive/forensic/<YYYY-MM-DD>/`, never under
`docs/forensic/`.**

`docs/forensic/` was archived on 2026-05-05 to `docs/archive/forensic-2026-05-pre/`
and is gitignored at the top level. Files written there will not be committed.

If you are dispatching sub-agents that produce forensic reports (productivity
reviews, audit deltas, AISO scans, recovery heartbeats, status markers,
verification packets, etc.), instruct each agent to write to:

```
docs/archive/forensic/<YYYY-MM-DD>/AGN-NNNN-<SLUG>-<YYYY-MM-DD>.md
```

The `<YYYY-MM-DD>` segment is the date the agent runs (UTC).

## When to fire

Trigger phrases:
- "prune docs/forensic", "archive forensic", "forensic cleanup"
- "too many forensic files", "forensic noise", "forensic INDEX is huge"
- "forensic generator", "auto-generated audit reports"
- "thin out forensic"

## Procedure

1. **Locate the generator.**
   - Grep for writes into `docs/forensic/` -- usually `scripts/generate-forensic*.mjs`
     or a workflow under `.github/workflows/forensic-*.yml`.
   - Read it end-to-end. Note the output path it currently uses.

2. **Inventory current state.**
   - List `docs/forensic/*.md`. Note the date stamps in filenames (most are dated).
   - Sort by date; everything older than today's wave goes to the archive.

3. **Move existing reports.**
   - Create `docs/archive/forensic/YYYY-MM-DD/` for each distinct date present.
   - `git mv` (preserves history) each report to its dated archive folder.
   - Keep `docs/forensic/00-INDEX.md` at the top level -- it gets rewritten, not moved.

4. **Redirect the generator.**
   - Edit the generator to write to `docs/archive/forensic/<today>/<id>.md`
     instead of `docs/forensic/<id>.md`.
   - The top-level `docs/forensic/` becomes a thin pointer dir, not a dump.

5. **Regenerate the INDEX.**
   - Rewrite `docs/forensic/00-INDEX.md` as a SHORT pointer doc:
     - One section per archive date with a relative link to the folder.
     - Keep only currently-actionable findings inline at the top.
     - Closed/historical items live behind the date links, not in the body.
   - Cap the INDEX at ~80 lines. If it grows past that, more pruning is due.

6. **Verify.**
   - `git status` -- confirm the moves are recognized as renames (R), not delete+add.
   - Click through each archive-date link in the new INDEX -- no 404s.
   - Run the generator once locally; confirm the new file lands in the dated subfolder.
   - Commit as one move + one rewrite: `chore(forensic): archive <date> + slim INDEX`.

## Anti-patterns

- Deleting forensic reports -- they are evidence. Archive, never delete.
- `rm -rf docs/forensic/` -- destroys git history of investigations.
- Leaving the generator pointing at the old path after archiving (next run re-pollutes).
- Letting the INDEX grow unbounded -- it is a navigation aid, not a log.
- Bulk `git add docs/` -- archive moves should be a focused commit, not a sweep.
