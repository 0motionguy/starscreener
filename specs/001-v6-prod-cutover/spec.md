# Feature Specification: v6 Production Cutover for trendingrepo.com

**Feature Branch**: `001-v6-prod-cutover`

**Created**: 2026-05-21

**Status**: Draft

**Input**: User description: "v6 production cutover for trendingrepo.com — ship the new 14-route v6 product to prod without regressing 85+ legacy URLs that Google has indexed and external sites link to. Production runs on HOSTUP (not Vercel). Cutover must be reversible in under 5 minutes."

---

## Clarifications

### Session 2026-05-21

- Q: Marketing-page handling (FR-006) — preserve all 6 legacy marketing/utility routes, preserve only highest-value, or 308 all to homepage? → A: Preserve `/pricing` and `/contact` as real v6 pages (revenue + support paths); 308-redirect the other 4 (`/about` + 3 to be enumerated during planning) to the homepage.
- Q: HOSTUP rollback mechanism (FR-007) — what verification before cutover AND what fallback after? → A: Full pre-cutover verification gate (Lighthouse mobile pass on 14 core routes + post-deploy smoke probe + operator manual click-through). Fallback: keep the previous live HOSTUP deployment on standby; rollback is a DNS swap (or HOSTUP origin-switch) back to the prior origin, target ≤5 minutes wall-clock. The prior origin MUST NOT be deleted until cutover has been stable for ≥72 hours.
- Q: IdeaBrief degraded mode (FR-014) — ship with 3 POST endpoints stubbed, block until implemented, or hide the feature? → A: Ship cutover with IdeaBrief in degraded read-only mode. `brief/save`, `brief/regenerate`, and `attach-repo` POSTs return 501; the UI shows an "Editing coming soon" toast on click. Reads work fully. Full IdeaBrief writes are scheduled for the next wave (H1–H5 in S6041).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Moved Tool URL Redirects (Priority: P1)

A Google search visitor or social-media click-through arrives at one of four tool URLs that
v6 has moved (`/top10`, `/tierlist`, `/compare`, `/digest`). The visitor must reach the v6
equivalent (`/tools/top-10`, `/tools/tier-list`, `/tools/compare`, `/tools/digest`) via a
single permanent redirect — not a 404. The destination page must render normally with no
visible degradation.

**Why this priority**: External backlinks to these four URLs are the single largest concentrated
source of inbound SEO equity that the cutover puts at risk. Losing them costs ranking and
conversion immediately.

**Independent Test**: Visit each of the four legacy URLs in a browser; confirm the final
landing URL is the v6 equivalent, the response code chain is `308 → 200`, and the rendered
page works.

**Acceptance Scenarios**:

1. **Given** the site has cut over to v6, **When** a visitor requests `https://trendingrepo.com/top10`, **Then** the response is HTTP 308 with `Location: /tools/top-10` and the followed URL renders 200 OK.
2. **Given** the site has cut over to v6, **When** a visitor requests `https://trendingrepo.com/tierlist`, **Then** the response is HTTP 308 with `Location: /tools/tier-list`.
3. **Given** the site has cut over to v6, **When** a visitor requests `https://trendingrepo.com/compare`, **Then** the response is HTTP 308 with `Location: /tools/compare`.
4. **Given** the site has cut over to v6, **When** a visitor requests `https://trendingrepo.com/digest`, **Then** the response is HTTP 308 with `Location: /tools/digest`.

---

### User Story 2 — Operator Rollback Under 5 Minutes (Priority: P1)

An operator promotes the cutover, observes a critical regression (homepage 500, auth wall
blocking all visitors, etc.), and must restore the pre-cutover live state in under 5
minutes via a documented one-command runbook. Rollback must not depend on rebuilding,
re-deploying, or contacting third-party support.

**Why this priority**: Without a tested rollback path, the cutover cannot ship safely.
The 5-minute budget is what bounds operator risk to "annoyance" rather than "incident."

**Independent Test**: In a non-production environment, perform a cutover, then execute the
documented rollback runbook against a stopwatch. Confirm restoration in under 5 minutes
and verify the rolled-back state matches the pre-cutover baseline byte-for-byte on the
homepage and three sampled deep links.

**Acceptance Scenarios**:

1. **Given** the operator has just promoted v6 and observed a regression, **When** they
   execute the rollback runbook, **Then** `https://trendingrepo.com` returns to the
   pre-cutover live state within 5 minutes (measured wall-clock).
