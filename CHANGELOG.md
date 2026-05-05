---
status: living
last-verified: 2026-05-05
verified-by: bot/sergio/AGN-792
---

# Changelog

All notable changes to trendingrepo.com (formerly StarScreener) are documented in this file.

This changelog is public release notes, separate from git commit history.

## [Unreleased]

### Added
- Placeholder for upcoming release notes.

## [2026-05-05]

### Added
- 5 guard scripts: docs-freshness, frontmatter validity, redis-keys,
  internal doc-links, workflow-engine-coverage.
- 4 CI workflows: engine-inventory-check, workflow-coverage-check,
  doc-links-check, worklog-hygiene.
- 9 path-scoped CLAUDE.md files (root + 8 subdir).
- 3 new ADRs: 0004 (supersedes 0001), 0005 (generated-docs commit
  policy), 0006 (Redis namespace plan).
- src/lib/redis/keys.ts registry + worker counterpart at
  apps/trendingrepo-worker/src/lib/redis-keys.ts.
- BYPASS_PROTECTION env override for the protect-files hook.
- docs/INDEX.md as the canonical doc front door.
- Weekly stale-preview cleanup workflow to reduce stale operational
  artifacts over time.

### Changed
- ENGINE.md / DATABASE.md / SCORING.md fully rewritten from current
  code.
- 17 cron workflows minute-staggered to reduce GitHub Actions
  contention (max collisions per slot 10 -> 8).
- Forensic generator output redirected to
  docs/archive/forensic/<YYYY-MM-DD>/.
- CORS policy documentation clarified, including portal exception
  handling for AGN-733 hardening follow-through.

### Removed
- 4 dead worker fetcher stubs.
- 2 orphan cron routes.

### Fixed
- post-edit hook now reads tool input from stdin (was silently
  no-op'ing).
- 7 nextUrl mock failures in test fixtures.
- 2 Next.js BinaryExpression warnings on `revalidate`.
- 2 typecheck errors (missing repo-category-details exports).
- watchlist/page.tsx JSX syntax (orphan element + bare `>` arrow).

## [2026-05-04]

### Added
- Sentry verification and canary plumbing for runtime observability, including internal canary route coverage.
- Expanded typed `EngineError` hierarchy used by platform/backend paths for clearer recoverable vs fatal handling.
- Freshness checks now include Sentry readiness signals in addition to source freshness status.

### Changed
- Hugging Face navigation simplified to a single sidebar entry with tabbed Models/Datasets/Spaces views.
- Compare page heading semantics and end-to-end checks aligned for accessibility and regression safety.
- Admin key-pool telemetry copy/labels clarified to improve operational readability.

### Fixed
- Workflow automation no longer blocks on Husky during `collect-twitter` auto-commit flow.
- External source/logo rendering and submit-page layout hardening for more resilient UI output.
- Sidebar version text contrast updated to meet WCAG AA expectations.

### Notes
- This release continues active audit-driven stabilization across freshness, route quality, and observability.

## [2026-05-03]

### Added
- Sidebar fresh-count badges to expose source freshness state directly in navigation.
- Twitter fallback layer with Apify/Nitter-path handling and typed engine-error coverage.
- Site-wide theme switcher wiring through sidebar footer controls.

### Fixed
- Compare page star-history flow restored end-to-end.
- Star-activity route now falls back to repo metadata/URL skeleton instead of failing hard.
- Hacker News trending moved to ISR behavior to avoid stale static output.
- Mindshare map visibility fixes for dim-arc rendering on production backgrounds.

### Notes
- This release focused on route-level reliability and UX recovery during Sprint 1 Phase 1.3.
