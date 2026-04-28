# Codex Review Log

This is the running log for the BenedictKing `codex-review` workflow defined in `CODEX_REVIEW_SYSTEM.md`.

## 2026-04-27 - System Start

- Branch: `feat/trendingrepo-worker-scaffold`
- Tool available: `codex review`
- Existing review baseline: `docs/review/REVIEW_REPORT.md`, `docs/review/PATCH_PLAN.md`, `docs/review/HARDENING_90D.md`
- Current uncommitted tracked diff moved during setup; final focused review covered:
  - `package.json`
  - `package-lock.json`
  - `src/components/signal/SourceMonogram.tsx`
  - `src/lib/news/freshness.ts`
  - untracked review docs
  - untracked pipeline fixture
- Current untracked project files:
  - `src/lib/pipeline/__tests__/fixtures/pipeline-repo-fixtures.ts`
  - `docs/review/CODEX_REVIEW_SYSTEM.md`
  - `docs/review/CODEX_REVIEW_LOG.md`
- Current untracked local/vendor directory:
  - `awesome-codex-skills/`

Decision: start with the review system and log before running a broad pass. The untracked `awesome-codex-skills/` directory should be excluded from STARSCREENER code review unless Mirko explicitly wants it treated as product code.

## 2026-04-27 - Step 1 Current Diff Review

Validation:

- `npm run typecheck` passed.
- `npm run lint` passed with warnings only.
- `npm test` passed: 964/964.
- `npm run build` passed with warnings only.
- Targeted recheck after fixes passed: `npx tsx --test src/lib/pipeline/__tests__/data-dir-validation.test.ts src/lib/pipeline/__tests__/compare-endpoint.test.ts src/lib/pipeline/__tests__/canonical-profile-endpoint.test.ts src/lib/pipeline/__tests__/mentions-endpoint.test.ts src/lib/pipeline/__tests__/derived-repos-coverage.test.ts src/lib/pipeline/__tests__/session.test.ts` -> 60/60.
- Late deploy-diff recheck passed: `npm run typecheck`, `npm run build`, route trace check for `.claude` / `.vercel` / `awesome-codex-skills` / `docs/review` in `.next/server/app/api/health/route.js.nft.json`.

Codex review findings fixed:

### CR-20260427-001 - P2 - Fixture path must match runtime data-dir config

- Status: fixed
- Area: pipeline tests
- Files: `src/lib/pipeline/__tests__/fixtures/pipeline-repo-fixtures.ts`
- Impact: fixture rows could be written to a different `repos.jsonl` than runtime reads when `STARSCREENER_DATA_DIR` is set.
- Fix: changed fixture pathing to use the canonical file name and later isolated writes to a temp-only data directory.
- Verification: targeted tests passed and final `codex review` reported no remaining P0/P1/P2 issues.

### CR-20260427-002 - P2 - Data-dir rejection test could pass on wrong error

- Status: fixed
- Area: pipeline tests
- Files: `src/lib/pipeline/__tests__/data-dir-validation.test.ts`
- Impact: broad catch could turn an `assert.throws` failure into a passing regex check.
- Fix: capture import-time or call-time error separately, then assert an error was thrown and matches the expected path traversal message.
- Verification: targeted tests passed and final `codex review` reported no remaining P0/P1/P2 issues.

### CR-20260427-003 - P2 - Fixture writes must not pollute runtime data

- Status: fixed
- Area: pipeline tests
- Files: `src/lib/pipeline/__tests__/fixtures/pipeline-repo-fixtures.ts`
- Impact: fixture setup could append rows to a real/shared `STARSCREENER_DATA_DIR`.
- Fix: fixture now creates a temp directory with `mkdtempSync`, assigns `STARSCREENER_DATA_DIR` to it, and writes only there.
- Verification: targeted tests passed and final `codex review` reported no remaining P0/P1/P2 issues.

### CR-20260427-004 - P1 - Output trace excludes must apply to nested routes

- Status: fixed
- Area: deploy packaging
- Files: `next.config.ts`
- Impact: `outputFileTracingExcludes` keyed by `"/*"` only applied to one-segment routes, leaving nested server routes able to trace local/sensitive directories.
- Fix: changed the exclude key to `"/**"` so the exclude list applies globally.
- Verification: `npm run typecheck` passed, `npm run build` passed, `picomatch('/**')` matches nested routes, and the rebuilt `/api/health` trace had no excluded-path matches. Final deploy-diff `codex review` reported no remaining P0/P1/P2 issues.

Final current-diff review result: `codex review` found no remaining P0/P1/P2 correctness, security, data-integrity, deploy, data-leak, or regression-test gaps in the provided changed files.

## Queue

| Step | Area | Status | Notes |
| --- | --- | --- | --- |
| 0 | Review system setup | done | Added `CODEX_REVIEW_SYSTEM.md` and this log. |
| 1 | Current diff review | done | Validation passed; final focused Codex review found no remaining P0/P1/P2 issues. |
| 2 | HTTP/API boundary | pending | First whole-codebase feature pass. |
| 3 | Pipeline and data store | pending | Compare against Phase 2 findings. |
| 4 | Source ingestion scripts | pending | Include freshness and parser drift. |
| 5 | Worker runtime | pending | Include new registries and arXiv changes. |
| 6 | User-facing app | pending | Include source monograms, freshness, compare/detail flows. |
| 7 | Admin, auth, billing | pending | Include session and Stripe webhook surfaces. |
| 8 | MCP and agent surface | pending | Include portal and tools. |
| 9 | CI, deploy, ops | pending | Confirm GitHub Actions and runtime docs match current app. |