2. **Given** the rollback completes, **When** the operator re-runs the post-deploy smoke
   probe against the rolled-back state, **Then** all probes return 200 (the pre-cutover
   baseline) and no probe returns 5xx.

---

### User Story 3 — Renamed Route Redirects (Priority: P2)

A visitor arriving at `/breakouts` (plural, the legacy URL) or `/signals` (the legacy
analytics URL) reaches the v6 equivalent (`/breakout`, `/market-signals`) via a single
308 redirect. No 404.

**Why this priority**: Lower-volume than the four moved tools but same regression risk —
external backlinks exist and will break without a redirect.

**Independent Test**: Probe both URLs; confirm 308 → 200 chain to the correct v6 destination.

**Acceptance Scenarios**:

1. **Given** the site has cut over to v6, **When** a visitor requests `/breakouts`, **Then** the response is HTTP 308 with `Location: /breakout`.
2. **Given** the site has cut over to v6, **When** a visitor requests `/signals`, **Then** the response is HTTP 308 with `Location: /market-signals`.

---

### User Story 4 — Legacy URL Graceful Handling (Priority: P2)

A visitor arrives at one of the 85+ legacy URLs that v6 does not implement natively (22
aggregator pages, 63 collection/category pages, 6 marketing/utility pages). The response
MUST be either HTTP 200 (legacy content preserved) or HTTP 308 (redirected to the closest
v6 equivalent or the homepage). The response MUST NOT be 404 or 5xx.

**Why this priority**: Tail-traffic SEO equity. Individually each URL is low-volume; in
aggregate they represent the bulk of the indexed surface and protecting them is the
difference between Option A (selective ship) and a naive cutover.

**Independent Test**: Run a scripted probe against the full sitemap of the pre-cutover live
site (95 URLs); confirm zero 404s, zero 5xx, and that every URL terminates at a 200 page.

**Acceptance Scenarios**:

1. **Given** the site has cut over to v6, **When** the legacy-URL probe runs against the
   pre-cutover sitemap (95 URLs), **Then** zero URLs return 404, zero return 5xx, and
   every URL terminates at a 200-OK page (directly or via 308 chain).
2. **Given** a visitor requests an aggregator page that v6 does not yet implement (e.g.,
   `/githubrepo`), **When** v6 is live, **Then** the response is either 200 (page preserved)
   or 308 to a sensible v6 destination — never 404.

---

### User Story 5 — Post-Deploy Smoke Probe (Priority: P3)

A CI process runs a smoke probe workflow immediately after each cutover-candidate deploy.
The workflow hits all 24 v6 routes + a representative sample of the redirect map and
fails the deploy if any probe returns an unexpected status code.

**Why this priority**: Process safeguard. Mitigates the 2026-05-13 stuck-5xx pattern that
took weeks to surface without proactive probing.

**Independent Test**: Trigger the smoke workflow against a known-good deploy; confirm pass.
Trigger against a deliberately broken deploy (one route 500); confirm fail with that route
named.

**Acceptance Scenarios**:

1. **Given** a deploy has completed, **When** the post-deploy smoke workflow runs, **Then**
   it probes all 24 v6 routes + at least 10 redirect samples within 3 minutes wall-clock.
2. **Given** a deploy returns 5xx on any probed route, **When** the smoke workflow runs,
   **Then** it fails the deploy gate and surfaces the failing URL in the workflow output.

---

### User Story 6 — Lighthouse Performance Parity (Priority: P3)

Lighthouse mobile scores on the 14 core v6 routes must be greater than or equal to the
pre-cutover budget already established for the live site. The cutover MUST NOT regress
user-perceived performance on the routes that visitors actually see most.

**Why this priority**: Performance feeds SEO ranking and bounce rate. The v6 rebuild was
budgeted with Lighthouse gates; cutover must not silently undo that.

**Independent Test**: Run `lighthouse:routes:prod` against the 14 core routes on the
cutover candidate; compare each route's mobile score to the recorded pre-cutover baseline.

**Acceptance Scenarios**:

1. **Given** the cutover candidate is live on a staging URL, **When** the Lighthouse
   workflow runs against the 14 core routes, **Then** every route's mobile performance score
   is ≥ pre-cutover baseline for that route.

---

### Edge Cases

- **A legacy URL is too specific to redirect sensibly** (e.g., `/category/ai-agents-2024-q4`).
  Behavior: must fall back to a 308 to the homepage rather than 404, even if the homepage
  is not topically related.
