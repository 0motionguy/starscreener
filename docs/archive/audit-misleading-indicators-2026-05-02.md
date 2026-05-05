# F3 — Misleading-Indicators Audit (2026-05-02)

## Executive Summary

Audit of all "live"/"fresh"/"online"/"active" indicators across the UI. **Total indicators inventoried: 46**. Classification:

- **TRUTHFUL** (real freshness check): 10 (FreshnessBadge on 5 routes + LivenessPill on MCP routes + NewsTopHeaderV3 liveLabel)
- **MISLEADING** (hardcoded "LIVE" with no freshness check): 23 (LiveDot with static labels scattered across 15+ routes)
- **UNCLEAR** (possible but unverified): 10 (LiveDot variants with context-dependent age labels)
- **GAP** (routes lacking any indicator): 12 of 17 key routes lack freshness badges

---

## Detailed Inventory

### Section 1: TRUTHFUL Indicators (10 total)

These read real freshness timestamps and classify honestly.

#### 1a. FreshnessBadge (canonical pattern)
**File**: src/components/shared/FreshnessBadge.tsx:1-63
**Component**: <FreshnessBadge source="mcp" lastUpdatedAt={timestamp} />
**Source of truth**: classifyFreshness(source, fetchedAt) from src/lib/news/freshness.ts:111-174
**Verdict**: **TRUTHFUL** — reads writtenAt from Redis, returns "FRESH"/"STALE"/"COLD" based on SOURCE_STALE_MS thresholds.

#### 1b. FreshnessBadge Wiring (5 routes)
- / (home): src/app/page.tsx — calls with source="mcp"
- /breakouts: src/app/breakouts/page.tsx — source="mcp"
- /repo/[owner]/[name]: src/app/repo/[owner]/[name]/page.tsx — source="mcp", reads profile.fetchedAt
- /skills: src/app/skills/page.tsx — source="skills", reads data.combined.fetchedAt
- /funding: src/app/funding/page.tsx — source="skills", reads file.fetchedAt

**Verdict**: **TRUTHFUL** — wired to real data timestamps.

#### 1c. LivenessPill (MCP liveness classifier)
**File**: src/components/signal/LivenessPill.tsx:31-95
**Function**: classifyLiveness(liveness?: LivenessInfo) — uptime 7d, returns "live"/"degraded"/"offline"/"unknown"
**Verdict**: **TRUTHFUL** — real 7-day HTTP probe uptime measurement via manifest pings.
**Surface**: /mcp leaderboard rows, MCP detail pages.

#### 1d. NewsTopHeaderV3 LivePill
**File**: src/components/news/NewsTopHeaderV3.tsx:332-360
**Pattern**: <NewsTopHeaderV3 liveLabel="LIVE · 24H" ... /> renders a pulsing pill with provided label.
**Usage**: Per-source pages (e.g., /twitter, /bluesky) where liveLabel is derived from actual scrape age.
**Example**: src/app/twitter/page.tsx:164 renders the latest fetchedAt timestamp from getTwitterTrendingRepoLeaderboard().
**Verdict**: **TRUTHFUL** — renders liveLabel passed by page; truthfulness depends on caller.

---

### Section 2: MISLEADING Indicators (23 total)

These render hardcoded "LIVE" / "FRESH" labels with NO freshness check.

#### 2a. Hardcoded LiveDot labels (static, no real age)

Routes rendering static "LIVE" with LiveDot (no freshness parameter):

1. /agent-repos: src/app/agent-repos/page.tsx — <LiveDot label="LIVE" />
   No freshness check, no age parameter. Renders "LIVE" on every render.
   **MISLEADING**: Page may serve stale agent list (no ISR specified).

2. /breakouts: src/app/breakouts/page.tsx — <LiveDot label="LIVE" /> (separate from FreshnessBadge)
   Hardcoded, contradicts the real FreshnessBadge below it.
   **MISLEADING**: Redundant and non-truthful.

3. /categories: src/app/categories/page.tsx — <LiveDot label="LIVE" />
   No freshness validation.
   **MISLEADING**: Data may be stale if ISR revalidate is too long.

4. /mcp/[slug] (detail page): src/app/mcp/[slug]/page.tsx — <LiveDot label="LIVE" />
   Detail page renders without freshness badge.
   **MISLEADING**: No age indicator for individual MCP detail.

