---
description: "Task list for v6 production cutover for trendingrepo.com"
---

# Tasks: v6 Production Cutover

**Input**: Design documents from `/specs/001-v6-prod-cutover/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: No new tests are introduced by this cutover (per K2 / spec scope). The existing
suite MUST pass at ≥ 1335 / 1337 (per FR-011). Test-restoration work is foundational, not
per-story.

---

## Status as of 2026-05-21

Operator shipped most of the plan in parallel. Reconciliation pass:

### ✅ Shipped already (operator commits)

- **Phase 2 foundational** (T004–T009) — commit `c931a41db` restored HeaderAccount + 5 v4-teardown layout components. Test suite at **1343 / 1343** (above gate).
- **Phase 3 US1 moved tools** (T011–T014) — commit `4ecca4315` added `/top10`, `/tierlist`, `/compare`, `/digest` to `next.config.ts` redirects.
- **Phase 5 US3 renamed routes** (T019–T021) — same commit added `/breakouts → /breakout`, `/signals → /market-signals`.
- **Phase 6 US4 most legacy URLs** (T028–T033) — same commit categorized T1/T2/T3/T4/T5 blocks with 30+ legacy URL redirects.
- **Phase 7 US5 smoke probe partial** (T041) — commit `5379ebd74` extended `.github/workflows/post-deploy-smoke.yml` to cover the 8 `/tools/*` routes (uses canonical perf/routes.json approach, not the `targets.json` design we drafted).
- **Phase 9 Ideas degraded mode INVERTED** (T051–T055) — commit `270657735` shipped 4 real POST endpoints + schema fields + UI. The "Coming Soon" toast is no longer the strategy; the writes are built.

### ✅ Shipped this session

- **T002** sitemap snapshot at `specs/001-v6-prod-cutover/legacy-sitemap.txt` (89 URLs from `sitemap-pages.xml`).
- **T045** Lighthouse baseline assertion at `scripts/verify/assert-lighthouse-baseline.mjs`.
- **T047** pre-cutover verify gate workflow at `.github/workflows/pre-cutover-verify.yml` (Lighthouse + smoke + CSP audit + Clerk audit + `cutover-verify` status emit).
- **T049** PR template extended with the V6 Cutover Gate checklist (`.github/pull_request_template.md`).
- **T050a** CSP audit at `scripts/verify/csp-audit.mjs` (FR-013). Smoke-tested against live prod — script works; live prod has NO CSP headers, so cutover build's CSP behavior is what matters.
- **T050b** Clerk publishable-routes audit at `scripts/verify/clerk-routes-audit.mjs` (FR-014 first sentence). Snapshot captured at `.perf/clerk-pre-cutover-public-routes.json` — 5 protected patterns. Compare mode passes.
- **CURRENT-SPRINT.md** has a v6-cutover front-matter pointer to spec + rollback + verify gate.

### ⚠️ Divergences from spec (open decisions)

- **D1** FR-006 says preserve `/pricing` + `/contact` as v6 pages. Live `next.config.ts` 308s `/contact → /`. `/pricing` is missing entirely from the redirect map.
- **D2** Spec/plan say all redirects 308. Live uses `permanent: false` (302) for `/categories/*` and `/collections/*`.

### ❌ Still pending (operator action required)

- **T003** Confirm HOSTUP env vars (operator only — no secret echoing per constitution).
- **T010** Confirm or provision standby HOSTUP origin (operator only).
- **T017** Rehearse rollback procedure against standby; record wall-clock. Block cutover if > 5 min.
- **T048** Add `PAGESPEED_API_KEY` to GitHub Actions secrets.
- **Lighthouse baseline** — commit `.perf/lighthouse-mobile-prod.json` against current live prod before cutover.
- **Phase 10 cutover execution** (T056–T068) — operator runs the quickstart runbook.

---

**Organization**: Tasks are grouped by user story so each can be implemented and verified
independently. P1 stories (US1, US2) form the MVP cutover. P2 stories (US3, US4) ship in
the same cutover but can be developed independently after US1/US2 land. P3 stories (US5,
US6) gate the cutover but are independently buildable.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps to user stories from spec.md (US1–US6)
- Every task names exact files. Constitution K3 (surgical) requires it.

## Path Conventions

Single Next.js project. All paths relative to `c:\dev\trendingrepo\`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: This is a brownfield cutover — the Next.js + Tailwind + Redis + Clerk stack
is already in place. Phase 1 has no project-init work. Tasks below are setup-style only.

- [ ] T001 Confirm branch `001-v6-prod-cutover` is current (`git branch --show-current`) and operator WIP has been triaged into either commits or `git stash` named `wip-v6-pre-cutover` (per constitution: no `git stash -u`)
- [ ] T002 [P] Snapshot the legacy sitemap to `specs/001-v6-prod-cutover/legacy-sitemap.txt` per quickstart Step 0.1: `curl -s https://trendingrepo.com/sitemap.xml | grep -oP '(?<=<loc>)[^<]+' > specs/001-v6-prod-cutover/legacy-sitemap.txt`. Verify count ≈ 95 URLs.
- [ ] T003 [P] Verify HOSTUP env vars are set per quickstart Step 0.3 (CLERK_*, REDIS_* OR UPSTASH_*, DATABASE_URL, DIRECT_URL, CRON_SECRET, GITHUB_TOKEN). Operator-action only — do NOT echo secrets.

**Checkpoint**: Branch hygiene, sitemap snapshot, env-var audit complete. Foundation begins.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: These tasks block every user story. Restore the missing HeaderAccount
components so the test suite reaches ≥ 1335 / 1337 (FR-011 gate). Provision the standby
HOSTUP origin so US2 has something to roll back to.

**⚠️ CRITICAL**: No user story work ships until this phase is complete.

- [ ] T004 Locate the prior HeaderAccount components in git history: `git log --all --diff-filter=D --name-only -- '**/HeaderAccount*' | head -50`. Identify the SHA(s) where the components were removed (per S6041, this was the v4 teardown).
- [ ] T005 Restore `src/components/layout/HeaderAccount.tsx` from the SHA identified in T004. If the prior implementation no longer fits the v6 layout, recreate it as a thin server component that reads Clerk auth state and renders either an Account link (signed in) or Sign In CTA (signed out). Match existing v6 component style — no new abstractions (K2).
- [ ] T006 Restore `src/components/layout/HeaderAccountLoaded.tsx` from the same SHA. This is the client-island variant used while Clerk's auth state is loading.
- [ ] T007 Wire HeaderAccount into the existing v6 header layout. Grep `Header.tsx` to find the slot where the v4 HeaderAccount was previously rendered: `grep -rn 'HeaderAccount\|account.*menu\|sign.*in' src/components/layout/Header.tsx src/app/layout.tsx`.
- [ ] T008 Run `npm test -- --reporter=verbose src/lib/__tests__/auth-provider-policy.test.ts` and confirm the 6 previously-failing tests now pass. If any still fail, root-cause before continuing (DO NOT mark T008 complete on a partial pass — constitution K4).
- [ ] T009 Run full `npm test` and confirm overall pass rate ≥ 1335 / 1337. Record the exact pass/fail count in tasks/CURRENT-SPRINT.md.
- [ ] T010 Confirm standby HOSTUP origin exists and is healthy per quickstart Step 0.4. If missing: provision a clone of the current prod HOSTUP service. Verify with `curl -sI https://${STANDBY_ORIGIN_HOST}/` (expect HTTP/2 200, `Server: cloudflare`).