- **HOSTUP deploy hangs mid-cutover** (deploy starts, traffic begins routing, then HOSTUP
  becomes unresponsive). Behavior: the rollback runbook must work even if HOSTUP's deploy
  control plane is degraded — DNS-level fallback or pre-staged previous build must be the
  rollback mechanism, not "trigger another deploy."
- **CSP blocks a previously-allowed inline script.** Behavior: a pre-cutover CSP audit must
  enumerate every inline `<script>` in the v6 build and confirm each has a nonce or hash.
  Cutover gate fails if any inline script lacks a CSP allowance.
- **Clerk auth wall accidentally blocks a previously-public route.** Behavior: a pre-cutover
  Clerk publishable-routes audit must enumerate which routes are public vs gated. Any v6
  route that was public pre-cutover must remain public.
- **A redirected URL terminates at a v6 page that also redirects** (e.g., `/breakouts` → `/breakout` → `/`).
  Behavior: a redirect chain must terminate at a 200-OK page in ≤2 hops; a chain >2 fails
  the smoke probe.
- **Smoke probe runs while data-store is mid-refresh** and a v6 route returns 503 from
  warm-up. Behavior: the smoke probe must retry once with a 5-second back-off before
  declaring failure, to absorb the warm-cache window.
- **External link uses HTTP not HTTPS** (`http://trendingrepo.com/top10`). Behavior: must
  terminate at the HTTPS v6 destination via the existing HTTP→HTTPS upgrade, not lose the
  redirect target on the second hop.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST serve the 14 v6 core routes + 8 /tools sub-routes + 2 auth routes from `https://trendingrepo.com` with HTTP 200 after cutover.
- **FR-002**: System MUST respond with HTTP 308 (Permanent Redirect) and correct `Location` header for the four moved tool URLs: `/top10` → `/tools/top-10`, `/tierlist` → `/tools/tier-list`, `/compare` → `/tools/compare`, `/digest` → `/tools/digest`.
- **FR-003**: System MUST respond with HTTP 308 for the two renamed routes: `/breakouts` → `/breakout`, `/signals` → `/market-signals`.
- **FR-004**: System MUST handle all 22 legacy aggregator URLs (e.g., `/githubrepo`, `/arxiv`, `/hackernews`) with either HTTP 200 (preserved page) or HTTP 308 (redirected to closest v6 destination). The response MUST NOT be 404 or 5xx.
- **FR-005**: System MUST handle all 63 legacy collection/category URLs with the same 200-or-308 contract as FR-004.
- **FR-006**: System MUST handle the 6 legacy marketing/utility routes as follows: `/pricing` and `/contact` MUST be preserved as real v6 pages (ported from legacy content); the remaining 4 (`/about` plus three others to be enumerated during planning) MUST 308-redirect to the homepage. No marketing route returns 404 or 5xx.
- **FR-007**: System MUST provide an operator-documented rollback runbook executable in under 5 minutes wall-clock. Rollback mechanism: the previous live HOSTUP deployment is kept on standby; rollback is a DNS swap (or HOSTUP origin-switch) back to the prior origin. The prior origin MUST NOT be deleted until cutover has been stable for ≥72 hours post-cutover.
- **FR-008**: System MUST NOT regress any existing data-store payload. The 30 cron-driven data sources MUST continue serving v6 routes from existing Redis state and bundled JSON fallback.
- **FR-009**: System MUST NOT introduce new dependencies on Vercel platform features. The deploy target remains HOSTUP and the Vercel `starscreener` project remains paused.
- **FR-010**: System MUST include a post-deploy smoke probe workflow that hits all 24 v6 routes + at least 10 representative redirect-map targets and fails the deploy gate on any unexpected status code.
- **FR-011**: System MUST restore the missing `HeaderAccount` and `HeaderAccountLoaded` components before cutover, restoring the 6 currently-failing auth-provider-policy tests. The cutover gate MUST require test pass rate ≥ 1335/1337.
- **FR-012**: System MUST preserve referrer attribution on the homepage. The Clerk auth wrapper and CSP header changes MUST NOT strip or rewrite `document.referrer` for organic traffic.
- **FR-013**: System MUST pass a pre-cutover CSP audit confirming every inline `<script>` in the v6 build has either a `nonce` or a hash allowance.
- **FR-014**: System MUST pass a pre-cutover Clerk publishable-routes audit confirming no route that was public pre-cutover is gated post-cutover. IdeaBrief ships in degraded read-only mode for this cutover: `brief/save`, `brief/regenerate`, and `attach-repo` POST endpoints return HTTP 501; the UI shows an "Editing coming soon" toast on click. Reads work fully. Full IdeaBrief writes ship in the H1–H5 follow-up wave (S6041).
- **FR-015**: Redirect chains MUST terminate at a 200-OK page within 2 hops. Chains of 3+ hops fail the cutover gate.
- **FR-016**: System MUST add a pre-cutover verification gate that runs (a) Lighthouse mobile audit on the 14 core routes against the pre-cutover baseline, (b) the post-deploy smoke probe workflow against the cutover candidate, (c) operator manual click-through of the 14 core routes. Cutover is blocked until all three pass.