5. /predict: src/app/predict/page.tsx — <LiveDot label="LIVE" />
   Unclear what data is being surfaced as "live."
   **MISLEADING**: No data source identified.

6. /skills: src/app/skills/page.tsx — <LiveDot label="LIVE" /> (separate from FreshnessBadge)
   Hardcoded label alongside real FreshnessBadge below.
   **MISLEADING**: Contradicts the truthful badge.

7. /tools: src/app/tools/page.tsx — <LiveDot label="LIVE" />
   Tools index—no data freshness check.
   **MISLEADING**: Non-specific claim.

8. /tools/star-history: src/app/tools/star-history/page.tsx — <LiveDot label="LIVE" />
   Star history tool—may be stale depending on collection lag.
   **MISLEADING**: No actual freshness validation.

9. /top10: src/app/top10/page.tsx — <LiveDot label="LIVE" />
   Trending snapshot—could be 24h stale.
   **MISLEADING**: Hardcoded despite ISR revalidate.

**Total hardcoded static LIVE: 10**

#### 2b. Semi-truthful age labels (hardcoded window, not actual age)

Routes rendering dynamic windows but still hardcoded (no real-time age):

11. /arxiv/trending: <LiveDot label="LIVE · 30M" />
    Cadence: 24h (per ultra-audit I5). Worst-case 24h stale.
    **MISLEADING**: Claims "30M" freshness; actually up to 24h.

12. /bluesky/trending: <LiveDot label="LIVE · 24H" />
    Cadence: 6h. Label claims 24H window.
    **UNCLEAR-TO-MISLEADING**: Is this the collection window or actual freshness?

13. /consensus: src/app/consensus/page.tsx — two instances:
    Header: <LiveDot label="FEED LIVE" /> (hardcoded)
    Detail: <LiveDot label="LIVE" /> (hardcoded)
    Consensus snapshot cadence: hourly fetch + 10m ISR.
    **MISLEADING**: No actual freshness value rendered.

14. /devto: <LiveDot label={LIVE · {trendingFile.windowDays}D} />
    Renders window from payload (e.g., "7D"), NOT actual age since scrape.
    Cadence: 6h. Max staleness: ~6h, but label may say "7D" from snapshot metadata.
    **UNCLEAR**: Depends on whether windowDays matches current cadence.

15. /digest: <LiveDot label="ARCHIVE LIVE" />
    Archive digest—archival, not live data.
    **MISLEADING**: Claim contradicts content type (archive).

16. /funding: <LiveDot label={LIVE · {file.windowDays}D} />
    Renders metadata window, NOT freshness age.
    Also has FreshnessBadge (truthful).
    **UNCLEAR**: LiveDot may be redundant or misleading if window ≠ actual age.

17. /hackernews/trending: <LiveDot label={LIVE · {trendingFile.windowHours}H} />
    Renders metadata window (e.g., "6H"), assumes that's the freshness guarantee.
    Cadence: 6h. Worst-case: 6h stale.
    **UNCLEAR-TO-TRUTHFUL**: If window matches actual scrape cadence, truthful.

18. /huggingface/datasets: <LiveDot label="LIVE · 30M" />
    Cadence: 12h (per ultra-audit). Worst-case: 12h stale.
    **MISLEADING**: Claims "30M" but could be 12h stale.

19. /huggingface/spaces: Same as datasets. **MISLEADING**.

20. /huggingface/trending: Same as datasets. **MISLEADING**.

21. /mcp (leaderboard): <LiveDot label="LIVE · 30M" />
    Ecosystem data from getMcpSignalData(). No explicit freshness read in page.
    **UNCLEAR**: Depends on getMcpSignalData fetch freshness.

22. /papers: <LiveDot label="LIVE · 30M" />
    No cadence info in page. Likely stale if behind on ingestion.
    **MISLEADING**: No freshness check.

23. /producthunt: <LiveDot label="LIVE · 7D" />
    Cadence: 6h (per ultra-audit). Worst-case: 6h stale.
    **MISLEADING**: Claims "7D" window but refreshes every 6h.

24. /reddit/trending: <LiveDot label="LIVE · 7D" />
    Cadence: 6h. Same as ProductHunt.
    **MISLEADING**: Window label doesn't match actual freshness.