**Checkpoint**: Test suite green, HeaderAccount restored, standby origin healthy. User stories can begin.

---

## Phase 3: User Story 1 — Moved Tool URL Redirects (Priority: P1) 🎯 MVP

**Goal**: Visitors arriving at `/top10`, `/tierlist`, `/compare`, `/digest` are
308-redirected to their v6 equivalents under `/tools/*`.

**Independent Test**: `curl -sIL https://${DEPLOY_URL}/top10` returns 308 → 200 chain
terminating at `/tools/top-10`. Repeat for the other 3.

### Implementation for User Story 1

- [ ] T011 [US1] Add the 4 Category-A entries from [contracts/redirect-map.md](./contracts/redirect-map.md) to the `redirects()` function in `next.config.ts`. Use `permanent: true` for each (Next 15 defaults to 308). Group them under a `// Category A — Moved (4)` comment matching the contract.
- [ ] T012 [US1] Run `npm run typecheck` to confirm `next.config.ts` still type-checks after the edits.
- [ ] T013 [US1] Run `npm run build` and confirm Next.js logs the 4 redirects under "Compiled successfully" / "Generating static pages" (rough format depends on Next version; look for redirect map in build summary).
- [ ] T014 [US1] Locally test each redirect: start `npm run dev` on port 3023, then `curl -sI http://localhost:3023/top10` → expect 308 + `Location: /tools/top-10`. Repeat for `/tierlist`, `/compare`, `/digest`.