---

### Key Entities *(include if feature involves data)*

- **Route**: Represents a single URL path served by the production site. Attributes: `path`,
  `pre_cutover_status` (200 / 404 / 308), `post_cutover_status` (200 / 308 expected),
  `post_cutover_destination` (final URL after redirect chain), `data_source` (which
  collector or static page backs it).
- **Redirect Rule**: An entry in the cutover redirect map. Attributes: `legacy_path`,
  `target_path`, `redirect_type` (308 only — no 301/302/307 in this cutover), `category`
  (moved-tool / renamed / aggregator / collection / marketing).
- **Smoke Probe Target**: One assertion in the post-deploy smoke workflow. Attributes:
  `url`, `expected_status` (200 or 308), `expected_final_url` (if 308), `timeout_seconds`,
  `retry_on_503` (true for routes backed by cold-start collectors).
- **Rollback Runbook Entry**: One step in the operator rollback procedure. Attributes:
  `step_number`, `command`, `expected_outcome`, `verification_probe`, `estimated_seconds`.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the 24 v6 routes return HTTP 200 from `https://trendingrepo.com` within 30 seconds of cutover completion.
- **SC-002**: 100% of the 6 known moved/renamed URLs (4 tools + 2 renamed) return HTTP 308 with the correct `Location` header.
- **SC-003**: Zero URLs from the pre-cutover 95-URL sitemap return 404 or 5xx in the first 24 hours post-cutover.
- **SC-004**: Mean Lighthouse mobile performance score across the 14 core routes is ≥ the pre-cutover baseline mean, with no individual route regressing more than 5 points.
- **SC-005**: An operator can roll back from cutover to the pre-cutover live state in under 5 minutes wall-clock, verified by an end-to-end rehearsal against a non-production HOSTUP environment.
- **SC-006**: The post-deploy smoke probe workflow completes in under 3 minutes and fails the deploy gate on any unexpected status code from any probed route.
- **SC-007**: Test suite passes ≥ 1335 of 1337 tests on the cutover branch (current baseline 1331/1337; 4 of the 6 failing tests are tied to missing `HeaderAccount` components and MUST be restored as part of FR-011).
- **SC-008**: Zero increase in support tickets tagged "broken link" or "404" in the 7 days post-cutover compared to the 7 days pre-cutover.
- **SC-009**: Organic search traffic to the 4 moved-tool URLs (measured via referrer logs) drops by no more than 10% in the 14 days post-cutover, indicating the 308 redirects successfully transferred SEO equity.

---

## Assumptions

- The live site's `sitemap.xml` (95 URLs as of 2026-05-21) is the authoritative inventory
  of URLs Google has indexed. URLs missing from the sitemap but linked externally are out
  of scope for this cutover and addressed by general 404-handling.
- HOSTUP supports either DNS-level rollback or pre-staged-build rollback within a 5-minute
  budget. Specific mechanism TBD in clarification Q2.
- Existing data-store payloads (30 cron-driven `data/*.json` files + Redis snapshot) work
  unchanged with v6 readers because `refreshXxxFromStore()` consumers are backward
  compatible with current schemas.
- The Vercel `starscreener` project remains paused throughout cutover per the project rule
  in `~/.claude/CLAUDE.md` ("AISO and STARSCREENER/trendingrepo production are on HOSTUP,
  not Vercel").
- External SEO ranking is more valuable than a perfectly-clean URL structure. Redirects
  are an acceptable cost; URL deletion (404) is not.
- The 3 idea-backend POST endpoints (`brief/save`, `brief/regenerate`, `attach-repo`) ship
  as 501 stubs for cutover, with the IdeaBrief UI showing an "Editing coming soon" toast.
  Full IdeaBrief functionality is a follow-up wave. (Confirm in clarification Q3.)
- Restoration of `HeaderAccount` and `HeaderAccountLoaded` components is a separate blocker
  task (B1 in session memory S6041, ~3–4h) that lands before this cutover spec begins
  implementation.

---

---

*All clarifications resolved 2026-05-21 — see `## Clarifications` section above.*

