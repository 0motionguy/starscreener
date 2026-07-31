---
status: idea
created: 2026-06-15
author: deep-crawl-2026-06-15 agent
trigger-tier: D
parked-until: customer-demand-gates-clear
---

# NL→SQL Data Explorer — Design Idea (Parked)

OSSInsight ships an "Ask anything" natural-language query box at
[ossinsight.io/explore](https://ossinsight.io/explore) — type
`"Which Rust repos got the most stars from European contributors last week?"`
and get back generated SQL plus the result set against their 10B+ GitHub-events
warehouse on TiDB Cloud.

The 2026-06-15 deep competitor crawl tagged this as a `4.0` impact delta — the
highest tier alongside their decade-of-data moat. This doc captures the design
in case we ever build it. It is **not** on any roadmap.

## 1. Why we're not shipping this yet

The crawl's v3 deltas (Toolbox `scripts/competitor-deep-crawl/out/2026-06-15T07-19-30-206Z/deltas.md`)
rate this feature `4.0` impact, but Tier D rationale ("ship the design doc,
don't burn engineering on cloning the academic feature unless customer demand
surfaces") wins on three independent grounds:

**Cost is large and fragmented across four surfaces.**

| Surface | Work |
|---|---|
| Data layer | Read-replica of `tb_signals` from the Toolbox lake OR a Supabase project mirror (ADR 0001 lake is append-only — analytics queries already viable, but no read-only role exists). Hours to provision; days to tune for the query shapes a NL prompt actually generates. |
| LLM layer | NanoGPT (Kimi-K2) prompt + schema description + few-shot examples + retry+repair loop. A working prompt is 2–3 days; a *trustworthy* prompt that doesn't hallucinate columns is 1–2 weeks of iteration against real queries. |
| Sandbox layer | Read-only Postgres role + statement timeout + `LIMIT` injection + EXPLAIN-cost cap + cross-tenant join blocker. Postgres primitives carry the weight, but the wrapper that turns LLM SQL into safe SQL is non-trivial. |
| UX layer | `/explore` page that mirrors OSSInsight's pattern: NL input → generated SQL preview (editable) → results table → export. Plus history, share-link, save-query. |

Rough order-of-magnitude: 2 engineer-weeks for an MVP that handles the 80% case
(`"top X by Y in time range Z"`); 6 weeks for the full UX + monetization tier
(history, sharing, saved queries, billing meter).

**The revenue persona doesn't ask for this.** TrendingRepo's paying users are
buying *signal* (which AI repo is moving, what AI agents are launching, what
to act on) — not *queryability*. We have not had a single paying-customer
inbound asking for "let me write SQL against your data lake." The personas
that would use this — OSS researchers, academic data nerds, agency analysts
running ad-hoc reports — overlap weakly with our pricing-tier buyers
($6.50/mo individual + the planned enterprise tier).

**OSSInsight monetizes this differently.** They are a marketing surface for
TiDB Cloud — the SQL playground exists to prove TiDB can swallow GitHub events
and return sub-second analytics. We are not selling a database. Cloning their
feature without their distribution motive is the academic version of building
it: technically impressive, strategically inert.

So: not now. Maybe later, when the customer-demand gates in §5 clear.

## 2. What the eventual implementation would look like

Three options on the data layer:

| Option | Pros | Cons |
|---|---|---|
| **A. Postgres read replica of Toolbox `tb_signals`** | Single source of truth; no dual-write; signal richness (47+ sources, hourly cadence). Toolbox owns it; we read. | Cross-product coupling. Latency to provision a replica role. Lake is forensic-grade — query cost can be wild without indexes for the NL shapes. |
| **B. Supabase read-replica project** | Already in stack (ADR 0001 append-only lake). Lower friction. Row-level security primitives mature. | Lake is sized for write-once read-rare; analytics workload would force budget upgrade. Schema is `cron_payloads` (JSONB) — not the relational shape NL queries assume. |
| **C. Materialized view over both** | Tunes the schema for NL-friendly queries (denormalize repo × source × time-bucket). | Maintenance overhead. ETL job. Drift risk between view and lake. |

Default choice: **A (Toolbox `tb_signals` read replica)**, with the wrapper API
on TrendingRepo. Toolbox already serves the signal lake under
`api.aiso.tools` — exposing a read-only role on a hot-standby is the same
shape as the `/signals` REST endpoint with SQL-instead-of-REST as the contract.

**LLM layer:** NanoGPT (Kimi-K2) is the prod-deployed model after the 2026-06
swap in `consensus-analyst`. The prompt has three stages:

1. **Schema-aware completion.** Inject a tight schema description (column
   names + types + 3–5 representative values) into the system prompt. Cap at
   ~2 KB; the full lake schema is too big for every call.
2. **Generate Drizzle-shaped SQL.** Output must be valid `SELECT … FROM
   tb_signals … WHERE …` Postgres syntax. The prompt forbids `INSERT`,
   `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `GRANT`, `EXECUTE`,
   `WITH RECURSIVE`, and any function not on a small allowlist.
3. **Self-repair on failure.** If the read-only role rejects the query (wrong
   column, syntax error, timeout), capture the Postgres error message and
   feed it back to the LLM with a "fix this" prompt. Max 2 retries.

**Sandbox layer:** Postgres-native primitives:

- Read-only user role (`GRANT SELECT` only, no schema mutations).
- `statement_timeout = '10s'` per-session.
- `set_config('limit', '1000', true)` then inject `LIMIT 1000` if the
  generated query omits it.
- `EXPLAIN (FORMAT JSON)` first; reject if `Plan Rows > 10_000_000` or
  `Total Cost > 100_000`.
- No joins across `tb_*` tables marked multi-tenant (e.g. customer-scoped
  data). The schema description omits those tables entirely.

**UX layer:** `/explore` route on `trendingrepo.com`:

```
┌─────────────────────────────────────────────────────────────┐
│  [Ask anything about the data lake…                      ]  │
│                                              [Run] [Share]  │
├─────────────────────────────────────────────────────────────┤
│  Generated SQL (editable, monaco-style):                    │
│    SELECT slug, source, COUNT(*) AS mentions                │
│    FROM tb_signals                                          │
│    WHERE source = 'github' AND ts > now() - INTERVAL '7d'   │
│    GROUP BY slug, source                                    │
│    ORDER BY mentions DESC                                   │
│    LIMIT 100;                                               │
├─────────────────────────────────────────────────────────────┤
│  Results (tabular, sortable, exportable):                   │
│    slug                  | source | mentions                │
│    anthropics/claude-code|github  | 1,247                   │
│    ollama/ollama         |github  | 982                     │
│    …                                                        │
├─────────────────────────────────────────────────────────────┤
│  [History] [Saved queries] [Export CSV / JSON / chart]      │
└─────────────────────────────────────────────────────────────┘
```

Mirrors OSSInsight's pattern beat-for-beat because it works.

## 3. Sketches of the schema description prompt

Two example NL queries → expected SQL the prompt should produce:

**Example A:** `"Which Rust repos got the most stars from European contributors last week?"`

```sql
SELECT
  s.slug,
  COUNT(DISTINCT s.contributor) AS european_contributors,
  SUM((s.value->>'stars_gained')::int) AS stars_gained
FROM tb_signals s
WHERE s.type = 'gh.star_event'
  AND (s.value->>'language') = 'Rust'
  AND (s.contributor_country IN
       ('DE','FR','IT','ES','NL','PL','SE','DK','FI','NO','CH','AT','BE','IE','PT','GR','CZ','HU','RO','BG','HR'))
  AND s.ts > now() - INTERVAL '7 days'
GROUP BY s.slug
ORDER BY european_contributors DESC, stars_gained DESC
LIMIT 100;
```

Note the prompt has to know: (a) `tb_signals.value` is JSONB and language
lives there, (b) `contributor_country` is a denormalized column on the view,
(c) "Europe" expands to an ISO-3166 set, (d) "last week" → `INTERVAL '7 days'`.

**Example B:** `"Top 10 AI-agent repos by composite momentum score this month."`

```sql
SELECT
  c.slug,
  c.composite_score,
  c.score_components
FROM tb_composite_scores c
JOIN tb_repo_categories r ON r.slug = c.slug
WHERE r.category = 'ai-agent-frameworks'
  AND c.window = '30d'
  AND c.computed_at = (SELECT MAX(computed_at) FROM tb_composite_scores)
ORDER BY c.composite_score DESC
LIMIT 10;
```

Note: the prompt has to know that the composite score lives in a separate
table from the raw signal, that categories are denormalized into
`tb_repo_categories`, and that "this month" maps to a `window = '30d'` enum
value, not a date math expression.

Both examples make clear: the schema description carries a lot of weight.
A naive prompt will hallucinate column names. Few-shot examples for each
common query archetype (`top X by Y`, `mentions over time`, `category
breakdown`, `contributor leaderboard`) are the part that turns this from a
demo into a feature.

## 4. Risk & sandboxing

- **SQL injection** — moot in the LLM path (no user-string interpolation),
  but the editable-SQL surface re-introduces it. Parse the post-edit string
  through `pg-query-parser`; reject any statement type other than
  `SELECT`/`WITH … SELECT`. Reject any tokens in the disallow list above.
- **Row cap** — hard `LIMIT 1000` injected post-parse. Lift only for
  authenticated power-tier accounts (post-monetization gate).
- **Query timeout** — `statement_timeout = '10s'` per-session; for power-tier,
  `'60s'`.
- **READ-ONLY role** — the connection string for `/explore` uses
  `tb_explore_ro` with `SELECT` on the whitelisted views only. No DML
  privileges. No access to `pg_catalog` beyond `information_schema` views
  needed for the LLM to know the schema.
- **Multi-tenant join blocker** — the schema description omits any
  customer-scoped table. Even if the LLM hallucinates a join, the role
  can't see the table.
- **Cost cap** — `EXPLAIN` first, reject if estimated > 100k cost units.
  Prevents accidental cross-product on signal × repo × time.
- **Rate limit** — 30 queries / hour / IP on the anonymous tier; lift on
  authenticated.
- **Audit log** — every NL query + generated SQL + execution time + row
  count writes to `tb_explore_audit`. Lets us tune the prompt against real
  usage and catch abuse early.

## 5. Customer-demand gates

We build this when one of these signals fires:

- **≥3 paying customers** ask for SQL/programmatic deep-dive access to the
  data lake in support tickets or sales conversations. Threshold: explicit
  request, not "would be nice."
- **≥1 enterprise prospect** names it as a deal-breaker (≥$5k/mo ACV at
  risk). Their justification has to survive a 15-min discovery call ("what
  specific question can't you answer today?").
- **Internal team needs it for ad-hoc analysis.** When `tb_signals` is
  large enough that one-off scripts are no longer practical, and we're
  paying an engineer to write throwaway queries weekly. Threshold: ≥4
  ad-hoc data pulls per month for a quarter.
- **An AISO product surface needs it.** AI-search optimization
  competitive analysis often requires "show me citation patterns across
  domains over time" — if the AISO team asks for the explorer to underpin
  a customer-facing feature, the gate clears.

Until one fires, this idea stays parked.

## 6. Effort estimate

| Scope | Engineer-weeks |
|---|---|
| **MVP** (80% case: `top X by Y in time range Z`, no auth, no history, no editable SQL) | 2 |
| **Full UX** (editable SQL, history, share-link, saved queries, CSV export) | +2 |
| **Monetization tier** (Stripe meter, power-tier limits, audit) | +2 |
| **Total** | **6** |

These are calendar-week estimates for a single engineer with NanoGPT prompt
iteration as the gating activity. Compresses to 3–4 weeks with two engineers.

If we ever build this, surface it as the **"data nerd tier"** of
monetization — explicitly above the $6.50/mo individual tier, priced for
research users ($25–50/mo) or a usage-metered enterprise add-on. Not a
free feature. The point is that the personas who want it are the ones who
will pay for it, which is the only way this clears the ROI bar.

## References

- Toolbox deep-crawl deltas (v3): `scripts/competitor-deep-crawl/out/2026-06-15T07-19-30-206Z/deltas.md`
- Toolbox OSSInsight profile: `scripts/competitor-deep-crawl/out/2026-06-15T07-19-30-206Z/ossinsight.md`
- Toolbox handover (Tier D rationale, §4.2): `docs/handovers/2026-06-15-deep-competitor-crawl-NEXT-EXECUTION.md`
- ADR 0001 (Supabase append-only data lake): `docs/adr/0001-supabase-append-only-data-lake.md`
- OSSInsight reference UX: <https://ossinsight.io/explore>