**Checkpoint**: 4 moved-tool redirects work locally. US1 deliverable complete.

---

## Phase 4: User Story 2 — Operator Rollback Runbook (Priority: P1) 🎯 MVP

**Goal**: Operator can roll back from cutover to pre-cutover live state in ≤5 min via a
documented one-command runbook. Standby origin is provisioned and rehearsed.

**Independent Test**: In a non-prod environment, perform a cutover, then execute the
rollback runbook against a stopwatch. Confirm restoration in <5 min and verify the
rolled-back state matches pre-cutover.

### Implementation for User Story 2

- [ ] T015 [US2] Append the "V6 Cutover Rollback" section to `tasks/CURRENT-SPRINT.md`. Copy the 4-step rollback procedure from `specs/001-v6-prod-cutover/quickstart.md` § Phase 2, with the exact HOSTUP commands inlined (replace placeholders with operator-confirmed values from T003).
- [ ] T016 [US2] Document the standby-origin retention policy in the same section: "Standby origin retained for ≥72h post-cutover; garbage-collected only after Day +3 stabilization checks (quickstart Phase 3 Day +3)."
- [ ] T017 [US2] Rehearse the rollback procedure against the standby origin: flip DNS to standby, verify `curl -sI https://${STANDBY_ORIGIN_HOST}/` returns 200, flip back. Record the wall-clock time. If > 5 min, redesign before cutover (K4 — do not claim done if budget violated).
- [ ] T018 [US2] Add a one-line "rollback rehearsed: YYYY-MM-DD <wall-clock-seconds>s" entry to `tasks/CURRENT-SPRINT.md` under the cutover task.

**Checkpoint**: Rollback runbook documented and timed. US2 deliverable complete.

---

## Phase 5: User Story 3 — Renamed Route Redirects (Priority: P2)

**Goal**: `/breakouts` 308-redirects to `/breakout`; `/signals` 308-redirects to `/market-signals`.

**Independent Test**: `curl -sIL https://${DEPLOY_URL}/breakouts` → 308 → 200 at `/breakout`. Same for `/signals`.

### Implementation for User Story 3

- [ ] T019 [US3] Add the 2 Category-B entries from [contracts/redirect-map.md](./contracts/redirect-map.md) to `next.config.ts` `redirects()`. Group under `// Category B — Renamed (2)` comment.
- [ ] T020 [US3] Confirm `/breakout` and `/market-signals` v6 pages exist and return 200 locally before relying on them as redirect targets: `curl -sI http://localhost:3023/breakout`; `curl -sI http://localhost:3023/market-signals`.
- [ ] T021 [US3] Verify each redirect locally: `curl -sI http://localhost:3023/breakouts` and `/signals`. Expect 308 + correct `Location`.

**Checkpoint**: 2 renamed redirects work locally. US3 deliverable complete.

---

## Phase 6: User Story 4 — Legacy URL Graceful Handling (Priority: P2)

**Goal**: 85+ legacy URLs (22 aggregator + 63 collection + 6 marketing) return 200
(preserved) or 308 (redirected) — never 404 / 5xx. Includes preserving `/pricing` and
`/contact` as real v6 pages.

**Independent Test**: Probe every URL in `specs/001-v6-prod-cutover/legacy-sitemap.txt`
(T002 output). Confirm zero 404s, zero 5xx, every terminus is 200.

### Implementation for User Story 4

