# Changelog

All notable changes to trendingrepo.com (formerly StarScreener) are documented in this file.

This changelog is public release notes, separate from git commit history.

## [Unreleased]

### Added
- Placeholder for upcoming release notes.

## [2026-05-05]

### Added
- Weekly stale-preview cleanup workflow to reduce stale operational artifacts over time.

### Changed
- CORS policy documentation clarified, including portal exception handling for AGN-733 hardening follow-through.

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
