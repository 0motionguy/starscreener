# AGN-1278 Repo Profile Completeness UI Gap Pass (2026-05-05)

## Scope and evidence target
- Route audited: `https://trendingrepo.com/repo/ruvnet/ruflo`
- Objective: identify top 10 missing/placeholder states on repo profile surface, map each to source key, attach screenshot/path evidence, propose minimal patch issues only.

## Mandatory preflight
- Session opening protocol completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- `npm run freshness:check` result: localhost is reachable (not missing) but stale/degraded (`GET /api/cron/freshness/state -> HTTP 500`).

## Screenshot and artifact bundle
- Desktop full page: `docs/forensic/artifacts/agn-1278/repo-ruvnet-ruflo-full-desktop.png`
- Mobile full page: `docs/forensic/artifacts/agn-1278/repo-ruvnet-ruflo-mobile-full.png`
- Gap crops:
  - `gap-01-package-adoption-missing.png`
  - `gap-02-forks-delta-missing.png`
  - `gap-03-contrib-delta-missing.png`
  - `gap-04-docs-pending.png`
  - `gap-05-npm-none.png`
  - `gap-06-producthunt-none.png`
  - `gap-07-paper-model-pending.png`
  - `gap-08-website-queued.png`
  - `gap-09-crosssignal-low.png`
  - `gap-10-watchlist-empty.png`
- Module presence probe: `docs/forensic/artifacts/agn-1278/module-presence.json`
- Scan snippets: `docs/forensic/artifacts/agn-1278/repo-ruvnet-ruflo-scan.json`

## Top 10 missing/placeholder states with source-key mapping
1. `// 04 · PACKAGE ADOPTION - no linked package yet`
- Evidence: `gap-01-package-adoption-missing.png`
- Source key(s): `npm-packages`, `npm-downloads` (via canonical profile `npm.packages`)
- Likely owner lane: Data pipeline + frontend empty-state copy.

2. Forks card delta shows placeholder (`— / 7d`)
- Evidence: `gap-02-forks-delta-missing.png`
- Source key(s): derived repo deltas (`trending`/`deltas` fan-out), repo metadata enrichment for fork deltas.
- Likely owner lane: Data pipeline delta derivation + frontend missing-state treatment.

3. Contributors card delta shows placeholder (`— / 30d`)
- Evidence: `gap-03-contrib-delta-missing.png`
- Source key(s): contributor history enrichment (`repo-metadata`/profile enrichment path feeding `contributorsDelta30d`).
- Likely owner lane: Data pipeline enrichment + frontend fallback semantics.

4. Docs surface unresolved (`docs scanner pending`)
- Evidence: `gap-04-docs-pending.png`
- Source key(s): `repo-profiles` enrichment output used by profile surface map.
- Likely owner lane: Data quality/enrichment worker.

5. NPM linkage unresolved (`npm none / no linked npm package`)
- Evidence: `gap-05-npm-none.png`
- Source key(s): `npm-packages` + repo-to-package linker in canonical profile build.
- Likely owner lane: Data linker quality.

6. ProductHunt linkage unresolved (`no launch linked`)
- Evidence: `gap-06-producthunt-none.png`
- Source key(s): `producthunt-launches` + repo matcher.
- Likely owner lane: ProductHunt matching logic.

7. HF/arXiv cross-domain linkage unresolved (`HF/arXiv resolver not attached`)
- Evidence: `gap-07-paper-model-pending.png`
- Source key(s): `huggingface-trending`, `arxiv-recent`, linked model/paper resolver feeding `linkedHfModels`/`linkedArxivIds`.
- Likely owner lane: Cross-domain resolver pipeline.

8. Website profile still queued (`site found; profile scan queued`)
- Evidence: `gap-08-website-queued.png`
- Source key(s): `repo-profiles` enrichment queue/state.
- Likely owner lane: Repo profile enrichment cadence/throughput.

9. Cross-signal rubric shows lowest-band fallback text (`low or no cross-channel activity`) while card context is active, creating interpretation ambiguity.
- Evidence: `gap-09-crosssignal-low.png`
- Source key(s): cross-signal scoring output from derived repo / mention fan-out.
- Likely owner lane: Frontend copy logic aligned to score bands.

10. Sidebar watching state always empty on audited session (`No watched repos`) while repo profile has no in-panel completeness marker for this user-state absence.
- Evidence: `gap-10-watchlist-empty.png`
- Source key(s): client watchlist store (local state), no server key.
- Likely owner lane: Frontend UX clarity (out-of-data-path state).

## Additional route-surface absence checks
- `TWITTER SIGNAL` panel count = 0 on this repo route (`module-presence.json`).
- `RELATED IDEAS` panel count = 0 on this repo route (`module-presence.json`).
- These are not necessarily defects for one repo, but they are completeness blind spots without explicit "no-data" panels.

## Proposed minimal patch issues (no implementation in this heartbeat)
1. `[Frontend] Repo profile: standardize explicit no-data cards for missing modules (Twitter, Related Ideas, NPM Adoption).`
2. `[Data Pipeline] Repo profile linker: backfill repo?npm and repo?producthunt links for top-N repos.`
3. `[Data Pipeline] Repo profile enricher: resolve docs/profile scan queue staleness and expose queue age.`
4. `[Data Pipeline] Contributor/Fork delta completeness: eliminate placeholder deltas for top routed repos.`
5. `[Frontend] Cross-signal rubric copy: align displayed explanatory band text with current score range.`

## Outcome
- AGN-1278 acceptance artifacts are now present: top-10 gaps, source mapping, screenshot paths, and minimal patch issue proposals.