#### Marketing preservation (FR-006 Q1 → preserve /pricing + /contact)

- [ ] T022 [P] [US4] One-time scrape live `https://trendingrepo.com/pricing` via WebFetch (or `curl -s | pandoc` to markdown). Capture HTML structure, copy text, OG meta, canonical URL. Store extracted content as a working note at `specs/001-v6-prod-cutover/legacy-pricing-content.md`.
- [ ] T023 [P] [US4] One-time scrape live `https://trendingrepo.com/contact` analogous to T022 → `specs/001-v6-prod-cutover/legacy-contact-content.md`.
- [ ] T024 [US4] Create new App Router route group `src/app/(marketing)/`. This is a route group — no URL prefix added (Next.js route-group convention).
- [ ] T025 [US4] Implement `src/app/(marketing)/pricing/page.tsx` as a server component porting copy from T022 into v6 Tailwind 4 design tokens. Reuse existing v6 layout primitives (no new components). Include canonical `<link rel="canonical">` matching legacy URL.
- [ ] T026 [US4] Implement `src/app/(marketing)/contact/page.tsx` analogous to T025 using T023 content. If the legacy `/contact` had a form POST, ship the form as a static `mailto:` link for cutover and add a follow-up task (Phase 9) to wire a real handler.
- [ ] T027 [US4] Run `npm run lighthouse:routes:prod` against the local `/pricing` and `/contact` to confirm they are not catastrophic (mobile ≥ 80). Not part of the cutover gate — sanity check.

#### Marketing 308s (the other 4 routes)

- [ ] T028 [US4] Enumerate the 4 remaining marketing/utility URLs from the sitemap snapshot (T002 output) that are NOT in the preserved set (`/pricing`, `/contact`). Add the 4 Category-C entries to `next.config.ts` `redirects()` per [contracts/redirect-map.md](./contracts/redirect-map.md). Group under `// Category C — Marketing 308 (4)` comment. Target: `/`.

#### Aggregator 308s (22 routes)

- [ ] T029 [US4] Enumerate the 22 aggregator URLs from the sitemap snapshot (filter `/githubrepo`, `/arxiv`, `/hackernews`, `/producthunt`, etc.). Confirm count = 22; if mismatch, audit before proceeding (K4).
- [ ] T030 [US4] For each of the 22 aggregator URLs, decide the target_path per the Category-E defaulting rule in [contracts/redirect-map.md](./contracts/redirect-map.md): default to `/`, upgrade where a clear v6 semantic match exists. Record decisions inline as `// /<source> → /<target> reason: <one-liner>` comments.
- [ ] T031 [US4] Add the 22 Category-E entries to `next.config.ts` `redirects()` per the decisions in T030. Group under `// Category E — Aggregator (22)` comment.

#### Collection wildcards (63 routes via ~5-8 patterns)

- [ ] T032 [US4] Inspect the 63 collection/category URLs in the sitemap snapshot to identify the ≤8 wildcard patterns that cover all of them (e.g., `/category/:slug*`, `/topic/:slug*`). Record the patterns + their default targets.
- [ ] T033 [US4] Add the wildcard Category-F entries to `next.config.ts` `redirects()` per [contracts/redirect-map.md](./contracts/redirect-map.md). Verify each pattern includes `:slug*` (catch-all, not just `:slug`).

#### Verification

- [ ] T034 [US4] Local full-sitemap probe script: write a one-shot `scripts/smoke/probe-legacy-all.mjs` that reads `specs/001-v6-prod-cutover/legacy-sitemap.txt` and probes each against `http://localhost:3023`. Assert zero 404 / 5xx; report per-URL final-status. Constitution K3: this script lives under `scripts/smoke/` matching the contract; no new top-level dirs.
- [ ] T035 [US4] Run T034 against the local cutover build. Fix every 404 / 5xx by adding/updating the redirect rule. Re-run until all 91 legacy URLs terminate at 200.

**Checkpoint**: Every legacy URL returns 200 or 308 → 200 locally. US4 deliverable complete.

---

## Phase 7: User Story 5 — Post-Deploy Smoke Probe (Priority: P3)

