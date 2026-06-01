# Worker Hardening — 2026-05-27 (Archive)

Permanent reference for the work that shipped during the 2026-05-27 hardening
session. See `~/.claude/plans/handover-2026-05-28-trendingrepo.md` for the
operational handover format; this doc is the architectural record.

## 2026-06-01 addendum - strict production health

The 2026-06-01 root-cause hardening wave moved this from architecture record to
live production contract:

- `npm run health:prod` is the zero-tolerance live gate.
- `/api/worker/health` is expected to show 50 active sources, 50 green, and no
  amber/red/missing/degraded/empty payloads.
- New strict worker-health marker slugs must be seeded by successful real
  fetcher runs. Do not weaken the gate to hide cold Redis.
- `/api/health/sources` must keep process-local cold breakers visible, but cold
  alone is not degraded. Open or half-open breakers still fail health.
- Reddit is intentionally disabled until a credentialed, non-empty producer is
  approved.
- Direct OSSInsight usage is opt-in; GitHub-backed star activity and worker
  Redis payloads are the durable path.

Current operational handoff:
[HANDOVER-2026-06-01-PRODUCTION-HARDENING.md](HANDOVER-2026-06-01-PRODUCTION-HARDENING.md).

## Context — what was broken

Production (TOOLBOX) was healthy in the gross sense (homepage 200, no smoke
failures), but a class of subtle issues had accumulated:

1. **Per-repo enrichment was trending-tier-centric.** Every enricher
   (`repo-metadata`, `repo-profiles`, `consensus-analyst`, `cross-source-sweep`,
   `repo-community-profile`) capped its candidate list at top-N from the
   `trending` slug. The persistent `repo-registry` (942+ repos, retains
   dropped repos) was being WRITTEN but only ONE consumer (`repo-metadata`)
   was registry-aware. The other ~5 enrichers silently ignored the dropped
   tail. Symptom: dropped-repo profiles like `/repo/brendanhogan/hermitclaw`
   rendered "—" for org card cells and "Star history not yet available" on
   the chart.
2. **`recent-repos` slug = 0 in prod.** Cause turned out to be a dead GH
   token (all 10 PATs in the pool expired on the same day). But the
   structural cause was: when all 3 GH search windows threw, `recent-repos`
   unconditionally wrote `items: []` and overwrote the prior good payload.
   Same zero-write hazard class that `docs/INGESTION.md` codifies as the
   "keep last-50, never empty the cache" rule (2026-05-08), but the rule
   was only enforced via `lint:keep-last-50` against the GH Action
   collectors in `scripts/scrape-*.mjs` — worker fetchers were a blind spot.
3. **`docker-compose.trendingrepo.yml` reset to `vps-v1` on every `git
   checkout`.** Tag substitution was operator-memory only. A re-checkout
   left the file pointing at a non-existent tag, breaking the next
   `docker compose up`.
4. **The `RepoStarChart` empty state lied.** "Star history warming … the
   stargazer backfill … still being walked" implied a backfill was running,
   but no backfill existed for registry-only repos. UX trust violation.

## What shipped — 11 commits on `bot/swarm-a6-producthunt-reader`

| Commit | Wave | Scope |
|---|---|---|
| `2eedf0d6d` | W1 | consensus TOP_N 14→30, sweep TOP_N 150→250, RepoStarChart honest copy, RelatedReposCard hide-when-low-signal, compose `:current-prod` alias |
| `987f56ae4` | W2A | recent-repos read→union→cap pattern + zero-write guard + 6 vitests |
| `3185c815d` | W3A | NEW `repo-community-profile` worker fetcher + 6 vitests |
| `8cae7035d` | N1 | sources.json contracts (+3 rows) + shared `mergeAndCap` helper + worker keep-last-50 lint |
| `59705d99e` | N2 | NEW `registry-candidates` helper + `repo-profiles` migrated to it + layout-level registry refresh |
| `a1da903ba` | D1+D2 | `.gitignore` catch-all for local scratch + `probe-slug-coverage.mjs` |
| `1de15d528` | C1 | NEW `star-activity` worker fetcher + 5 vitests |
| `3c91e1da5` | post-rotation | stale-first selection for community-profile + star-activity (asc by lastSeenAt) |
| `7a1a00c5d` | post-rotation | deterministic fullName tiebreaker + bump community max 100→300 |
| `a45811988` | post-rotation | apply tiebreaker to local `pickProfileCandidates` too (was only on helper) |

