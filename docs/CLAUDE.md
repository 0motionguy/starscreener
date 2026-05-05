---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# docs/ frontmatter + freshness rules

Two CI guards police this dir (both run in `lint:guards`):

- `check-docs-freshness.mjs` — fails if `status: living` has
  `last-verified` older than 90 days.
- `check-living-docs-have-frontmatter.mjs` — fails if any status
  claim lacks required fields.

## Required frontmatter by status

```
living    → last-verified: YYYY-MM-DD, verified-by: <who>
snapshot  → audit-date: YYYY-MM-DD, reason: <why>
pointer   → supersedes-by: <path> OR replacement: <path>
archive   → audit-date + reason (walker skips docs/archive/)
```

## When to use which

- `living` — current truth, re-verify each audit wave, bump
  `last-verified` (ENGINE.md, SITE-WIREMAP.md, OPERATOR.md).
- `snapshot` — point-in-time audit. Never updated; replaced.
- `pointer` — superseded; redirects so old links resolve.

## INDEX is hand-maintained

`00-INDEX.md`, `INDEX.md`, and per-subdir indexes (`forensic/`,
`release-validation/`) are NOT generated. Add the link when you add
the doc.

## Sub-agent rule: NO summary/report .md from sub-agents

Sub-agents return findings in text output, not new `.md` files. The
repo has eaten drift waves of agent-emitted reports nobody reads.
Forensic + heartbeat docs are operator-requested exceptions.