**Goal**: CI smoke probe workflow validates 24 v6 routes + 6 moved/renamed redirects +
10 sampled legacy redirects per run, in ≤3 min wall-clock, failing the deploy on any
unexpected status.

**Independent Test**: Trigger smoke workflow against a deliberately broken deploy (one
route returning 500). Confirm workflow fails and surfaces the failing URL.

### Implementation for User Story 5

- [ ] T036 [P] [US5] Create `scripts/smoke/targets.json` containing the canonical probe target inventory per [contracts/smoke-probe.md](./contracts/smoke-probe.md): 24 v6 routes + 6 moved/renamed + 91 legacy entries (the legacy pool from which 10 are sampled per run). Each entry: `{url, expected_status, expected_location_header?, expected_final_url, timeout_seconds, retry_on_503, max_chain_hops}`.
- [ ] T037 [P] [US5] Create `scripts/smoke/probe-v6-routes.mjs` per the contract. Consumes `targets.json` filtered to v6 routes. Asserts HTTP 200 with `retry_on_503` semantics.
- [ ] T038 [P] [US5] Create `scripts/smoke/probe-moved-renamed.mjs`. Filtered to category=moved+renamed. Asserts 308 + exact `Location` header match + final URL match after follow.
- [ ] T039 [P] [US5] Create `scripts/smoke/probe-legacy-sampled.mjs`. SHA-256 hash of `(DATE, url)` → take 10 lowest-hashing legacy entries. Assert each terminates at 200 or 308→200 within 2 hops.
- [ ] T040 [P] [US5] Create `scripts/smoke/summary.mjs` that emits a workflow-step summary of pass/fail counts per category.
- [ ] T041 [US5] Modify `.github/workflows/post-deploy-smoke.yml` to add three new probe steps per [contracts/smoke-probe.md](./contracts/smoke-probe.md) § "Workflow Integration". DO NOT delete the existing 30-route coverage from PR #1329 — the new scripts AUGMENT it, since the new scripts' targets.json represents the source of truth going forward; verify there is no duplication.
- [ ] T042 [US5] Set `timeout-minutes: 5` on the smoke job (workflow-level guard for the 3-min wall-clock budget per FR-016).
- [ ] T043 [US5] Test the smoke workflow against a healthy deploy URL: `gh workflow run post-deploy-smoke.yml`. Confirm all probes green in ≤3 min.
- [ ] T044 [US5] Negative-test: deliberately break one redirect in `next.config.ts` (e.g., `/top10` → `/wrong`), push, re-run smoke. Confirm workflow fails with the failing URL named in the summary. Revert the deliberate break.

**Checkpoint**: Smoke probe workflow live, tested on green + red paths. US5 deliverable complete.

---

## Phase 8: User Story 6 — Pre-Cutover Verify Gate (Priority: P3)

**Goal**: New GitHub Actions workflow `pre-cutover-verify.yml` runs Lighthouse mobile
against 14 core routes + extended smoke probe + emits `cutover-verify` status check. Per
FR-016, no DNS swap without this gate green.

**Independent Test**: Run the gate against the cutover candidate deploy URL. Status check
goes green. Deliberately regress Lighthouse on one route by 10 points; re-run; status
check goes red.

### Implementation for User Story 6