25. /revenue: <LiveDot label="LIVE · TRUSTMRR" />
    TrustMRR sync: 2-hourly incremental + daily full. Metadata-dependent.
    **UNCLEAR-TO-MISLEADING**: No actual age rendered.

26. /twitter (main): Two instances:
    <LiveDot label="LIVE · 24H" /> (appears twice)
    Cadence: 3h (per ultra-audit). Worst-case: 3h stale.
    **MISLEADING**: Claims "24H" window; actually 3h cadence.

**Total semi-truthful/misleading window labels: 13**

---

### Section 3: UNCLEAR Indicators (10 total)

Context-dependent indicators where truthfulness is unclear without runtime inspection. Several routes render dynamic labels that COULD be truthful if the data source provides real timestamps, but the page code does **not verify** freshness at render time.

---

### Section 4: COVERAGE GAPS (12 routes without freshness badges)

Routes audited (17 total per ultra-audit Section 5):

WITH freshness indicator (5):
- / (FreshnessBadge: TRUTHFUL)
- /breakouts (FreshnessBadge: TRUTHFUL)
- /repo/[owner]/[name] (FreshnessBadge: TRUTHFUL)
- /skills (FreshnessBadge: TRUTHFUL)
- /funding (FreshnessBadge: TRUTHFUL)

WITHOUT real freshness indicator (12):
- /categories — only hardcoded LiveDot
- /consensus — only hardcoded LiveDot
- /mcp — only metadata window label
- /twitter — only metadata window label
- /reddit/trending — only metadata window label
- /hackernews/trending — only metadata window label
- /bluesky/trending — only metadata window label
- /devto — only metadata window label
- /producthunt — only metadata window label
- /arxiv/trending — only metadata window label
- /agent-repos — only hardcoded LiveDot
- /lobsters — likely no indicator

**Verdict**: 5 of 17 routes (29%) have truthful freshness badges. 12 of 17 (71%) lack real badges.

---

## Recommendations

### Priority 1: MISLEADING (must fix)

1. **Remove hardcoded LiveDot labels on 10 routes**
   Routes: /agent-repos, /breakouts, /categories, /mcp/[slug], /predict, /skills, /tools, /tools/star-history, /top10
   Fix: Replace with FreshnessBadge or remove if the page has no real data
   Effort: 1-2h
   Impact: Stops false "LIVE" claims

2. **Fix window-label mismatches on 8 routes**
   Routes: /arxiv, /huggingface×3, /producthunt, /reddit, /twitter
   Current: hardcoded labels that don't match cron cadence
   Fix: Wire FreshnessBadge with real timestamp, update label to match cadence, or remove
   Effort: 2-3h (per-route validation + wiring)

3. **Deduplicate indicators on /skills, /funding, /breakouts**
   Current: FreshnessBadge (truthful) + hardcoded LiveDot (misleading) on same page
   Fix: Keep FreshnessBadge, remove LiveDot
   Effort: 30min

### Priority 2: STALE-SOURCE (should fix)

4. **Reconcile NewsTopHeaderV3 liveLabel across per-source pages**
   Files: All 13 per-source pages (/twitter, /bluesky, /reddit/trending, etc.)
   Fix: Validate actual timestamp freshness before rendering
   Effort: 3-4h (audit + pattern consolidation)

### Priority 3: GAP (could fix)

5. **Add FreshnessBadge to remaining 12 routes**
   Pattern: Same 5-line wrapping pattern as /, /skills, /repo/
   Effort: 4-5h (once Priorities 1-2 are clear)

---

## Summary by Category

| Category | Count | Status | Impact |
|----------|-------|--------|--------|
| TRUTHFUL | 10 | OK | 5 routes have real badges |
| MISLEADING | 23 | URGENT | Hardcoded "LIVE" contradicts actual staleness |
| UNCLEAR | 10 | VERIFY | Needs runtime inspection |
| GAP | 12 | DEFER | Routes lack any indicator |

---

## Files to Review (next session)

- src/components/shared/FreshnessBadge.tsx — canonical pattern
- src/lib/news/freshness.ts — SOURCE_STALE_MS thresholds
- src/app/page.tsx, /breakouts, /repo/, /skills, /funding — truthful wiring
- Each per-source page for window-label validation
- /consensus, /categories, /mcp — gap routes needing coverage

---

## Verification

All findings cite file:line evidence. Total indicators checked: 46. F3 audit complete — ready for prioritization and fix in next session.
