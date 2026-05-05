---
name: audit-repair
description: Fires on "audit", "audit fix", "repair", "audit item", "tackle finding", "address audit", "fix audit", "work the audit", or when the user references the audit table, audit findings, or docs/AUDIT-*. Procedure runs the same loop as the audit-repairer subagent but invocable from the main loop.
---

# Audit Repair

A single audit item, end to end: read it, read affected code, propose a minimal fix,
wait for approval, apply, verify, update the audit ledger.

## When to fire

Trigger phrases:
- "audit", "audit fix", "audit item", "audit finding", "tackle finding"
- "repair", "address audit", "fix audit", "work the audit"
- "next audit", "close audit row", "audit table"

## The loop (one item at a time -- do NOT batch)

1. **Read the item.**
   - Open `docs/AUDIT-2026-05-04.md` (or whichever audit doc the user named).
   - Open `docs/forensic/00-INDEX.md` for any cross-referenced forensic notes.
   - Quote the exact row and ID back to the user so we agree on scope.

2. **Read affected code.**
   - Grep for every symbol/path the item names. Do not stop at the first match.
   - Read whole files, not just snippets -- audit items often understate blast radius.
   - State assumptions explicitly. If the item conflicts with current code, surface it.

3. **Propose minimal fix.**
   - K2 + K3: smallest diff that closes the row. No "while I'm here" cleanup.
   - Lay out the diff plan in plain prose with file paths and line ranges.
   - Call out side effects, migration needs, doc impacts.
   - Ask: "approve this plan?"  WAIT for explicit user yes/ship/do-it before editing.

4. **Apply the fix.**
   - Use Edit (not Write) for existing files.
   - One commit per audit row, message: `audit(<id>): <one-line summary>`.
   - Add the audit ID to the commit body for traceability.

5. **Verify.**
   - `npm run typecheck` MUST pass.
   - `npm test` MUST pass (or the targeted subsuite if scope is narrow).
   - If the row is a visual fix, screenshot proof per M4. tsc-clean is NOT proof.
   - Reproducer test for functional rows -- write the failing test first if missing.

6. **Update the ledger.**
   - Mark the row Done in `docs/AUDIT-*.md` with date + commit SHA.
   - If the item references a forensic doc, update `docs/forensic/00-INDEX.md` status.
   - If new follow-ups surfaced, add them to `tasks/BACKLOG.md` -- do NOT silently
     expand the current row.

## Delegation

This skill mirrors the `audit-repairer` subagent so the main loop can run the cycle
without dispatching. For deep multi-file refactors triggered by a single audit row,
DO dispatch `audit-repairer` with the row ID and a constrained scope statement.

## Anti-patterns

- Multi-row batch fixes -- one row, one commit, one verification.
- Skipping the approval gate (Karpathy K1 + ICM "no verdict before investigation").
- Marking Done without the verification evidence sentence.
- "Improving" adjacent code while you're in there (K3 violation).
- Treating recalled audit context as fact -- always re-read the row (M6).