- [ ] T045 [P] [US6] Create `scripts/verify/assert-lighthouse-baseline.mjs` per [contracts/verify-gate.md](./contracts/verify-gate.md) § "assert-lighthouse-baseline.mjs". Loads `.perf/lighthouse-mobile-prod.json` (baseline) + `.perf/lighthouse-mobile-cutover.json` (this run); asserts no route regresses > 5 points; asserts mean does not regress.
- [ ] T046 [P] [US6] Create `scripts/smoke/probe-all.mjs --strict` flag handler. Strict mode = 100% v6 + moved/renamed coverage AND 30 (not 10) sampled legacy redirects.
- [ ] T047 [US6] Create `.github/workflows/pre-cutover-verify.yml` per [contracts/verify-gate.md](./contracts/verify-gate.md) § "Workflow". Three jobs (lighthouse / smoke / gate); gate depends on both and emits the `cutover-verify` commit status check.
- [ ] T048 [US6] Add the `PAGESPEED_API_KEY` secret to the repo's GitHub Actions secrets if not already present. Verify with the workflow's first lighthouse step.
- [ ] T049 [US6] Update the cutover PR template at `.github/PULL_REQUEST_TEMPLATE.md` (or `.github/pull_request_template.md`) with the 6 operator-checklist items per [contracts/verify-gate.md](./contracts/verify-gate.md) § "Operator Checklist". If no template exists, create one — keep additions in a clearly-named section so the change doesn't conflict with the existing PR-body convention (K3).
- [ ] T050 [US6] Trigger the workflow against the cutover candidate deploy URL: `gh workflow run pre-cutover-verify.yml -F deploy_url=$DEPLOY_URL`. Confirm `cutover-verify` status check appears green on the cutover commit.
- [ ] T050a [P] [US6] **CSP audit (FR-013)**: Create `scripts/verify/csp-audit.mjs` that fetches every v6 core route from `$DEPLOY_URL`, parses the HTML, enumerates every inline `<script>` and `<style>` element, and asserts each has either a CSP `nonce` attribute or appears in a CSP `script-src`/`style-src` hash allowance in the response `Content-Security-Policy` header. Fail with the offending file + line on any violation. Add this script as a 4th job in `.github/workflows/pre-cutover-verify.yml` that the `gate` job depends on alongside `lighthouse` and `smoke`.
- [ ] T050b [P] [US6] **Clerk publishable-routes audit (FR-014 first sentence)**: Create `scripts/verify/clerk-routes-audit.mjs` that (a) reads `src/middleware.ts` (or wherever Clerk's `publicRoutes` are configured), (b) cross-references with the v6 route list, (c) compares against a committed `.perf/clerk-pre-cutover-public-routes.json` snapshot of pre-cutover public routes. Assert the post-cutover set is a SUPERSET of pre-cutover (no public route became gated). Fail the verify gate on any regression. Add as a 5th job in `pre-cutover-verify.yml`.

**Checkpoint**: Verify gate workflow live and tested. US6 deliverable complete — including CSP audit (FR-013) and Clerk publishable-routes audit (FR-014 first sentence).

---

## Phase 9: Ideas Degraded-Mode UX (cross-cutting, P2)

**Goal**: Per FR-014 and research Decision 5, the 3 IdeaBrief POST actions show a
"Coming soon" toast instead of breaking. UI side only — the 3 API handlers keep their
existing 501 returns.

- [ ] T051 [P] Read [src/components/ideas/IdeaBriefActions.tsx](src/components/ideas/IdeaBriefActions.tsx) and identify the click handler that posts to `brief/save`. Wrap the handler so it shows a Sonner toast with the text "Editing coming soon — saving + regenerate + repo attach ship in the next wave." instead of executing the POST. Keep all other state/behavior unchanged.
- [ ] T052 [P] Read [src/components/ideas/IdeaRelatedReposTab.tsx](src/components/ideas/IdeaRelatedReposTab.tsx) and apply the same toast pattern to the `attach-repo` click handler.
- [ ] T053 [P] Read [src/components/ideas/IdeaSideStack.tsx](src/components/ideas/IdeaSideStack.tsx) and apply the same toast pattern to the `brief/regenerate` click handler.
- [ ] T054 Run `npm run typecheck` and `npm test -- src/components/ideas` to confirm no regressions.
- [ ] T055 Manually verify in `npm run dev`: open an idea page, click each of the 3 wired-but-stubbed buttons, confirm the toast appears and no POST fires (DevTools Network tab shows zero outbound 501s on click — the click handler is short-circuited before the fetch).

**Checkpoint**: Ideas degraded mode confirmed visually. Cross-cutting work complete.

---

## Phase 10: Cutover Execution (Polish + Final Step)

**Purpose**: Run the operator runbook end-to-end. Quickstart phases 1-3.

### Pre-cutover gate

- [ ] T056 Confirm all foundational + US1–US6 + Ideas checkpoints are green. Re-run `npm run lint:guards`, `npm run typecheck`, `npm test`, `npm run build`. All must exit 0.
- [ ] T057 Deploy cutover candidate to HOSTUP staging URL per quickstart Step 1.2 (HOSTUP-specific command; operator-action). Record `$DEPLOY_URL`.
- [ ] T058 Run `gh workflow run pre-cutover-verify.yml -F deploy_url=$DEPLOY_URL`. Wait for completion. `cutover-verify` status check on the cutover commit MUST be green. If red: download artifacts, fix, redeploy, re-run.
- [ ] T059 Operator manual click-through per quickstart Step 1.4 — all 14 core routes + auth flow + IdeaBrief degraded toast + 2 redirect spot-checks + `/pricing` and `/contact` v6 rendering. Tick the 6 PR-body checklist boxes (T049 output) as you go.
  - [ ] T059.1 **FR-012 referrer verify**: Open homepage on `$DEPLOY_URL`, open DevTools, click any internal link to another route, then `document.referrer` in the destination's DevTools console MUST equal the prior URL. The Clerk + CSP changes MUST NOT have stripped or rewritten the referrer.
  - [ ] T059.2 **FR-009 no-Vercel verify**: From the Vercel dashboard (or `vercel project list`), confirm the `starscreener` project still shows status "Paused" with no new deployments created during this cutover work. Per the constitution this MUST hold without exception.
  - [ ] T059.3 **FR-008 data-store integrity verify**: Probe the homepage on `$DEPLOY_URL` and assert the rendered data matches the live data-store payload — `curl -s $DEPLOY_URL | grep -oE 'last.{0,3}updated[^"]*' | head -3` should show timestamps within the last 6 hours (proves the data-store reader fired and returned fresh Redis state, not stale bundled JSON).

### DNS flip + verify

- [ ] T060 Flip DNS / origin to v6 per quickstart Step 1.5 (HOSTUP-specific; operator-action). Record `date -u +"%Y-%m-%dT%H:%M:%SZ" > .cutover-timestamp.txt`.
- [ ] T061 Run `gh workflow run post-deploy-smoke.yml`. Confirm green. If RED → escalate to T065 (Rollback) within 60 seconds of observation.
- [ ] T062 External-probe spot-check: `curl -sIL https://trendingrepo.com/top10` and 3 other moved-tool URLs. Confirm 308 + correct redirect chain terminating at v6 destinations.
- [ ] T063 External-probe spot-check 5 random legacy URLs from `legacy-sitemap.txt`. Confirm zero 404 / 5xx.
- [ ] T064 Update `tasks/CURRENT-SPRINT.md`: move the cutover task to "Shipped 2026-MM-DD — v6 cutover complete; standby origin retained until 2026-MM-DD+3". Stage with `git add tasks/CURRENT-SPRINT.md` (exact-file only, NEVER `git add .` or `git add -A` per constitution).

### Rollback (only if T061 / T062 / T063 fail)

- [ ] T065 Execute quickstart Phase 2 rollback runbook (4 steps, ≤5 min budget). After completion, post incident note to `tasks/CURRENT-SPRINT.md` and open a follow-up issue documenting the failure mode + cutover-branch diff to investigate.

### Day +1 / +3 / +7 stabilization (per quickstart Phase 3)

- [ ] T066 Day +1: monitor `/api/revalidate` cache-flush stats; spot-check 5 random legacy URLs; compare day-over-day organic traffic on the 4 moved tools (must be within -10% per SC-009).
- [ ] T067 Day +3: if all probes green and no regressions, garbage-collect the standby HOSTUP origin per quickstart Phase 3 Day +3. Update `tasks/BACKLOG.md` with deferred follow-up waves (H1–H5 IdeaBrief writes, rebuild of 22 aggregator pages in v6, etc.).
- [ ] T068 Day +7: compare 7-day organic traffic to pre-cutover window (SC-008 zero increase in "broken link" / "404" tickets; SC-009 ≤10% drop on moved tools). Close the cutover PR/branch and capture lessons-learned in a one-page retrospective at `docs/RETROSPECTIVE-2026-MM-DD-v6-cutover.md`.

**Final checkpoint**: Cutover stable for 7+ days, standby origin garbage-collected, retrospective filed. v6 production cutover COMPLETE.

---

## Dependencies (Story-Level)

```text
Phase 1 (Setup) — T001, T002 [P], T003 [P]
   │
   ▼
Phase 2 (Foundational) — T004 → T005, T006 [P] → T007 → T008 → T009 → T010 [P]
   │ (all foundational tasks must complete before any user-story phase)
   ▼
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│ Phase 3 US1  │ Phase 4 US2  │ Phase 5 US3  │ Phase 6 US4  │ Phase 7 US5  │ Phase 8 US6  │
│ (P1 MVP)     │ (P1 MVP)     │ (P2)         │ (P2)         │ (P3)         │ (P3)         │
│ T011–T014    │ T015–T018    │ T019–T021    │ T022–T035    │ T036–T044    │ T045–T050b   │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
       │              │              │              │              │              │
       └──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
                                          │
                                          ▼
                              Phase 9 (Ideas UX, cross-cut) — T051–T055
                                          │
                                          ▼
                              Phase 10 (Cutover Execution) — T056–T068
```

**Story independence**: After Phase 2 completes, US1 / US2 / US3 / US4 / US5 / US6 can be
worked in parallel by different agents. Phase 9 depends only on the existing Ideas
components (already in operator WIP) — can also run in parallel with the user-story
phases.

**MVP scope (minimum to call cutover viable)**: Phase 1 + Phase 2 + Phase 3 (US1) +
Phase 4 (US2) + Phase 6 (US4 — required for "no 404 anywhere") + Phase 7 (US5 smoke) +
Phase 9 (Ideas UX) + Phase 10. Phases 5 (US3 renames) and 8 (US6 verify gate) are
strongly recommended but not strictly MVP.

---

## Parallel Execution Examples

### Foundational (Phase 2)

T005 (HeaderAccount.tsx) and T006 (HeaderAccountLoaded.tsx) are independent files —
parallelizable.

### User Story 4 (Phase 6, the heaviest)

T022 (scrape /pricing), T023 (scrape /contact), T029 (aggregator enumeration),
T032 (collection wildcard inspection) are all read-only / independent — parallelizable.

T031 (write 22 aggregator entries to next.config.ts), T033 (write wildcards), and
T028 (write marketing 308s) all touch `next.config.ts` — MUST run sequentially.

### Smoke + Verify scripts (Phases 7 + 8)

T036–T040 (smoke scripts) are all independent files — parallelizable as a batch.
T045–T046 (verify scripts) are independent files — parallelizable.

### Ideas UX (Phase 9)

T051 / T052 / T053 touch different component files — parallelizable.

---

## Implementation Strategy

**Recommended sequencing** (1 operator + multi-agent dispatch):

1. **Day 1 morning**: Phase 1 + Phase 2 (foundational). Single operator. HeaderAccount restoration + test recovery + standby provisioning. ~4h.
2. **Day 1 afternoon**: Dispatch 4 parallel agents on Phase 3 (US1), Phase 4 (US2), Phase 5 (US3), Phase 9 (Ideas UX). Each is ≤2h. ~3h wall-clock.
3. **Day 2 morning**: Single operator (or careful coordination) on Phase 6 (US4) — `next.config.ts` is a shared resource. ~6h.
4. **Day 2 afternoon**: Dispatch 2 parallel agents on Phase 7 (US5 smoke) and Phase 8 (US6 verify gate). ~3h each.
5. **Day 3**: Phase 10 (Cutover Execution). Single operator. Pre-cutover gate → DNS flip → 2h post-cutover monitoring.
6. **Day 4 / Day 6 / Day 10**: T066 / T067 / T068 stabilization gates.

**Total operator time**: ~24h focused work + 4 days calendar (allowing for stabilization gates).

**Constitution gates** applied throughout:
- K3 (surgical): Every task names exact files. No tasks "refactor adjacent code while you're there."
- K4 (verify): Every task has a verification step or check.
- No `git add .` / `git add -A` — call this out explicitly in T064 since it's the most likely violation point.
- No Vercel deploy/promote/git-connect/unpause commands anywhere. HOSTUP only.
- No new exports from `route.ts` files (the 3 stubbed 501 routes stay untouched).
- Collectors not touched — they remain in `direct` mode.
