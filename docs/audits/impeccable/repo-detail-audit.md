# /repo/[owner]/[name] audit — 2026-05-13

> Skipped in wave-2 due to production 500 (now fixed by PR #1159). Auditing both warm (derived-store) and cold-miss (synthesized) paths.

## Files audited
- `src/app/repo/[owner]/[name]/page.tsx`
- `src/components/repo-detail/RepoIdHero.tsx`
- `src/components/repo-detail/CompletenessStrip.tsx`
- `src/components/repo-detail/RepoSignalSnapshot.tsx`
- `src/components/repo-detail/ChannelChipRow.tsx`
- `src/components/repo-detail/RepoMetricStrip.tsx`
- `src/components/repo-detail/RepoActionRow.tsx`
- `src/components/repo-detail/CrossSignalBreakdown.tsx`
- `src/components/repo-detail/ProjectSurfaceMap.tsx`
- `src/components/repo-detail/StarHistoryBlock.tsx`
- `src/components/repo-detail/RecentMentionsFeed.tsx`
- `src/components/repo-detail/MentionTimelineStrip.tsx`
- `src/components/repo-detail/OrganizationCard.tsx`
- `src/components/repo-detail/RelatedReposPanel.tsx`
- `src/components/repo-detail/WhyTrending.tsx`
- `src/components/repo/WhyBadge.tsx`
- `src/components/shared/FreshnessBadge.tsx`
- `src/app/globals.css` (lines 1106-1204, 1491-1593, 3964-3988, 5678-5697)

## P0 findings (dishonest / broken / a11y blocker)

- **Always-on green-pulse "live" dot — honest-chrome rule violation.** `globals.css:5691-5697` defines `.v2-live-dot` with permanent `box-shadow: 0 0 6px var(--v2-sig-green)`. It renders in `CrossSignalBreakdown.tsx:177`, `ProjectSurfaceMap.tsx:292`, and `WhyTrending.tsx:49` as the first dot in every `.v2-term-bar` regardless of data age, scan status, or whether the source was actually scanned in the last hour. Three "fresh" pulse signals on a page whose freshness is governed by `profile.fetchedAt` (last cron tick). Fix: gate visibility on a real freshness verdict, or strip the box-shadow + drop the `v2-live-dot` class in favor of an inert `bg-v2-line-200` dot in these term-bars. **Mechanical** (single-class deletion across 3 callsites).
- **Cold-miss path: `OrganizationCard` calls live GitHub user API without a try/catch surrounding the await.** `OrganizationCard.tsx:22` awaits `fetchGithubUserProfile(owner)`. On GitHub rate-limit / 5xx, an upstream throw bubbles past `page.tsx` (the section is rendered inline at `page.tsx:517`, NOT inside an ErrorBoundary) and 500s the whole page. `RelatedReposPanel`, `ProjectSurfaceMap` (also async) sit in the same unboundaried section. Same regression class as the d81856ad bug PR #1159 just closed. Fix: wrap `<OrganizationCard>` and `<ProjectSurfaceMap>` in `<ErrorBoundary>`, or have the components themselves `try/catch` the await and render the existing `org-card-empty` empty-state. **Mechanical**.
- **Avatar uses hardcoded indigo/purple gradient — brand violation.** `RepoIdHero.tsx:332` `background: linear-gradient(135deg, #6366f1, #8b5cf6)` paints every repo avatar indigo→purple, ignoring the V4 Liquid Lava orange brand (`--v4-acc: #fb923c`) and the repo's actual `ownerAvatarUrl`. Every repo on the page is branded the wrong color before the user reads the name. Fix: use the real `repo.ownerAvatarUrl` via `<EntityLogo>` (same component `ProjectSurfaceMap` already uses); fall back to a v4-acc-tinted glyph. **Design**.

## P1 findings (visible regression)

- **`.v2-term-bar` headers display fake "traffic-light" dot trio.** Each of the three "// CROSS-SIGNAL", "// PROJECT SURFACE", "// WHY TRENDING" cards renders three small dots (the first being the green-pulse) styled to look like a macOS window-control trio (`CrossSignalBreakdown.tsx:175-185` etc.). This is decoration masquerading as state — the two grey dots are inert. Fix: drop the dot trio entirely, or repurpose them to encode something real (e.g. firing/quiet/unknown channel count). **Design**.
- **`.repo-detail-tracking-banner` is double-defined and the inline yellow version wins.** `page.tsx:633-640` inline-styles the banner border + bg in `#ffcb05` yellow (`var(--v3-acc, #ffcb05)` fallback shipped before V4); `globals.css:1192-1204` styles the SAME class with `var(--accent, #ffaa00)` orange + 8px radius. The inline style appears later in the cascade and overrides. The banner is honest (`role="status"` + `aria-live="polite"` ✓) but visually drifts off-brand. Fix: delete the inline `<style>{...repo-detail-tracking-banner...}` block in `page.tsx`. **Mechanical**.
- **5 inline `<style>{...}</style>` blocks ship per request, defeating the css cascade.** `page.tsx:567-641`, `RepoIdHero.tsx:294-475`, `OrganizationCard.tsx:143-271`, `ChannelChipRow.tsx:164-245`, `StarHistoryBlock.tsx:277-360`, `RecentMentionsFeed.tsx:153-411` each ship a multi-hundred-line `<style>` tag inline. These are not deduped, they re-paint on every navigation, and they fight `globals.css` for the same class names (`.repo-deep-dive`, `.repo-detail-tracking-banner` already collide). Fix: hoist into `globals.css` or a co-located `.module.css`. **Mechanical** (large but mechanical).
- **`.repo-deep-dive` `border-radius: 3px` drifts from the 2px card-radii rule.** `page.tsx:589`, `RepoIdHero.tsx:317` (`.rid-head`), `:404` (`.rid-verdict`), `OrganizationCard.tsx:152`, `StarHistoryBlock.tsx:285`, `ChannelChipRow.tsx:179`, `RecentMentionsFeed.tsx:168` all hardcode `3px`. DESIGN.md mandates 2px on cards. The `.repo-detail-tracking-banner` already uses 3px inline AND 8px in globals.css — pick one. Fix: replace 3px with 2px across these inline blocks. **Mechanical**.
- **Page mixes v2-* / v3-* / v4-* tokens and class systems in the same render tree.** Hero (RepoIdHero) uses `--v3-*` tokens; Snapshot uses `--v2-*`; ProjectSurfaceMap mixes `--v3-*` inline with `--v4-*` class refs (`text-[var(--v4-money)]`); WhyBadge uses `--v4-*`; SectionHead uses `.v4-section-head__*` BEM. Three design generations co-resident on one route. User-facing: subtly different "green" / "amber" / "accent" hues across sibling cards. Fix: collapse to v4 in a dedicated PR — too large to be mechanical here. **Design**.
- **`<FreshnessBadge>` uses 999px pill radius — drifts from 2px card system.** `FreshnessBadge.tsx:46`. The badge sits inside a 3px-radius `.rid-head` block. Pill on a square page looks pasted. Fix: pin the badge to `2px` (or whatever value DESIGN.md declares for chrome). **Design**.
- **Eyebrow `RANK #N` uses fallback "—" for unranked repos but the same `<b>` weight applies.** `RepoIdHero.tsx:159` — for cold-miss synthesized repos (`repo.rank` is undefined), the eyebrow reads `RANK #—` in bold and the verdict band's `.rv-num` displays `#—` as a 32px hero number. On the cold-miss path this is the largest dishonest signal on the page (an oversized "no rank" looks like a real rank). Fix: hide the eyebrow rank-segment AND the `.rv-rank` column entirely when `repo.rank == null`. **Design**.
- **Cold-miss path: `CompletenessStrip` says "1 / 13 sources fired (7d)" with confident period.** `CompletenessStrip.tsx:88-91` reports `${active} / ${total} sources fired (7d)` — for synthesized repos, this is technically true (only GitHub is "active") but reads as a damning verdict on the repo, not as "we haven't scanned yet". Fix: render a distinct "tracking just started — sources not yet scanned" state on the cold path (the page already knows `isLiveFetched`, pass it down). **Design**.

## P2 findings (polish / drift)

- **`Globe2` icon imported in `RepoSignalSnapshot.tsx:4` only for the "linked" state — dead path on synthesized repos.** Cold path always renders `GitCommit` icon → fine, but worth confirming the warning tone doesn't fire wholesale on cold-miss because `repo.lastCommitAt` IS defined on synthesized repos.
- **`v3-acc` token fallback color `#ffcb05` (yellow) ships inline everywhere** (`RepoIdHero.tsx:306,332,427,635`, `page.tsx:589,615,636,637`, etc.). It's a brand-yellow leftover from V3. If the V4 token system ever fails to load (e.g. CSS-vars unsupported, body-class swap fail), the entire page paints in V3 yellow, not V4 orange. Fix: change fallback to `#fb923c`. **Mechanical**.
- **`.rid-h1` weight 600 + `.owner` weight 400 + 26px size is correct, but `<TrackedExternalLink>` "↗" glyph at 18px abuts a 26px H1 baseline awkwardly.** `RepoIdHero.tsx:186-189`. Polish — align baseline or use a Lucide `ArrowUpRight` at 14-16px.
- **`AISO real website scan` block in `ProjectSurfaceMap.tsx:550+` is 250+ lines of nested cards.** Surfaces only when `aisoScan` is set. Could be extracted to its own component.
- **`mention-shortlabel` row hides behind right-aligned auto margin (`RecentMentionsFeed.tsx:387`) and overlaps with `→ OPEN` button on narrow viewports.** Polish — wrap or hide one.
- **`MentionTimelineStrip` (server) reads inline brand colors but doesn't ship test coverage for empty-window state.** Polish.
- **`.rid-deeplink-btn` "Star activity →" CTA is right-aligned 10px mono, easy to miss.** `RepoIdHero.tsx:506`. The same destination has a louder `StarHistoryBlock.shb-full-link` further down (line 229). Two CTAs to the same page within 2 sections of scroll — fine but consider deleting the duplicate.
- **`.rv-pct.dn` red color for negative 30d delta is good, but `sd30Pct === null` falls through to `formatNumber(sd30)` showing "0" with green styling when `sd30 === 0`.** `RepoIdHero.tsx:273-278`. Minor — apply `.dn` when `sd30 <= 0`.
- **`completeness-strip` 12 sources hardcoded in TS; `repo.mentions.perSource` keyed only on 5 (twitter/reddit/hackernews/bluesky/devto + lobsters/producthunt/npm/huggingface/arxiv/tavily).** Several chips will always show "no recent mentions". Verify which platforms the assembler actually populates and drop the ones it doesn't.

## What's working well
- **PR #1159 defensive harness is excellent:** four `try/catch` blocks (`page.tsx:271-280` live-fetch, `295-302` profile, `314-318` why-narrative, `332-338` reactions, `346-350` markers) plus `Promise.allSettled` for the 15 parallel refreshes. This is the right shape for a long-tail cold-miss surface.
- **"Tracking just started" banner (`page.tsx:425-436`) is honestly designed:** the verbal explainer ("Cross-source signals will populate on the next collector tick") is candid AND it carries `role="status"` + `aria-live="polite"` — screen-reader users get the same disclosure sighted users do.
- **`<ErrorBoundary resetKey={...}>` on `StarHistoryBlock`, `RecentMentionsFeed`, and `RepoDetailChartLazy`** with route-keyed reset is the correct pattern. Just extend the same wrapping to `OrganizationCard` and `ProjectSurfaceMap` (P0 above).
- **`buildNarrative()` in `RepoIdHero.tsx:45-128` is genuinely data-driven** — "Quietly building" / "Single-channel signal so far" / "Quiet across tracked channels" descriptions all map to real counts rather than hyped marketing copy. Honest.
- **`getRelativeTime(repo.lastCommitAt)` chip + `<FreshnessBadge source="mcp" lastUpdatedAt={fetchedAt}>`** wire to the real `profile.fetchedAt` (`page.tsx:417`). No hardcoded "LIVE" claims at the page boundary.
- **`SectionHead` BEM (`v4-section-head__*`) and the 5-section numbering (`// 01 BREAKDOWN`, `// 02 GROWTH`, `// 03 MENTIONS`, `// 04 CONTEXT`, `// 05 DEEP DIVE`)** give the page strong scannability. The terminal-feel register matches the rest of the site.
- **`role="tablist"` / `role="tab"` / `aria-selected` on the MentionsFeed tab strip** (`RecentMentionsFeed.tsx:101-124`) plus `disabled` for zero-count tabs is correct keyboard a11y.
- **`<details>` deep-dive collapses cleanly with zero JS** — accessible by default, summary is the heading.
- **Action buttons enforce `min-h-[44px]` for tap targets** (`RepoActionRow.tsx:93,118,135`). Mobile-compliant.

## Path-specific notes

### Warm path (derived-store)
- 15-source `Promise.allSettled` refresh works correctly; channelStatus / mentions.perSource populate; CrossSignalBreakdown / ChannelChipRow / CompletenessStrip light up.
- The `.v2-live-dot` lies hardest on this path because every term-bar suggests "this section is being scanned right now" when in reality the most recent collector tick may be 30-60 min old. The honest answer is in `FreshnessChips` (already in `RecentMentionsFeed`) — promote that pattern.

### Cold-miss path (synthesized repo + "Tracking just started" banner)
- The banner is the saving grace — without it, the page would look like a verdict ("rank #—, 1/13 sources fired, 0/6 firing") when in fact we just haven't scanned the repo.
- `.rv-rank` displays `#—` as a 32px hero number — the most visually loud element on the cold-miss path makes the strongest claim (no rank) when the truth is "not yet measured". Hide it. (P1 above.)
- `CrossSignalBreakdown` will render 6 channel bars all at 0.00, all marked "(not firing)" — technically honest but emotionally a damning verdict. Consider a distinct "scan pending" state.
- `ProjectSurfaceMap` correctly renders the 6 surfaces with non-active dashed-border tiles; this works.
- `RelatedReposPanel` returns null when empty — correct.
- `OrganizationCard` is the highest-risk component on this path: an unboundaried `await` to GitHub user API + the cold-miss user is by-definition not in our derived org cache. (P0 above.)

## Mechanical fixes ready to ship (subset of P0/P1/P2)
1. Drop the green-pulse `box-shadow` on `.v2-live-dot` OR replace the 3 callsites with an inert dot. (P0 #1)
2. Wrap `<OrganizationCard>` and `<ProjectSurfaceMap>` in `<ErrorBoundary>` at `page.tsx:517-519` and `page.tsx:472-477`. (P0 #2)
3. Delete the inline `.repo-detail-tracking-banner` style block in `page.tsx:633-640` so the globals.css orange version wins. (P1 #2)
4. Replace `3px` with `2px` border-radius in the 7 hardcoded callsites. (P1 #5)
5. Replace `#ffcb05` fallback with `#fb923c` in the V3-acc fallbacks across the page. (P2 #2)
6. Hide `.rid-eyebrow` rank segment and `.rv-rank` column when `repo.rank == null`. (P1 #7)

## Quick-fix patches (illustrative)

```diff
- /* CrossSignalBreakdown.tsx:177 / WhyTrending.tsx:49 / ProjectSurfaceMap.tsx:292 */
- <span className="block h-1.5 w-1.5 rounded-full v2-live-dot" />
+ <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--v2-line-200)" }} />
```

```diff
- /* page.tsx:517-519 */
- <OrganizationCard owner={repo.owner} />
- <RelatedReposPanel items={profile.related} />
+ <ErrorBoundary resetKey={`org:${repo.owner}`}>
+   <OrganizationCard owner={repo.owner} />
+ </ErrorBoundary>
+ <RelatedReposPanel items={profile.related} />
```

```diff
- /* RepoIdHero.tsx:332 */
- background: linear-gradient(135deg, #6366f1, #8b5cf6);
+ background: linear-gradient(135deg, var(--v4-acc), var(--v4-acc-dim));
```
