# Phase-E design audit (agent-commerce panels)

Branch: feat/repo-detail-v4-w5

Commits audited:
- b7d56e57 — // 04c-sol Solana on-chain settlements panel
- 5c67f118 — AISO badge on movers + // 04d Dune historical chart

Auditor: STARSCREENER design auditor
Mode: read-only, against V4 token system + skills under .claude/skills/starscreener-*.md

---

## Surfaces audited

- src/app/agent-commerce/page.tsx
  - Lines 924-940 — AISO badge inside movers row badge cluster
  - Lines 1617-1881 — // 04c-sol Solana on-chain settlements panel (mirrors 04c Base)
  - Lines 1883-2065 — // 04d Historical volume (Dune) panel

## Visual verification

- Dev server at http://localhost:3023/agent-commerce returned **HTTP 500** during this audit.
  No live screenshots captured. Findings are from static analysis of the diff against globals.css V4 tokens
  and against existing panel patterns (// 04c Base, lines 1376-1623).
- .data/solana-x402-onchain.json is **absent** so // 04c-sol returns null, panel does not render today.
- .data/dune-x402-volume.json is **absent** so // 04d returns null, panel does not render today.
- .data/base-x402-onchain.json is present so // 04c Base panel still renders (used as reference for parity checks).

Per skill starscreener-ui-audit ship-readiness gate, dark/light theme toggle and 375px / 1440px screenshots
were not produced. Re-run audit once the dev server starts and the Solana/Dune JSON files land.

---

## Findings

### P0 — visible bug now

None. The two new panels are wrapped in try/catch with `return null` on missing data, so absent JSON
cannot crash the route. The 500 above is unrelated to these commits (data-store / env wiring on the dev
server, not the new render branches).

### P1 — token-system violation, fix soon

#### P1-1 — AISO badge uses hex when V4 has near-equivalent tokens

src/app/agent-commerce/page.tsx:929-933

    color:
      item.scores.aisoScore >= 80
        ? "#fbbf24"
        : item.scores.aisoScore >= 60
          ? "#f59e0b"
          : "var(--color-text-faint)",

globals.css exposes `--color-gold: #ffd24d` and `--color-warning: #ffb547`. Both tones are close in hue
to the inline hex literals; using tokens keeps theme-toggle behavior consistent with other amber/gold
tones across V4 (e.g. momentum-warm, source-claude both flow through --color-warning).

The skill starscreener-design-principles (line 70) requires "all colors must reference V4 tokens"; the
audit prompt allows hex where no token exists. Here tokens **do** exist.

Recommended fix:

    -                                ? "#fbbf24"
    +                                ? "var(--color-gold)"
                                     : item.scores.aisoScore >= 60
    -                                  ? "#f59e0b"
    +                                  ? "var(--color-warning)"
                                       : "var(--color-text-faint)",

#### P1-2 — facilitator palettes use hex where exact V4 tokens already exist

src/app/agent-commerce/page.tsx:1668-1683 (// 04c-sol Solana panel) and 1927-1932 (// 04d Dune):

Three facilitator hex literals are **byte-identical** to existing V4 tokens — these should reference the
token, not duplicate the value:

| Hex literal | Facilitator (file)                | V4 token (exact match)   |
|-------------|-----------------------------------|--------------------------|
| #a78bfa     | Dexter (1671), Heurist (1929)     | var(--color-violet)      |
| #60a5fa     | AnySpend (1675)                   | var(--color-blue)        |
| #f472b6     | AurraCloud (1676)                 | var(--color-pink)        |

The other 11 entries in the Solana palette (PayAI cyan #22d3ee, Bitrefill #fbbf24, RelAI #34d399,
UltravioletaDAO #c084fc, Cascade #38bdf8, Corbits #fb7185, Daydreams #a3e635, OpenFacilitator
#94a3b8, OpenX402 #f87171, x402jobs #fde047, CodeNut #f59e0b) **do not** have exact V4 token
matches — these are legitimate per-facilitator brand colors and the audit prompt explicitly allows hex
for that case. Same applies to the Dune palette (Coinbase #3b82f6, CodeNut #f59e0b, Thirdweb #34d399).

Recommended fix (Solana palette + Dune palette):

    -              Dexter: "#a78bfa",
    +              Dexter: "var(--color-violet)",
    ...
    -              AnySpend: "#60a5fa",
    -              AurraCloud: "#f472b6",
    +              AnySpend: "var(--color-blue)",
    +              AurraCloud: "var(--color-pink)",
    ...
    -              Heurist: "#a78bfa",
    +              Heurist: "var(--color-violet)",

#### P1-3 — // 04d panel uses .col-8 which has no mobile override

src/app/agent-commerce/page.tsx:1950 — `<Card className="col-8">`

globals.css:1955-1957 defines `.col-8 { grid-column: span 8 }` and the only responsive override is
at lines 2524-2528, which collapses **only** .col-4 and .col-6 to span 12 at <=1024px. .col-8
keeps its 8/12 span on mobile.

Concrete consequence at <=1024px (incl. 375px iPhone SE): the 12-col grid renders the daily-volume bar
chart as an 8/12 (66%) width column with 4/12 of empty space beside it, then the .col-4 facilitator
share below (which correctly collapses to 12). Skill starscreener-mobile-ux line 28 ("Single-column
stacks — data flows vertically; grids collapse gracefully") and line 32 ("Tables — use rows that
reflow") apply.

This is **not** a regression unique to // 04d — the same .col-8 is used in funding/page.tsx:251,
consensus/page.tsx:220, tools/revenue-estimate/page.tsx:97 and earlier in agent-commerce/page.tsx
itself (lines 669, 1027). But this audit covers // 04d, and the new panel inherits the bug. The
permanent fix lives in globals.css, not in the page.

Recommended fix (touches globals.css, two added selectors):

     @media (max-width: 1024px) {
       .col-4,
    +  .col-8,
    +  .col-9,
       .col-6 {
         grid-column: span 12;
       }

If the global change is too risky, scope it to the agent-commerce page:

    +@media (max-width: 1024px) {
    +  .agent-commerce-page .col-8 {
    +    grid-column: span 12;
    +  }
    +}

### P2 — cosmetic

#### P2-1 — // 04d daily-volume bars drop the borderTop accent that // 04c and // 04c-sol have

src/app/agent-commerce/page.tsx:1976-1982 (Dune daily bars) is missing the
`borderTop: "1px solid var(--color-accent)"` that both // 04c Base (1541) and // 04c-sol Solana (1793)
apply to each bar. Visually, the Dune bars will look "softer" / less crisp than the Base + Solana panels
sitting above on the same page. Skill starscreener-design-principles line 14 ("one coherent system,
not a collection of one-off widgets") applies to chart treatment too.

Recommended fix:

                                 background: "var(--color-accent)",
                                 opacity: 0.85,
    +                            borderTop: "1px solid var(--color-accent)",
                               }}

#### P2-2 — // 04d daily bars use gap: 1 while // 04c and // 04c-sol use gap: 3

src/app/agent-commerce/page.tsx:1962 vs 1774 and 1522. Inconsistency in the diff (Dune chart will
typically show many more days than the 21-day on-chain panels, so a tighter gap was chosen). Either
tighten all three to gap: 1 or widen // 04d to gap: 3 for visual rhythm consistency. Not critical —
bar density has a real reason to differ.

#### P2-3 — sample-tx anchor padding "6px 14px" is below the 8px grid

src/app/agent-commerce/page.tsx:1837 (// 04c-sol) and 1585 (// 04c Base, pre-existing) both use
`padding: "6px 14px"`. The skills' implicit 8/10/12/14/16 spacing rule would prefer "8px 14px".
This is an inherited pattern from // 04c, replicated faithfully — fixing it requires changing both
panels in lockstep. Defer until a broader spacing-grid sweep.

#### P2-4 — // 04d lastDay rendering can show empty after the bullet

src/app/agent-commerce/page.tsx:1953 — `right={<span>last day - {dune.lastDay}</span>}`. The type
allows `lastDay: string | null`. When null, the rendered output is "last day - " (React skips null
children). Acceptable, but a defensive `dune.lastDay ?? "—"` would match the empty-state idiom used
elsewhere on the page (e.g. line 994).

---

## Items NOT flagged (verified to follow rules)

- AISO badge `marginLeft: 6` matches the established badge cluster pattern (lines 879, 894, 905, 916, 944).
- AISO badge `fontWeight: 700` matches all sibling badges.
- AISO badge gated on `typeof item.scores.aisoScore === "number"` — handles null/undefined cleanly,
  matches the `(item.live?.npmWeeklyDownloads ?? 0) > 0` style of conditional rendering.
- // 04c-sol facilitator-share grid `120px minmax(0, 1fr) 60px 50px` — Solana names go up to 15 chars
  (UltravioletaDAO, OpenFacilitator), 120px is the right widening from Base's 90px. At 360px viewport
  the 1fr column compresses to ~52px but minmax(0, 1fr) prevents overflow.
- // 04c-sol sample-tx grid `120px minmax(0, 1fr) 100px` with overflow:hidden, textOverflow:ellipsis,
  whiteSpace:nowrap on the sig column — Solana sigs (88 chars) truncate cleanly even at 360px.
- Both new panels use font-mono via `var(--font-mono, ui-monospace)` consistently.
- Both new panels use V4 tokens for structural surfaces (--color-bg-canvas, --color-border-subtle,
  --color-text-default, --color-text-faint, --color-accent).
- // 04c-sol correctly references txSig + blockTime (Solana fetcher schema) vs // 04c's
  txHash + timestamp (Base fetcher schema) — distinct schemas handled correctly per commit message.
- Solscan deep link `https://solscan.io/tx/${s.txSig}` and Basescan `https://basescan.org/tx/${s.txHash}`
  are both correct.

---

## Summary

| Severity | Count |
|----------|-------|
| P0       | 0     |
| P1       | 3     |
| P2       | 4     |

**Most critical**: P1-1 (AISO badge tokenisation) — visible on every page load that has AISO-scored
movers, and the user explicitly called out tokenisation as the audit's first checklist item. Two-line fix.
