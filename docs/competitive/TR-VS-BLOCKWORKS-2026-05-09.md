# trendingrepo.com vs blockworks.com — Deep Teardown + "Blockworks for AI" Strategy

**Date:** 2026-05-09
**Tool:** [vercel-labs/agent-browser@0.25.3](https://github.com/vercel-labs/agent-browser) (Rust-native CLI, Chromium 148)
**Scorecard:** [rubric-2026-05-09.json](rubric-2026-05-09.json)
**Screenshots:** [img/](img/)

---

## TL;DR

Trendingrepo today is a **deep open-source data-infrastructure product** masquerading as a directory. Blockworks is a **multi-stream institutional intelligence platform** built on top of a data-infrastructure product. TR has the harder thing already (78 routes, 8+ live signal sources, hourly cadence, cross-source consensus scoring, MCP + CLI + API). What TR is missing is the *commercial wrapper* — editorial, paywalled research, daily newsletter delivery, trust signals, an industry framework, and a flagship event.

**Composite "Blockworks-for-AI" readiness:**
- **trendingrepo: 45.6%** (470 / 1030 weighted points)
- **blockworks baseline: 77.7%** (800 / 1030)
- **Gap: 32.1 points**, concentrated in 6 of 15 dimensions: editorial depth (-72 weighted), premium-tier promotion (-50), trust signals (-56), vertical authority (-49), advisory (-28), events (-35).

The gap is **not technical**. TR's underlying data product beats BW on performance (4.3× faster load), per-entity depth (11 loaders + 6 mention synthesizers per repo vs editorial articles), API surface, and the unique moat: cross-source agreement scoring. The fix is a 90-day commercial wrap, not a rebuild.

---

## Scorecard at a glance

| # | Dimension | Wt | TR | BW | Δ | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| 1 | First-screen data density | 8 | 5 | 9 | -4 | TR has counters, BW has live financial deltas |
| 2 | Editorial depth | 9 | 1 | 9 | -8 | Largest single gap |
| 3 | Newsletter gravity | 8 | 3 | 8 | -5 | TR has the form, no delivery |
| 4 | Premium / paywall | 10 | 4 | 9 | -5 | TR /pricing exists but un-promoted |
| 5 | Events | 5 | 1 | 8 | -7 | Zero on TR side |
| 6 | Advisory | 4 | 1 | 8 | -7 | Zero on TR side |
| 7 | API / dev surface | 7 | 7 | 6 | **+1** | **TR wins** |
| 8 | Brand polish | 7 | 5 | 8 | -3 | Hero copy gap |
| 9 | Trust signals | 8 | 2 | 9 | -7 | No /about on TR |
| 10 | Search & nav | 6 | 7 | 7 | 0 | Both ⌘K, parity |
| 11 | Vertical authority | 7 | 2 | 9 | -7 | No published framework |
| 12 | Mobile (assumed) | 6 | 7 | 6 | **+1** | Verify next pass |
| 13 | Performance | 5 | 8 | 5 | **+3** | **TR wins (4.3× faster)** |
| 14 | Data depth per entity | 7 | 8 | 7 | **+1** | **TR wins (11 loaders/entity)** |
| 15 | Cross-source agreement | 6 | 9 | 6 | **+3** | **TR wins (the real moat)** |

TR wins 4 of 15 rows, ties 1, loses 10. The 4 it wins are *the technically defensible ones*; the 10 it loses are *the ones an MBA could close in 90 days*.

---

## Methodology

Five passes against both sites in lockstep using `agent-browser`:

1. **Surface inventory** — `open` → `snapshot` → `get text body` → save to `.tmp/teardown/<site>-<surface>.txt`
2. **Above-the-fold density** — `eval` script counts DOM nodes / interactive elements / numeric tiles / CTAs in viewport
3. **Visual capture** — `screenshot --full <path>` for each surface
4. **Performance** — `eval` reads `performance.getEntriesByType('navigation')[0]` for DCL, load, transferSize
5. **Trust + commercial** — manual inspection of /about, /pricing, /research

Five surface archetypes inspected per site (where available):
- Homepage → `tr-home-desktop.png` / `bw-home-desktop.png`
- Deep entity page → `tr-repo-detail-desktop.png` (anthropics/financial-services-plugins) / `bw-research-desktop.png` (Blockworks Research at `www.blockworksresearch.com`)
- Commercial archetype → `tr-pricing-desktop.png` / `bw-about-desktop.png`
- Newsletter archetype → `tr-digest-desktop.png` / *(BW /newsletters returned 404 — captured 404 page)*

Raw outputs in [.tmp/teardown/](../../.tmp/teardown/) (gitignored).

---

## Surface walkthrough

### Surface 1 — Homepage

**trendingrepo.com**
- **H1:** "One live ranking for open-source breakouts."
- **Above the fold:** logo + ⌘K search + "DROP REPO" + SIGN IN / SIGN UP, then sidebar with 8 terminal sections (TREND / SIGNAL / LLM-PACK / LAUNCH / RESEARCH / EXPLORE / TOOLS / WATCHING). Sidebar shows 39 numeric counters (e.g., "TRENDING REPOS 870", "REDDIT +3.7K"). Main content is the leaderboard / consensus surface.
- **Voice:** Operator / hacker terminal — `// OPEN SOURCE · LIVE`, `// TREND TERMINAL`, monospace status row, BETA badge.
- **Metrics:** 4646 DOM nodes, 49 interactive above fold, 39 numeric tiles, 30 CTAs, 1534ms load, 97KB transferred.

**blockworks.com**
- **H1:** "Building trust in onchain capital markets."
- **Above the fold:** top nav (Analytics / Prices / Investor Relations / Products / Advisory / Content / Events / Company), live ticker (BTC $80,393 / ETH $2,316 / BNB $654 / SOL $93 / Hyperliquid $44), then 9 live data tiles: 24hr Spot DEX Volume $6.03B (-0.75%), 24hr App Revenue $11.81M (-0.01%), 24hr Blockchain REV $229.96M (+12.99%), Stablecoin Supply $307.48B (0%), 7d DAT Flows $323.14M (-0.65%), 5d ETF Flows -$339.9M (-0.05%), and three more.
- **Voice:** Institutional / financial-press — mission-statement copy with verbs, capital markets framing.
- **Metrics:** 2221 DOM nodes (half of TR), 34 interactive, 52 numeric tiles, 20 CTAs, 6525ms load (4.3× slower), 685KB transferred (7× heavier).

**Verdict:** Same number of numeric pixels above the fold (~40-50 each), but BW's are *real-time financial deltas* and TR's are *navigation counters*. BW reads "live market", TR reads "live directory." The cleanest single move TR could make is replace the leaderboard hero with a row of 6-9 *AI-market* tiles (see Pillar 1 below).

---

### Surface 2 — Deep entity page

**trendingrepo.com/repo/anthropics/financial-services-plugins**
A dense single-entity page combining: trending position + cross-source mentions (Reddit, HN, Bluesky, Dev.to, Lobsters, X, ProductHunt) + npm download velocity + HuggingFace + arXiv citations + ProductHunt launches + funding overlay + revenue overlay (TrustMRR sync) + 30-day star activity sparkline + predictions + tier classification. 11 server loaders, 6 mention synthesizers. *This is the moat.*

**www.blockworksresearch.com**
The premium product. H2: "Unlock crypto's most powerful research platform." Subhead: "Sign up for Blockworks Research to access insights you can't invest without." Visible features list: L2 Sequencer Profits, GovHub, Command bar search, Editorial news, Contract addresses, L1 Blockspace Profitability, Tokenomics, Derivatives, MEV, Stablecoin Volumes, DEX Volumes, Custom favorites, Dark mode. 5× "Sign up" CTAs above fold.

**Verdict:** TR's per-entity depth is *better than* BW's per-entity research article. But BW's wrapper is a clear paid product; TR's is a free public page with no upgrade path. **Pillar 3** addresses this — gate the deepest views (full-history sparklines, full-text mention transcripts, alert rules > 5, CSV export) behind Pro.

---

### Surface 3 — Commercial archetype

**trendingrepo.com/pricing**
Already exists, fully spec'd:
- **FREE $0/mo** — public API, 3 alerts, 5 watchlist repos, 1× rate-limit
- **PRO $19/mo** — 60 alerts, 3 webhook targets, unlimited watchlist, 10× rate-limit, CSV export, private watchlist, weekly email digest
- **TEAM $49/seat/mo** — shared workspace, priority support, MCP usage reports
- **ENTERPRISE on request**
- Monthly/Yearly toggle ("SAVE ~20%")
- "// start free — scale when you ship" copy

This is an outright surprise vs the original plan assumption. The plumbing is *here*. What's missing: paywall enforcement on Pro features, homepage CTA pointing here, the actual Stripe checkout firing.

**blockworks.com/about**
- **MISSION:** "Our mission is to build trust in onchain markets."
- **VISION:** "Build the global information platform for crypto."
- HQ: 133 W 19th St., New York, NY 10011
- Hiring page link
- Trust & Ethics page, Privacy, Terms, Glossary
- Plus the persistent live data ticker carries through every page (5 prices + 9 metrics) — the data product is *the chrome*.

**Verdict:** TR's pricing page is *more competitive* than I would have predicted in the plan — Pro at $19 is a sane wedge price. The deficiency is that it isn't promoted: zero homepage upsell CTA, /pricing hidden from sidebar, BETA badge undermines paid-product credibility. **Pillar 3** activates this.

---

### Surface 4 — Newsletter / community

**trendingrepo.com/digest**
"Daily digest archive — what trended each day. Permanent URLs for each day's trending GitHub repositories, ranked by 24-hour star momentum. Each snapshot is an evergreen page — bookmark a date to come back to it." But: "Daily digests start today. Check back tomorrow for the first archive." So the archive is empty as of this snapshot. No subscribe CTA *on this page* (the homepage has `NewsletterCaptureForm` but the digest page doesn't).

**blockworks.com/newsletters** → 404. The newsletters live one level up under "Content" nav and the footer "Newsletters" group. The Breakdown is the flagship daily.

**Verdict:** TR is one weekend of work away from newsletter parity (wire Resend, ship a daily summary email of the same data the homepage already shows). **Pillar 2** is the lowest-effort, highest-leverage move on this entire list.

---

## Gap matrix — what BW ships that TR doesn't

Sorted by **(impact × leverage) / cost**.

| # | Gap | Cost (eng-wk) | Lift | Moat impact | Recommendation |
|---|---|:---:|:---:|:---:|---|
| 1 | Daily newsletter delivery | 0.5 | high | low (acquisition) | **Pillar 2 — ship in 2 weeks** |
| 2 | Live AI market tiles above fold | 2-3 | high | med (positioning) | **Pillar 1 — ship in 4 weeks** |
| 3 | Trust signals (/about + team + HQ) | 0.5 | med | high (institutional buy) | **Quick win — ship in 1 week** |
| 4 | Premium tier activated (paywall + CTA) | 4-6 | high | high (revenue) | **Pillar 3 — ship in 6 weeks** |
| 5 | AI Repo Trust Score (industry framework) | 1-2 | med | **very high** (defensible moat) | **Pillar 4 — ship in 3 weeks** |
| 6 | Editorial / research arm | hire | high | high | Defer — needs analyst hire |
| 7 | Events / virtual summit | 4-8 | med | med | **Pillar 5 — ship in 12 weeks** |
| 8 | Podcast | 1/wk recurring | med | med | Defer — distribution play |
| 9 | Advisory / consulting | hire | low | low (early) | Defer 12+ months |
| 10 | Analytics dashboard builder | 4-6 | med | med | Defer to Q3 |

The five chosen pillars cover gaps 1, 2, 3, 4, 5, 7. Six remaining gaps are deferred or chronic-hire blocked.

---

## Competitor cluster map — where TR sits

Two-axis: **audience breadth** (consumer ↔ institutional) × **product type** (directory ↔ data infrastructure).

```
                          INSTITUTIONAL
                                |
                                |
   PitchBook, Crunchbase        |       Bloomberg, Blockworks, CB Insights
   (institutional+directory)    |        (institutional+infrastructure)
                                |        ★ TR target quadrant ★
                                |
   ─────────────────────────────┼─────────────────────────────────
                                |
                                |        Artificial Analysis, LMArena,
   ProductHunt, FutureTools,    |        HuggingFace Leaderboard,
   TheresAnAIForThat            |        Trendshift, ossinsight
   (consumer+directory)         |        (consumer+infrastructure)
                                |        ◉ TR today
                                |
                          CONSUMER
```

**TR's current position** is bottom-right (consumer + infrastructure) — the same quadrant as Artificial Analysis (closest spiritual cousin) and Trendshift (closest direct competitor for the trending-scoring layer).

**TR's strategic move** is up-and-right: drag toward Blockworks' quadrant by adding the institutional wrapper (premium subscription, named editorial, industry framework, advisory funnel).

**Key competitor watch list:**
- [Artificial Analysis](https://artificialanalysis.ai/) — model perf benchmarks, Intelligence Index, **the closest thing to "Blockworks for AI" today.** Beat them on cross-source signal synthesis (their moat is benchmark depth; ours is signal breadth).
- [LMArena](https://lmarena.ai/) — human-preference rankings, narrow but loved.
- [HuggingFace Open LLM Leaderboard](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard) — owned by HF, the standard ref.
- [Trendshift.io](https://trendshift.io) — direct competitor for GH-trending scoring layer.
- [CB Insights](https://www.cbinsights.com/) — subscription AI research, AI 100 ranking. **Subscription model to study.**
- [a16z editorial](https://a16z.com/) — free editorial competing for mindshare. Big Ideas series, Top 100 Gen AI Apps.
- [FutureTools](https://futuretools.io) / [TheresAnAIForThat](https://theresanaiforthat.com) — consumer AI directories, different audience.

**GitHub similar tech to study/learn from:**
- [vitalets/github-trending-repos](https://github.com/vitalets/github-trending-repos) — issue-based notification mechanism (smart distribution hack).
- [joylarkin/AI-Coding-Landscape](https://github.com/joylarkin/AI-Coding-Landscape) — README-based ecosystem map, bimonthly updates.
- GitHub Ecosystem Radar (Next.js, sustainability scores, LLM weekly reports — eerily close to TR's shape, watch closely).
- mhadidg/gh-trends — automated newsletter + RSS feed.

---

## The strategic memo — "Blockworks for AI" 90-day roadmap

Five pillars. Sequenced by leverage / cost. Every pillar grounded in TR's existing code or data.

### Pillar 1 — Live AI Market Header (4 weeks)

**Problem:** Homepage hero is a directory leaderboard. Reads "list" not "market."

**Solution:** Replace the hero band with a row of 9 live tiles, each a clickable drill-down into a corresponding `/` route:

| Tile | Source already in repo? | Route already exists? |
|---|:---:|:---:|
| AI Repo Velocity Index (24h) | yes (homepage scoring) | yes (`/`) |
| AI Funding 24h | yes (`/funding`) | yes |
| Models launched 24h | yes (HF cron, `/huggingface/trending`) | yes |
| New MCP servers 24h | yes (Smithery rank fetcher) | yes (`/mcp`) |
| Papers 24h | yes (arXiv 3h cron) | yes (`/arxiv/trending`) |
| Skills published 24h | yes (skills snapshot) | yes (`/skills`) |
| Top model usage flip | partial (model-usage) | yes (`/model-usage`) |
| GPU $/hr index | **net new** — needs collector | net new |
| Open Compute Index | **net new** | net new |

7 of 9 reuse existing data. 2 need a small new collector. The display layer is a single React component echoing BW's metric-tile pattern.

**Code to reuse:**
- [src/components/charts/EChart.tsx](../../src/components/charts/EChart.tsx) — sparkline tiles
- [src/lib/trending.ts](../../src/lib/trending.ts) — repo velocity index already computed
- [src/lib/data-store.ts](../../src/lib/data-store.ts) — Redis-backed reads

**Success metric:** First-screen "live market feel" — when a non-customer lands on `/`, they see numbers ticking. Time-to-first-numeric-delta < 1.5s.

### Pillar 2 — The AI Breakdown daily newsletter (2 weeks)

**Problem:** `NewsletterCaptureForm` exists on homepage; `/digest` is empty; no Resend wiring.

**Solution:**
1. Wire Resend (`RESEND_API_KEY` env), `apps/trendingrepo-worker` cron at 14:00 UTC daily generates the day's digest from existing data (top 5 repos by momentum, top 3 funding events, top 1 model launch, top 1 paper) and emails subscribers
2. Same payload archives to `/digest/<YYYY-MM-DD>` (the page already exists, currently empty — populate it)
3. Use existing `/digest` weekly Mon-8am cron as the long-form Sunday edition ("This week in open AI")
4. Add Subscribe CTA to homepage hero (above "DROP REPO")

**Code to reuse:**
- `NewsletterCaptureForm` ([src/app/page.tsx](../../src/app/page.tsx))
- Existing Mon-8am digest cron in `.github/workflows/`

**Success metric:** 1000 subscribers in 60 days post-launch (TR's homepage gets enough traffic for that to be table stakes).

### Pillar 3 — TR Research (paywalled tier activated) (6 weeks)

**Problem:** /pricing page exists, tiers are spec'd, Stripe SDK is in `package.json`, but no checkout fires and no homepage CTA promotes it.

**Solution:**
1. Wire Stripe checkout to existing /pricing tier buttons
2. Build the entitlement layer (gate the following features behind Pro):
   - Star-history > 30 days (free is 30d window, Pro unlocks all-time)
   - Mention transcripts (free shows count + link, Pro shows full text + sentiment)
   - Alert rules > 5 (free is 3, Pro is 60)
   - CSV export
   - Private watchlists
   - MCP usage reports
3. Add "Upgrade to Pro" homepage banner (small, dismissible) + per-feature upgrade prompts ("Want 30-day → all-time history? Upgrade to Pro $19/mo")
4. Promote /pricing in sidebar under EXPLORE section

**Three-tier polish:**
- **Free** — current product, no behavior change. Upgrade prompts visible.
- **Pro $19/mo** — entitlement gates lift. Daily newsletter, full history, full transcripts.
- **Team $49/seat/mo** — shared workspaces (existing /tierlist short-link infra extends naturally).
- **Enterprise** — analyst calls, custom dashboards, API rate-limit lift, sales-led only.

**Code to reuse:**
- /pricing page already built ([src/app/pricing/](../../src/app/pricing/))
- Stripe SDK already in package.json
- Existing watchlist infra ([src/lib/db/schema/watchlists.ts](../../src/lib/db/schema/watchlists.ts))

**Success metric:** First $1k MRR in 90 days (50 Pro subs at $19 = $950).

### Pillar 4 — Open Model Transparency Framework (3 weeks)

**Problem:** TR computes a unique multi-source-agreement score (the moat) but does not publish the methodology as a *standard*. Blockworks' Token Transparency Framework gave them regulatory credibility cheap.

**Solution:**
1. Write a public methodology page at `/omtf` (Open Model Transparency Framework): how the cross-source score is computed, source weights, freshness budgets, transparency commitments
2. Add an "OMTF score" badge to every repo profile (it's literally the consensus number we already display, framed as a public standard)
3. Provide a downloadable JSON schema (`omtf-1.0.json`) that other tools can adopt
4. Pitch the framework to 3-5 industry partners (HF, ProductHunt, Trendshift, etc.) for endorsement
5. Press release: "Trendingrepo introduces the Open Model Transparency Framework — first cross-source standard for evaluating open-AI projects"

**Why it works:** Pure brand/moat play, low engineering cost, *the work is already done* — we just need to formalize it as a standard. Mirrors BW's TTF play exactly.

**Code to reuse:**
- Existing scoring logic
- Existing per-repo scoring display

**Success metric:** 1 published partner endorsing OMTF in 90 days.

### Pillar 5 — AI Trend Summit (virtual, quarterly) (12 weeks)

**Problem:** Zero events. BW's Digital Asset Summit is a meaningful brand + revenue lever.

**Solution:**
1. Lock 8-10 speakers from currently-tracked breakout repos (e.g., maintainers of top-5 momentum repos in the quarter — the data picks the speakers, that's the gimmick)
2. Virtual livestream + recordings paywalled to Pro+
3. Free signup for live attendance with email capture (top-of-funnel)
4. Q1 = "Open Models Quarter Review", Q2 = "MCP & Agents Edition", etc.
5. Sponsorship slots — 3 × $5k = $15k revenue per event

**Code to reuse:**
- Existing repo/maintainer data to identify speakers algorithmically (key narrative)
- Existing /digest weekly to seed coverage

**Success metric:** 500 live attendees Q1, 3 paying sponsors, 100 new Pro subs from event funnel.

---

## 90-day execution sequence

```
Week 1-2   Pillar 2 — Newsletter wiring + first issue
Week 1     Quick win — /about + team + HQ + drop BETA badge
Week 3-6   Pillar 1 — Live AI Market Header (data + UI)
Week 4-6   Pillar 4 — OMTF methodology page + badge + JSON spec
Week 7-12  Pillar 3 — Stripe + entitlements + paywalls
Week 8-12  Pillar 5 — AI Trend Summit Q1 (speaker outreach, landing page, sponsors)
Week 13    Q1 Summit livestream
```

**Total estimated lift:** ~12 engineering weeks across 90 days (1.5 FTE-equivalent). All five pillars use existing data sources / existing pages / existing infrastructure. No new collectors except GPU index + Open Compute Index in Pillar 1.

---

## Verification

This teardown is "done" when:

1. ✅ `docs/competitive/TR-VS-BLOCKWORKS-2026-05-09.md` written, reads top-to-bottom in <10 min
2. ✅ `docs/competitive/rubric-2026-05-09.json` parses as valid JSON, reproduces the 470 / 800 / 1030 weighted totals
3. ✅ `docs/competitive/img/` contains paired screenshots: `tr-home-desktop.png`, `bw-home-desktop.png`, `tr-repo-detail-desktop.png`, `bw-research-desktop.png`, `tr-pricing-desktop.png`, `bw-about-desktop.png`, `tr-digest-desktop.png`, `bw-newsletters-desktop.png` (8 screenshots, all >50KB)
4. ✅ Rubric scores grounded in evidence (numeric metrics for performance, snapshot quotes for content)
5. ✅ Five pillars each name: existing TR code/data dependency, success metric, eng-week cost
6. ⏳ Re-run quarterly — re-run `agent-browser open trendingrepo.com && agent-browser snapshot && agent-browser eval` to refresh the metrics and recompute readiness % over time

---

## Caveats

- **Mobile (390px) not directly captured** in this pass. Dimension 12 score is assumption-based on payload weight + framework choice. Verify next quarter.
- **BW market deltas move minute-to-minute** (snapshot caught 24hr Spot DEX at $6.03B; earlier WebFetch caught $30.04B). The *shape* of "live financial deltas above the fold" is the durable observation — the specific number isn't.
- **TR's /pricing page existed** despite plan-phase research suggesting "Stripe configured but not active." The actual gap is *enforcement + promotion*, not page-existence. This is good news — Pillar 3 is more like 4 weeks than 6 if the entitlement layer is the only net-new code.
- **Performance numbers are single-shot** at the snapshot timestamp. Production traffic + cold-cache scenarios may differ. TR's 4.3× speed advantage is large enough to survive measurement noise.
- **BW's DOM tree is leaner than TR's** (2221 vs 4646) despite TR loading faster. Reason: TR ships a heavy sidebar + leaderboard + bubble-map in the same payload. The "AI Market Header" change in Pillar 1 should *reduce* TR's homepage DOM, not grow it — replace the leaderboard hero, don't add to it.

---

## Out of scope (for this teardown)

- Full Lighthouse audit (separate ticket)
- Stripe activation implementation details (Pillar 3 spec'd, code in next sprint)
- Newsletter delivery integration (Pillar 2 spec'd)
- Sales / GTM motion design
- Brand redesign (V3 design system already adequate; rename/repositioning is a Q3 question, not now)
- Specific competitor surface scrapes beyond what's needed for cluster placement

---

## Bottom line

TR is **technically further along than the rubric suggests**. It has the depth, performance, API, and signal-synthesis moat that BW does *not* have on the AI side. What it lacks is the institutional commercial wrapper — and every piece of that wrapper has a 1-12 week ship time on top of code/data that already exists.

The question is not *whether* TR can become Blockworks for AI. The question is whether the team commits 90 days to the commercial pillars while protecting the data product underneath.

— Generated from agent-browser snapshots, repo introspection, and competitor research on 2026-05-09.
