# PRODUCT.md — Trendingrepo (StarScreener)

> Loaded by the impeccable design skill via `.agents/skills/impeccable/scripts/load-context.mjs`. Pairs with [DESIGN.md](./DESIGN.md). The full operator-facing situational doc lives at [docs/OPERATOR.md](./docs/OPERATOR.md); the architecture lives in [CLAUDE.md](./CLAUDE.md). Both are richer references; this file is the impeccable preflight seed.

## Register

**product** — Trendingrepo serves the user's scanning work. The interface IS the tool, not the marketing. Brand-register surfaces (landing, marketing) do not exist on this codebase.

## Product purpose

Real-time trend-discovery scanner for GitHub repos. Aggregates GitHub stars, Twitter buzz, Reddit / HN / Bluesky / ProductHunt / DevTo / Lobsters / arXiv / npm / HuggingFace signals, computes scoring + classification, surfaces breakout repos before they go mainstream.

Product of AGNTDOT.com. Sister to AISO.tools (separate codebase).

## Users

- **Operator (Mirko, primary)** — founder/technical lead, runs the engine and ships the surfaces.
- **Developer-investors** — scan for repos that are accelerating in momentum (stars/week velocity, contributor inflow, social mentions).
- **Founders / PMs** — track competitive repos and their public traction.
- **Researchers** — discover open-source primitives via arXiv-cited repos + HuggingFace cross-references.

Common job-to-be-done: *"What is moving right now in the space I care about, with enough context to decide whether to dig in within 3 seconds of landing on the page."*

## Brand strategic principles

**Prime directive: Dexscreener energy, not a Dexscreener clone.** Borrow the *reasons* Dexscreener works (fast scanning, dense readable signal, chart-centric behavior, immediate "what's moving?" clarity); do not copy its layout, palette, or visual identity. Reinterpret for GitHub: repo cards instead of token pairs, stars/contributors instead of price/liquidity, releases/commits/social buzz instead of swaps/volume.

> The `.claude/skills/starscreener-*` files documented the original visual intent but have **drifted from current implementation**. For implementation reality (tokens, radii, fonts, shadow policy), trust [DESIGN.md](./DESIGN.md). For brand intent and direction, the skill content remains useful background.

## Tone

**Fun-but-serious.** Playfulness must earn its place by reinforcing signal (heat = truly hot), never by decorating it. The numbers are real, the dataset is honest, the freshness chrome doesn't lie about staleness.

Honest-by-default voice: "COLD · 3D" means the source genuinely is 3 days stale; we don't paint it green. See [feedback memory: honest freshness chrome](C:\Users\mirko\.claude\projects\c--dev-trendingrepo\memory\feedback_freshness_chrome_must_be_honest.md). The `FreshnessBadge` component plus `classifyFreshness()` are the only sanctioned way to render data freshness.

## The feel

- **alive** — things move, deltas pulse, new breakouts surface
- **visual** — sparklines everywhere, charts first-class
- **premium** — expensive-looking, not "indie weekend project"
- **fast** — every interaction under 100ms, no layout shift
- **slightly playful** — momentum pulses, heat glow, flame icon on hot repos
- **trustworthy** — data is real, numbers are exact, no BS
- **screenshot-worthy** — users want to post cards on X

## The anti-feel

Trendingrepo must NOT feel like:
- GitHub wrapper
- BI / admin dashboard
- Template SaaS landing page
- Generic startup hero ("Discover trending. Be the first to know!")
- Crypto clone
- Developer-console ugliness

If something reads "admin panel" or "template" — it's wrong. Delete and redesign.

## Anti-references (do not converge on)

- Dexscreener's visual identity (only its information density principle).
- Generic shadcn/Vercel template chrome (cards-everywhere, side-tab accents, untinted blacks, bouncy modals).
- BI-dashboard look (Datadog, Grafana, Mixpanel).
- Crypto-aesthetic gradients and "to the moon" copy.
- Confetti, emoji rain, scroll-jacking, hero-video backgrounds.

## Mobile posture

Mobile is a **first-class surface, not an afterthought.** 375px is the design baseline; if a screen reads *fine* on desktop but *squeezed* on 375px, it was designed wrong.

- Thumb zones > hero zones (bottom nav on mobile)
- 44×44 minimum tap targets on every interactive element
- Horizontal scroll for long lists with momentum
- Sticky filter bars where the user is scanning
- No hover-only affordances — touch must reveal the same information
- No giant hero sections — compact, data-first landing

## Surface map (priorities for any audit pass)

1. `/` — home (highest traffic, ISR-cached 30 min, hero + trending lists)
2. `/signals` — reference for chart polish + LIVE indicators + Tag Momentum heatmap
3. `/repo/[owner]/[name]` — repo detail (currently 500ing in production per memory `project_repo_detail_500`)
4. `/funding` — known stale-data surface; freshness chrome must be honest
5. `/skills`, `/mcp` — shipped 2026-05-10 (PRs #828, #829)
6. `/twitter` — LIVE feed chrome
7. `/admin/*` — operator surfaces, lower polish bar but still audit for blockers
8. `/compare` — per-repo accent-keyed columns
9. Public OG cards (`/api/og/*`) — per-repo / per-surface preview images

## Honest reliability state (2026-05-11 audit)

Of 16+ external data sources: 7 broken/degraded (bluesky, twitter Apify partial, top10-snapshot, funding-crunchbase / funding-x / funding-news 3d stale, solana-x402, mcp-usage), 9 working (github trending, reddit, hn, devto, lobsters, hf, arxiv, npm, producthunt). The product visibly reflects this — surfaces showing degraded sources must read "COLD" or similar honestly.

## What "ultra improve" means for this product

Not "more features" — fewer surfaces, sharper polish, honest data, fast scan-time. The audit pass exists to:
1. Strip generic-AI-template patterns (side-tab borders applied without color-keying, untinted neutrals, layout-property transitions).
2. Surface freshness-chrome lies (any hardcoded "FRESH · 1H" string is a defect).
3. Tighten typography hierarchy so the "what's moving?" answer reads in <3 seconds.
4. Mobile-first reflow checks at 375px on every surface that the user might land on from a Twitter share.
