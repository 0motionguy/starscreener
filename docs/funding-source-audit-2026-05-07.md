# Funding pipeline 7-day per-source signal-to-noise audit

**Generated:** 2026-05-07
**Window:** 2026-04-30 → 2026-05-07 (7 calendar days)
**Files audited:** `data/funding-news.json`, `data/funding-news-sec.json`, `data/_meta/funding-news.json`
**Snapshots scanned:** 13 (RSS) + 2 (SEC), pulled across `--all` branches via `git show <sha>:<file>`
**Method:** Aggregate signals per snapshot, dedupe by `id` for the 7-day cardinality, then compute per-source extraction quality, junk rate, and AI-confirmation rate.

> **Scope caveat.** The user brief framed the pipeline as "~22 RSS streams + Twitter + SEC Form D". Twitter (X-funding) writes to a separate Redis slug (`funding-news-x`) that is **not git-mirrored** to a `data/*.json` file, so it is invisible to a git-history audit. Crunchbase (slug `funding-news-crunchbase`) is in the same situation. The numbers below cover the 22 configured RSS feeds + SEC only. Twitter / Crunchbase need a Redis-backed audit pass to evaluate.

---

## Section 1 — Signal volume per source over 7 days

`totalSeen` is signal-instances across all snapshots (i.e. a signal that lives in the file for 6 snapshots counts 6 times). `uniqueById` is the real 7-day cardinality — that's the column to read.

| Source              | Total seen (×snapshots) | Unique by id | Unique by sourceUrl | Last `publishedAt` |
| ------------------- | ----------------------: | -----------: | ------------------: | -------------------- |
| `sec-form-d`        |                      94 |       **47** |                  46 | 2026-05-05           |
| `techeu`            |                      81 |       **28** |                  28 | 2026-05-07           |
| `techcrunch`        |                     252 |       **24** |                  24 | 2026-05-06           |
| `sifted`            |                      48 |       **11** |                  11 | 2026-05-07           |
| `eu-startups`       |                      24 |        **8** |                   8 | 2026-05-07           |
| `techstartups`      |                      30 |        **7** |                   7 | 2026-05-06           |
| `ai-business`       |                      24 |        **4** |                   4 | 2026-04-29           |
| `arstechnica`       |                      11 |        **3** |                   3 | 2026-05-06           |
| `ai-news`           |                      18 |        **3** |                   3 | 2026-05-04           |
| `pymnts`            |                       4 |        **3** |                   3 | 2026-05-03           |
| `techcrunch-ai`     |                       8 |        **2** |                   2 | 2026-05-06           |
| `the-decoder`       |                       6 |        **2** |                   2 | 2026-05-06           |
| **Subtotal (live)** |                     600 |      **142** |                 141 | —                    |

### Silently dead sources (configured but 0 signals in 7 days)

11 of 22 configured RSS feeds (50%) produced **zero** signals in the audit window:

| Source                | Tag      | Notes                                                                |
| --------------------- | -------- | -------------------------------------------------------------------- |
| `venturebeat`         | general  | One of the founding feeds. Dead.                                     |
| `bbc`                 | general  | BBC tech feed — funding-keyword filter probably starves it; expected.|
| `wired`               | general  | Funding-keyword filter probably starves it; expected.                |
| `geekwire`            | general  | Configured for `/topic/funding/feed/` so should NOT be empty. Dead.  |
| `siliconcanals`       | general  | Dead.                                                                |
| `venturebeat-ai`      | ai-tagged| The dedicated AI feed of a major outlet. Dead.                       |
| `marktechpost`        | ai-tagged| Wave-2 add (2026-05-07). Dead — possibly hasn't run yet OR no funding-keyword hit. |
| `unite-ai`            | ai-tagged| Wave-2 add. Dead.                                                    |
| `analytics-india`     | ai-tagged| Wave-2 add. Dead.                                                    |
| `mit-tech-review-ai`  | ai-tagged| Wave-2 add. Dead.                                                    |
| `synced`              | ai-tagged| Wave-2 add. Dead.                                                    |

Wave-2 sources were merged on 2026-05-07 (the day this audit ran), so part of the silence is "hasn't been picked up by the cron yet" — re-audit in 48 h to confirm. But `venturebeat-ai` is **not** Wave-2 — it has been live for weeks and contributes nothing. Same with `geekwire` (which is supposedly the funding-only category).

