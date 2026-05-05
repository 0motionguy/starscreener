---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# Architecture Decision Records

Numbered MADR-style decision records. Newest = current truth. Read in order
when onboarding to understand the architecture's evolution.

## Index

- [0001 — Supabase append-only data lake](0001-supabase-append-only-data-lake.md) — deferred + superseded by 0004
- [0002 — Multi-tier cache architecture](0002-multi-tier-cache-architecture.md)
- [0003 — Cache tiers](0003-cache-tiers.md)
- [0004 — Redis primary + worker-only Supabase analytics](0004-redis-primary-worker-only-supabase.md) — supersedes 0001
- [0005 — docs/_generated/ commit policy](0005-generated-docs-commit-policy.md)
- [0006 — Redis namespace unification (deferred plan)](0006-redis-namespace-unification.md) — proposed

## Conventions

- Status: `proposed` / `accepted` / `superseded`
- Filename: `NNNN-short-kebab-title.md`
- When superseding a prior ADR, update its status block + add a `## Superseded by`
  link, but never edit its body.