(Plus `768f2f0d9` from a parallel session: Supabase egress kill-switch —
separate emergency, not part of the hardening run.)

**Total**: 41 new vitests (cache-merge 12, registry-candidates 12, recent-repos 6,
community-profile 7, star-activity 5). Worker suite grew 295 → 337.

## New primitives — `apps/trendingrepo-worker/src/lib/util/`

### `cache-merge.ts`

Encodes the "never empty the cache" rule as a reusable pure function.

```ts
mergeAndCap<T>({
  existing: readonly T[],
  fresh: readonly T[],
  key: (row: T) => string | null,           // case-insensitive recommended
  compare: (a: T, b: T) => number,          // descending — newest first
  max: number,
}): T[]

shouldPreserveCache<T>({
  fresh: readonly T[],
  existing: readonly T[],
}): boolean   // true when fresh empty + existing non-empty

caseInsensitiveKey<T>(field: keyof T): (row: T) => string
```

Used by `recent-repos`. New worker fetchers should import this rather than
re-implement the pattern.

### `registry-candidates.ts`

Encodes candidate-selection from `repo-registry` + trending sources.

```ts
rankedRegistryFullNames(
  registry: RegistryPayloadLite | null,
  limit: number,
  order: 'desc' | 'asc' = 'desc',
): string[]
// 'asc' = oldest/dropped-tail first; 'desc' = most-recently-seen first.
// Sort comparator includes case-insensitive `fullName` tiebreaker —
// CRITICAL because registry hourly tick updates ~700 repos to the SAME
// lastSeenAt timestamp; without the tiebreaker, Array.sort is
// non-deterministic and the same N get picked every run.

unionOrderedFullNames(...lists: ReadonlyArray<readonly string[]>): string[]
// Dedupe across lists (case-insensitive), preserve first-occurrence order.

extractTrendingFullNames(trending): string[]
// Convenience: extract from oss-trending payload's past_24_hours.All bucket.
```

Used by `repo-profiles`. The 3 other enrichers that do this inline
(`repo-metadata`, `cross-source-sweep`, `repo-community-profile`) should be
consolidated onto this helper in a follow-up wave (low priority — they work).

## New worker fetchers (3, all registered in `FETCHERS[]`)

### `repo-community-profile` (schedule `33 * * * *`)

Batches the 6-endpoint GH community-profile fan-out (`/repos/{o}/{n}`,
`/languages`, `/community/profile`, `/readme`, `/stats/participation`,
`/pulls?state=open&per_page=1` + `/orgs/{o}` or `/users/{o}` for owner) for
top-N registry repos selected ASC by lastSeenAt + fullName tiebreaker. Slug
shape `repo-community:{owner}__{name}` with 24h TTL — same as the on-demand
path at `src/lib/repo-community-profile.ts`; both writers cooperate via
last-write-wins per (owner, name).

Env knobs: `COMMUNITY_PROFILE_LIMIT` (default 25, max 300).

### `star-activity` (schedule `17 4 * * *`)

Daily forward-append of one cumulative star-count point per registry repo per
UTC day. Pure helper `appendToday(payload, fullName, currentStars)` exported
for vitest. Mirrors `scripts/append-star-activity.mjs` exactly but seeds from
registry instead of bundled `data/trending.json` — adds registry-tier
coverage that the GH Action daily run misses.

Env knobs: `STAR_ACTIVITY_LIMIT` (default 50, max 200).

### `star-activity-deltas` (schedule `30 5 * * *`) — added 2026-05-29 (the Delta Engine)

GitHub-direct 24h/7d/30d star deltas, computed from the per-repo `star-activity`
daily series and published to a single slug `star-activity-deltas` keyed by
lowercased fullName. This is the **root-cause fix for the recurring "homepage
7d/30d go blank" bug.**

**The bug it kills.** Every 7d/30d delta on the site used to derive from
api.ossinsight.io — directly via the `trending` `past_week`/`past_month`
buckets, or transitively via the snapshot-based `deltas` fetcher. Two
compounding failures meant a single OSS Insight outage blanked 7d/30d sitewide:

1. **OSS Insight is a SPOF** — it 500s on every window for days at a time
   (confirmed 2026-05-29). When it's down, `trending` is empty, so the
   `past_week`/`past_month` buckets vanish.
2. **The `deltas` snapshot ring was too shallow** — `MAX_SNAPSHOTS` was 64
   (≈2.67 days at one snapshot/hour), so the 7d and 30d windows could NEVER
   find an in-buffer historical snapshot. Their basis was permanently
   `cold-start`, which `isRealDelta` (in `src/lib/derived-repos.ts`) gates out
   of DISPLAY → "—". 24h survived only because a ~24h snapshot fits the ring.
   Bumped to 216 (~9 days) on 2026-05-29 so the 7d window resolves to real
   `nearest` when OSS Insight is healthy — but the ring is still
   OSS-Insight-fed (no fresh snapshot is written while `trending` is empty), so
   it is NOT the durable 7d/30d source.

**The durable fix.** `star-activity` is collected straight from the GitHub API
and survives OSS Insight outages. This fetcher diffs `latest.s` against the
point nearest `latest − N days` (24h/7d/30d) with tolerance → basis
`exact`/`nearest`/`cold-start`/`no-history`, mirroring the existing semantics
so the app's display gate is unchanged. Pure helpers `computeWindowDelta` and
`entryFromPayload` are exported for vitest. Zero-write guard via
`shouldPreserveCache` (never overwrites a populated slug with an empty
recompute). Env: `STAR_ACTIVITY_DELTAS_LIMIT` (default 5000).

**The Delta Engine** (`src/lib/derived-repos/delta-engine.ts`, `resolveDelta`).
One resolver, used by BOTH delta-join paths in `derived-repos.ts` (the
trending-aggregate loop and the registry loop) — replacing the divergent
per-loop logic that was the actual bug (the registry path had no GitHub-direct
fallback). Precedence per (repo, window):

| Window | Precedence |
|---|---|
| 24h | OSS Insight bucket → snapshot `deltas` → `star-activity-deltas` → "—" |
| 7d / 30d | **`star-activity-deltas`** → OSS Insight bucket → snapshot `deltas` → "—" |

`value`/`missing` gate the DISPLAY (real bases only — cold-start renders "—");
`rank` feeds `trendScore` and tolerates a cold-start number so Gainer
(`trendScore24h`) and Trend (`trendScore30d`) still order when the display is
"—". App reader: `src/lib/star-activity-deltas.ts`
(`refreshStarActivityDeltasFromStore` + `getStarActivityDeltas`), hydrated in
`src/app/page.tsx` before render.

**Coverage caveat.** 7d/30d show real numbers only for repos with enough
star-activity depth: the trending tier (backfilled via the stargazer walk) has
it today; the registry tail accumulates ~1 point/day via the `star-activity`
fetcher, or is seeded immediately by a one-off run of
`scripts/backfill-star-activity.mjs` over the top registry fullNames. Until a
repo has depth, its 7d/30d honestly show "—" rather than a fabricated number.

### `repo-registry` (schedule `47 * * * *`) — shipped earlier (eba6fe7) but landed in this hardening run

Persistent accumulating repo collection. Reads `trending` (authoritative
stats), then fill-only from `repo-metadata` / `consensus-trending` /
`recent-repos`. Cap 2000 LRU by `lastSeenAt`. Never deletes an unseen entry
except under cap pressure.

## New CI lint: `scripts/check-worker-keep-last-50.mjs`

Wired into `npm run lint:guards`. Extends the existing
`scripts/check-collector-keep-last-50.mjs` (which only covered
`scripts/scrape-*.mjs`) to `apps/trendingrepo-worker/src/fetchers/**`. A
fetcher passes if it:

1. Imports the shared `cache-merge.js` helper, OR
2. Has a `readDataStore()` call (legacy hand-rolled merge), OR
3. Is on the documented `ALLOW` list with a reason.

41 worker fetchers checked at write time:
- 1 uses the helper (`recent-repos`)
- 18 hand-rolled (read+write, no shared import)
- 18 overwrite-only — all allow-listed (11 documented snapshots,
  11 marked `AUDIT-PENDING-2026-05-27` for migration)