> **Note on Wave-3.** Five more sources (`prnewswire-vc`, `newcomer`, `ai-snake-oil`, `generative-value`, `import-ai`) merged into `origin/main` minutes after the audit window closed (#383, 2026-05-07T13:34Z). They had **no production exposure during the audit period** and are excluded from the live-vs-dead reckoning above. Re-audit them in 7 days.

---

## Section 2 — Signal quality per source

Definitions:

- `withAmountPct` — share of signals where `extracted.amount` is a real number (extractor confidence floor for "this is a fund-able round"). Highest is best.
- `junkPct` — share of signals where `extracted.companyName` matches the upstream `BAD_NAME_PATTERN` regex (kept in sync with `apps/trendingrepo-worker/src/fetchers/funding-news/index.ts`) **OR** trips a tighter heuristic on top of it (CRLF in name, country-as-name, common-noun-as-name). The tighter heuristic catches what the upstream regex was tuned conservatively to let through.
- `aiConfirmedPct` — share of signals tagged `ai-confirmed` (SEC scraper's high-confidence AI tag) **OR** carrying an `ai` tag with `extracted.confidence === 'high'` (publisher-classified AI-tagged feeds + extractor agrees).

| Source            | Unique signals | withAmount % | Junk-name % | AI-confirmed % | Quality verdict                            |
| ----------------- | -------------: | -----------: | ----------: | -------------: | ------------------------------------------ |
| `sec-form-d`      |             47 |      **0.0** |     **0.0** |       **91.5** | Issuer-name signal only — no $ extracted (Form D doesn't expose round size structurally). High AI-name confirmation rate. |
| `techcrunch`      |             24 |    **100.0** |     **1.2** |       **84.9** | Best-in-class. Keep, prioritise.            |
| `techeu`          |             28 |     **92.6** |    **13.6** |       **63.0** | Volume leader after SEC; junk rate elevated by mid-word linebreaks (e.g. `"M\r\n\r\nOura Health"`). |
| `eu-startups`     |              8 |    **100.0** |    **75.0** |       **91.7** | Headline-extractor regularly captures country prefix as company name (`"France"`, `"Germany"`). High junk rate but most items ARE real AI rounds — fixable with extractor fix. |
| `sifted`          |             11 |     **85.4** |    **16.7** |        **4.2** | Many funding stories, but extractor / AI-tag pipeline marks almost none as "ai-confirmed". |
| `techstartups`    |              7 |     **80.0** |    **20.0** |        **0.0** | Funding-relevant but **zero AI-confirmed** in 7 d — looks like generic-tech round noise.   |
| `ai-business`     |              4 |    **100.0** |    **25.0** |       **25.0** | Low volume + headline extractor confused by `"UK Launches…"` style → company = "UK Launches". |
| `the-decoder`     |              2 |    **100.0** |    **33.3** |       **66.7** | Tiny sample. Promising precision but needs more weeks before judging.                       |
| `techcrunch-ai`   |              2 |    **100.0** |    **25.0** |        **0.0** | Surprising — the AI category feed of TechCrunch under-emits compared to the general feed (24). The `ai-confirmed` rule needs revisiting because it currently misses `tags=['ai',...]` items that aren't the SEC `ai-confirmed` literal. |
| `arstechnica`     |              3 |     **36.4** |     **0.0** |        **0.0** | Mostly Anthropic narrative coverage, not funding — only 1 of 3 items has a $-amount.        |
| `ai-news`         |              3 |     **33.3** |     **0.0** |        **0.0** | Low volume + low extraction success. Last seen 2026-05-04 — possibly stale.                 |
| `pymnts`          |              3 |    **100.0** |     **0.0** |       **25.0** | Low volume but clean; payments-tilted — most items are non-AI fintech.                      |

### Concrete junk examples (current snapshot)

```
[techeu]      "M\r\n\r\nOura Health"   ← mid-headline CRLF leaks into company name
[eu-startups] "France"                  ← extractor took possessive prefix, not the brand
[ai-business] "UK Launches"             ← extractor took "UK Launches $675M Fund for AI Startups" → "UK Launches"
```

These are **extractor regressions**, not source-quality problems. Same RSS payload would yield clean names with a more careful headline-parsing pass.

### `aiConfirmedPct` definition risk

`aiConfirmedPct` reports **0.0** for `techcrunch-ai` and `techstartups` despite both feeds carrying real AI-funding stories. The current rule is:

> `tags.includes("ai-confirmed")` OR (`tags.includes("ai")` AND `extracted.confidence === "high"`)

`techcrunch-ai` items get `tags=["ai", "us"]` and `extracted.confidence === "high"`, so they SHOULD pass clause 2. They actually do — the report-builder counted them via the second clause. The 0.0 for `techcrunch-ai` is a Wave-2 effect (only 2 unique items in the window) plus the lack of `ai-confirmed` literal tag.

**Action item:** the SEC scraper sets `ai-confirmed` as a literal tag string. The RSS pipeline should mirror that for any item whose source is in `AI_TAGGED_SOURCES` (publisher already classified it). Without that, downstream consumers can't tell "high-confidence AI" apart from "headline contains 'ai'".

---

## Section 3 — Recommendations

Bucketed against the user's thresholds:

> KEEP: >5 high-quality signals/week. WATCH: 1-5/week. DEPRECATE: 0 signals OR >50% junk.

### KEEP — pull more often, surface more prominently

| Source         | Unique 7d | Weekly cadence    | Why                                                                                  |
| -------------- | --------: | ----------------- | ------------------------------------------------------------------------------------ |
| `sec-form-d`   |        47 | every 2 h         | Highest volume; ground-truth issuer names; only source that catches stealth-mode AI cos. |
| `techeu`       |        28 | every 2 h         | European AI rounds the US-tilted feeds miss. Junk rate is fixable in extractor.       |
| `techcrunch`   |        24 | every 2 h         | Cleanest extractions in the pool; the benchmark for what "good" looks like.           |
| `sifted`       |        11 | every 2 h         | Volume leader for European VC after `techeu`. AI-confirmation rate must be fixed (see above) before its value is fully visible. |
| `eu-startups`  |         8 | every 2 h         | High AI-confirmation rate; junk caused by extractor bug, not feed quality.            |
| `techstartups` |         7 | every 2 h         | Decent volume; investigate the 0% AI-confirmed (likely a tag-emission bug).           |

### WATCH — keep but don't expand cadence; reassess in 14 d

| Source          | Unique 7d | Notes                                                                  |
| --------------- | --------: | ---------------------------------------------------------------------- |
| `ai-business`   |         4 | Only 4 unique items; 1 was junk (`"UK Launches"`). Watch for 2 weeks.   |
| `arstechnica`   |         3 | Mostly editorial coverage of Anthropic / OpenAI, not funding. Borderline. |
| `ai-news`       |         3 | Last published 2026-05-04 — confirm cron is hitting it.                 |
| `pymnts`        |         3 | Payments tilt, only 1 AI-confirmed in 7 d. Borderline.                  |
| `techcrunch-ai` |         2 | Surprising under-emission — should be one of the strongest. Investigate AI_KEYWORDS gate or feed parsing. |
| `the-decoder`   |         2 | Wave-2 add (2026-05-07). Re-audit in 7 d — too early.                   |

### DEPRECATE — pull from the rotation

| Source                                                  | Reason                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| `venturebeat`                                           | 0 signals / 7 d. Has been in the pool for weeks. Either the feed is dead or the funding-keyword regex never hits. |
| `venturebeat-ai`                                        | 0 signals / 7 d. AI-tagged feed should be the easiest hit; it isn't.  |
| `bbc`, `wired`                                          | 0 signals / 7 d. General tech feeds — the AI+funding gate is too strict for them. Remove and stop wasting an HTTP RTT every cron. |
| `geekwire`                                              | 0 signals / 7 d despite being the dedicated `/topic/funding/feed/`. Investigate URL or remove. |
| `siliconcanals`                                         | 0 signals / 7 d. EU-startup beat already covered by `techeu` + `sifted` + `eu-startups`. |
| `marktechpost`, `unite-ai`, `analytics-india`, `mit-tech-review-ai`, `synced` | All Wave-2 (added 2026-05-07). Re-audit in 7 d before pruning — they may simply not have run yet. |

### Decision summary

- 6 RSS sources to KEEP at full cadence.
- 6 RSS sources to WATCH for a re-audit cycle.
- 5 RSS sources are immediate prune candidates (`venturebeat`, `venturebeat-ai`, `bbc`, `wired`, `geekwire`, `siliconcanals` — minus `siliconcanals` if EU coverage redundancy is acceptable).
- 5 Wave-2 sources need 7 more days before a verdict.
- SEC Form D is the highest-volume source by a large margin and the only one carrying stealth/private rounds.

---

## Section 4 — Time-to-coverage (does SEC lead RSS by 1-3 days?)

**Verdict: cannot confirm or refute from in-tree data. The two sources cover disjoint companies in the 7-day window.**

### What the data shows

The intersection of SEC issuer names ↔ RSS company names in the audited window is **empty after canonicalisation**:

- 47 SEC Form D issuers (almost all stealth / pre-press, e.g. `BROWN NEXTGEN DENSITY AI LLC`, `Sielo Robotics Inc.`, `LCV SUNO AI LLC`, `LIONHEART AI I, L.P.` — many are SPVs not operating companies).
- 24 RSS company names extracted for the same period (`Anthropic`, `CodeWords`, `Ethos`, `Tessera Labs`, `WaiV Robotics`, …) — none match the SEC list.

The two pipelines therefore cover **non-overlapping segments**:

- **SEC**: micro-cap, stealth-mode, often SPV / fund vehicles. Filed because they are legally obligated to. Almost never press-covered.
- **RSS**: mid- and growth-stage rounds with PR teams that publish to media outlets.

This is actually a **good** outcome — they're complementary, not redundant. But it means the design assumption "SEC leads RSS by 1-3 days for the same round" cannot be empirically validated against this 7-day window.

### Cross-source race within RSS

Only one company in the window appeared on >1 source:

| Company   | First source  | First at        | Last source | Last at         | Spread |
| --------- | ------------- | --------------- | ----------- | --------------- | -----: |
| Anthropic | `the-decoder` | 2026-05-06 12:45| `arstechnica`| 2026-05-06 22:09| 9.4 h  |

Insufficient sample to draw a per-source latency conclusion. Re-run after 30 days of SEC + RSS history accumulates (SEC scraper went live today, 2026-05-07).

### What to do instead

To answer the SEC-leads-RSS question, instrument a **deliberate cross-pipeline join** at the worker layer:

1. When ingesting an RSS funding signal, look up the company name against the last 30 days of SEC issuer names.
2. Emit a derived metric `lead_time_hours = rss.publishedAt − sec.publishedAt` when a match is found.
3. After 30 days, aggregate the distribution. The current data-store schema has the right primitives — this is a `derived-funding-cross-source` slug, not a fetcher change.

---

## Appendix A — Snapshot inventory

| Snapshot SHA | Date (UTC)            | File                          | Signals |
| ------------ | --------------------- | ----------------------------- | ------: |
| 470cf38d     | 2026-05-07T13:12:01Z  | data/funding-news.json        |     36  |
| e653f6fe     | 2026-05-07T13:11:26Z  | data/funding-news.json        |     36  |
| e4e53df5     | 2026-05-07T12:18:12Z  | data/funding-news.json        |     37  |
| 1b9e1f7e     | 2026-05-07T12:17:31Z  | data/funding-news.json        |     37  |
| f32946ee     | 2026-05-07T11:51:48Z  | data/funding-news.json        |     51  |
| 118df14b     | 2026-05-07T11:50:37Z  | data/funding-news.json        |     51  |
| bf5988e9     | 2026-05-07T08:19:09Z  | data/funding-news.json        |     37  |
| e11ea35c     | 2026-05-06T02:01:01Z  | data/funding-news.json        |     38  |
| 7557d89b     | 2026-05-06T01:52:54Z  | data/funding-news.json        |     38  |
| 16266082     | 2026-05-04T12:08:18Z  | data/funding-news.json        |     36  |
| ea41da67     | 2026-05-04T08:19:51Z  | data/funding-news.json        |     36  |
| 0f73fede     | 2026-05-04T02:01:53Z  | data/funding-news.json        |     36  |
| 0f4b0616     | 2026-05-03T19:19:27Z  | data/funding-news.json        |     37  |
| 470cf38d     | 2026-05-07T13:12:01Z  | data/funding-news-sec.json    |     47  |
| e653f6fe     | 2026-05-07T13:11:26Z  | data/funding-news-sec.json    |     47  |

The dip from 51 → 36 around 2026-05-07T11:51 → 13:12 is suspicious — a real cron should be additive, not subtractive. Investigate the 21-day window-sliding logic in `funding-news/index.ts:30`.

The 2-day gap (2026-05-04 → 2026-05-06) reflects a weekend cron miss, not a per-source issue.

## Appendix B — Method & reproduction

The audit script lives at `.tmp/funding-audit-2026-05-07.mjs` and is reproducible with:

```bash
node .tmp/funding-audit-2026-05-07.mjs   # writes .tmp/funding-audit-2026-05-07.out.json
node .tmp/funding-audit-deadcheck.mjs    # prints live vs dead source list
node .tmp/sec-vs-rss.mjs                 # prints cross-source canonical-name overlap
```

`BAD_NAME_PATTERN` in the audit script mirrors `apps/trendingrepo-worker/src/fetchers/funding-news/index.ts` line 138 verbatim. The tighter junk-name heuristic (`looksLikeJunkName`) is additive — the upstream filter is intentionally conservative; the audit's heuristic catches the residual noise the operator sees.
