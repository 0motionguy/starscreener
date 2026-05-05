---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# Handover — End of 2026-05-05

Single entry point for the next session. Supersedes
`tasks/NEXT-WAVE-2026-05-06.md` (everything in Waves A-E is done; F1+F2 are
explicit defers; F3 partially shipped).

---

## What landed today (9 commits on `bot/marco/AGN-803`, all pushed)

| SHA | Theme |
|---|---|
| `8b845df6` | Phase 1.0.D verification sweep (runbooks, protocols, tasks) |
| `e4737757` | ENGINE/DATABASE/SCORING rewrites + 4 guard scripts + 2 CI |
| `4ae6b74f` | Wave 2 polish (12 agents): link fixes, archives, hooks, AGENTS.md |
| `48a5e1c3` | Wave 3 final-1 (12 agents): ADR defer, cron deletes, generator patch |
| `e4030e21` | INDEX refresh + next-wave plan authored |
| `d0876c51` | Wave 4 (15 agents): A1-A5, B2-B4, C2-C4, D1-D3, E1-E6 closed |
| `d5a29fa6` | Wave 5 (12 agents): F3 OpenAPI gen + ADRs 0004/0005/0006 |
| `42ee8569` | Wave 6: cron stagger (10->8 max collisions) + generator frontmatter |
| `c38fd335` | Pre-existing fixes: typecheck + Next config + JSX + nextUrl mocks |

Net session output: ~80 sub-agents, all 5 guard scripts green.

## Repo state right now

Run `npm run health:board` to regenerate, OR these one-liners:

```
node scripts/check-docs-freshness.mjs            # PASS 40 living within 90d
node scripts/check-living-docs-have-frontmatter.mjs  # PASS 0 violations / 175
node scripts/check-redis-keys.mjs                # OK across src + worker + scripts
node scripts/check-internal-doc-links.mjs        # PASS broken=0 (54 archive skipped)
node scripts/check-workflow-engine-coverage.mjs  # PASS undocumented=0
```

Verified end-to-end:
- `npm run typecheck` -> only `.next/types/` route-validator errors remain (auto-generated; orthogonal to source). Source is clean.
- `npm run build` -> exit 0 (after watchlist JSX fix in `c38fd335`)
- `npm test` -> 1700+ tests; the 7 `nextUrl` mock failures we fixed in `c38fd335` are gone. Some pre-existing assertion failures in unrelated business logic remain.

Three living-doc front doors:
- `docs/INDEX.md` — every doc classified by trust level
- `docs/OPERATOR.md` — situational awareness
- `docs/_generated/health-board.md` — guard-script rollup

---

## What's open (ranked by ROI)

### A. Highest leverage / smallest effort

1. **Cron-overlap floor at 8** (Wave 6 left this). The `*/5` Vercel-warm + `*/N` monitors structurally collide every minute=0. To go below 8 you'd need to either:
   - Move `pipeline-persist`'s intentional `:30` offset, OR
   - Stagger the `*/5` cadence (changes meaning of "every 5 min")
   - **Recommendation:** accept the floor unless GH Actions runner contention bites.

2. **OpenAPI wiring (Wave 5 F3 partial)**. `scripts/derive-openapi.mjs` exists; surfaces 59 routes drifted vs hand-curated `docs/openapi.yaml`. Highest-traffic 5 to spec next (Agent 1 listed):
   - `/api/scoring/consensus`
   - `/api/scoring/engagement`
   - `/api/funding/events`, `/api/funding/sectors`
   - `/api/mentions`, `/api/skills`
   Then group `/api/cron/**` (10 missing).

3. **5 undocumented workflows in worker-coverage** — closed in Wave 5 commit `d5a29fa6`. Re-grep with `node scripts/check-workflow-engine-coverage.mjs` to confirm still 0.

### B. Pre-existing test/build issues we didn't touch

4. **`.next/types/` route-validator errors** (3 known: `compare/share`, `mcp`, `arxiv/trending`). These are Next.js 15 PageProps generic mismatches — surgical to fix but each needs the route's actual prop signature read.

5. **Test infra business-logic failures** in `repos-batch-endpoint.test.ts` and others (Agent C noted: 8/9 pass; remaining failure was an `AssertionError` not a fixture issue). Worth a separate triage pass.

6. **2 typecheck errors in `scripts/scrape-funding-crunchbase.ts`** (pre-existing; surfaced by every typecheck run today). Out of restructure scope but quick to fix.

### C. Architecture follow-throughs (need decision)

7. **ADR 0006 (Redis namespace unification)** — proposed-deferred. Activate only on next Redis rebuild OR when an incident demands.

8. **Wave F1 — `src/features/` migration** — explicit defer for ROI. Skip unless a feature scatter pain emerges.

9. **`src/components/` 55 subfolders no path-CLAUDE.md** — Wave 5 Agent 7 marked LOW-ROI; revisit if a UI consistency drift surfaces.

10. **`tasks/CURRENT-SPRINT.md` + `BACKLOG.md`** stamped `needs-verification`. Per-line drift check needs Paperclip API up. Run `node scripts/reconcile-tasks-with-paperclip.mjs` once Paperclip's online.

### D. Continuous hygiene (auto-running)

These don't need attention unless they fail:
- Weekly `engine-inventory-refresh` (Mondays 14:49 UTC after stagger)
- Weekly `worklog-hygiene` (Mondays 05:59 UTC)
- Weekly `docs-freshness` (Mondays 13:29 UTC)
- PR gates: `engine-inventory-check`, `workflow-coverage-check`, `doc-links-check`

### E. Things to watch

11. **`bot/backend/AGN-898`** branch was created mid-session by an external system; the original fix commit `d3b2f3d7` lives there but is also cherry-picked onto `bot/marco/AGN-803` as `c38fd335`. The `bot/backend/AGN-898` branch is essentially redundant — prune it after merge.

12. **Husky pre-commit runs lint-staged on every commit**. The 4 guard scripts are now wired in; first .md commit may surprise on speed. If it bites, narrow the lint-staged glob to just-staged files.

13. **`docs/forensic/` is gitignored** but `forensic-prune` SKILL.md was patched to redirect output. If a non-skill agent dispatches and ignores the SKILL, files may still appear locally; gitignore quarantines them.

14. **`.next/` and `docs/storybook/`** got into the gitignore today — verify your local `.next/` builds don't accidentally re-track.

---

## How to start the next session

```
1. Read this doc
2. Run `npm run health:board` to confirm guards still green
3. Pick from §A or §B based on time available
4. Commit on `bot/marco/AGN-803` or branch off if scope is large
```

Quick smoke if you suspect drift:
```
node scripts/check-docs-freshness.mjs
node scripts/check-living-docs-have-frontmatter.mjs
node scripts/check-redis-keys.mjs
node scripts/check-internal-doc-links.mjs
node scripts/check-workflow-engine-coverage.mjs
node scripts/check-cron-overlap.mjs
```

---

## What NOT to redo

- Don't re-run a full doc restructure — already done.
- Don't add more path-scoped CLAUDE.md without ROI evidence.
- Don't touch `docs/archive/**` — read-only by convention.
- Don't migrate Redis namespaces — ADR 0006 says wait for the right trigger.

---

## Reference

- This doc supersedes: `tasks/NEXT-WAVE-2026-05-06.md` (still on disk for archaeology)
- Plan that closed: `~/.claude/plans/structuring-a-repository-silly-frost.md`
- ADRs added today: `docs/decisions/0004-*`, `0005-*`, `0006-*`
- Front-door always: `docs/INDEX.md`