The `AUDIT-PENDING` entries are visible debt: `bluesky`, `hackernews`,
`devto`, `lobsters`, `twitter`, `oss-trending`, `collection-rankings`,
`consensus-trending`, `repo-metadata`, `repo-profiles`. Highest priority for
the next migration wave: the per-source mention collectors
(`bluesky/hackernews/devto/lobsters`) — same zero-write hazard class as
recent-repos was.

## App-side honest UX (Wave 1)

- `src/components/repo/RepoStarChart.tsx` lines 717-731 — empty state no
  longer claims a "warming backfill"; reads "Star history not yet available
  for {repo.fullName}. We don't have a sampled star timeline yet. The
  chart populates once the daily snapshot pass collects its first data
  points for this repo."
- `src/components/repo/RelatedReposCard.tsx` — wraps the empty-state return
  in a guard that returns `null` when `items.length === 0` AND
  `repo.mentions.{total + total7d + total24h} < 5`.
- `src/app/layout.tsx` — `await refreshRepoRegistryFromStore().catch(() => undefined)`
  at the root layout so Statusbar count is consistent across all routes
  (partial win — see "Open backlog" in handover).
- `docker-compose.trendingrepo.yml:12` — pinned to
  `image: trendingrepo-app:current-prod` (moving alias retagged on every
  successful build via the deploy script).

## Post-rotation fixes (3 commits after the GH token issue surfaced)

When the operator rotated 16 + 4 = 20 fresh GH PATs (the prior 10 had all
expired on 2026-05-26), the fetchers started running but covered the WRONG
set:

1. **`3c91e1da5` — stale-first selection.** Was sorting `lastSeenAt desc` (most
   recently trending first). Those repos are ALREADY enriched by the
   on-demand POST path. The worker's job is the dropped tail. Changed
   default to `'asc'` for community-profile + star-activity.

2. **`7a1a00c5d` — deterministic tiebreaker on the helper.** Registry's hourly
   tick updates ~700 repos to the SAME `lastSeenAt` timestamp. Without a
   secondary key, `Array.sort` is non-deterministic and the same N kept
   getting picked. Added case-insensitive `fullName` tiebreaker. Bumped
   `COMMUNITY_PROFILE_LIMIT` max from 100 to 300 so each tick covers ~1/3
   of the registry.

3. **`a45811988` — local-picker tiebreaker.** `repo-community-profile/index.ts`
   has its OWN `pickProfileCandidates` (predates the shared helper). The
   tiebreaker fix had to be applied there TOO. Lesson: when consolidating
   duplicated logic, search the whole worker for parallel implementations
   FIRST.

After these 3 fixes, `brendanhogan/hermitclaw` (a dropped repo) was verified
populated end-to-end: `location: "New York, NY"`, `publicRepos: 35`,
`bio: "AI/ML Research @ Morgan Stanley · PhD Cornell University"`,
`star-activity: 326 stars`.

## Open backlog (deferred to follow-up waves)

See §9 of `~/.claude/plans/handover-2026-05-28-trendingrepo.md` for the
prioritized list. Highest-impact items:

1. Migrate `bluesky/hackernews/devto/lobsters` per-source mention
   collectors to `mergeAndCap` (zero-write hazard fix for the highest-volume
   writers).
2. Fix layout-level full refresh so /pricing shows registry-inclusive count
   (currently homepage 985, /pricing 831).
3. `repo-community-profile` "force coverage" mode — currently same 300 get
   picked every run until registry timestamps shift; should track which
   slugs got written recently and prioritize stale-or-missing.

## Lessons captured to memory

See `C:\Users\mirko\.claude\projects\c--dev-trendingrepo\memory\`:
- `project_2026-05-27_hardening_complete.md` — session summary
- `reference_worker_helpers.md` — cache-merge + registry-candidates patterns
- `feedback_deterministic_sort_tiebreaker.md` — registry tick = same timestamp lesson
- `feedback_two_picker_pattern_bug.md` — local picker vs helper bug class
- `reference_gh_token_pool_rotation.md` — operator workflow

— Archived 2026-05-27 by Claude Opus 4.7 (1M context)
