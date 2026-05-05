# Hook smoke test -- 2026-05-05

## post-edit.mjs
Status: PASS
Output: exit 0 on src/lib/utils.ts (clean lint + tsc); exit 0 silently on README.md (non-TS skip path).

## protect-files.mjs
Status: PASS
Output: exit 2 with "Protected file vercel.json; ask the user before editing." on vercel.json; exit 0 on docs/README.md.

## update-handoff.mjs
Status: PASS
Output: exit 0; appended one ISO-timestamped line to tasks/HANDOFF.md.
HANDOFF.md tail: 2026-05-05T05:20:38.558Z | branch=bot/marco/AGN-803 | files=90 | last-sha=e4737757
