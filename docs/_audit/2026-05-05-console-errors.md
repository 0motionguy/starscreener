---
last-verified: 2026-05-05
verified-by: claude
status: snapshot
audit: console-errors
---

# Build / static-gen warning + console.error audit

**Wave 4 hardening · AGN-803 · W4-H**

## Method

Ran `npm run build 2>&1 | grep -E "Warning|Error|⚠|TypeError" | head -100`
on branch `bot/frontend/AGN-522` (read-only). Build invocation:
`cross-env NODE_PATH=node_modules next build` (Next 15.5.15).

## Build outcome

- **Compiled successfully** in 4.4 min.
- **Failed at lint stage** with `Failed to compile.` on a single real ESLint
  error (see "Real errors" below).
- **Static page generation never ran.** All `console.error` /
  `console.warn` output that would normally surface during
  `generateStaticParams` / RSC pre-render — including the documented
  Recharts `width(-1)` warning — was therefore **not captured this run**.
  See "Recharts caveat" below.
- 1 third-party deprecation warning emitted before compile.

## Categorized counts

| Category | Count |
|---|---|
| React (hooks/exhaustive-deps) | 4 |
| Next.js (`no-img-element`) | 3 |
| Next.js / 3rd party (Sentry deprecation) | 1 |
| ESLint hygiene (`no-unused-vars`) | 41 |
| ESLint hygiene (unused `eslint-disable` directives) | 7 |
| Real errors (compile-blocking) | 1 |
| Recharts runtime warnings (this run) | 0 — see caveat |

Total `Warning:` lines: **53**. Total `Error:` lines: **1**.

## Real errors (compile-blocking)

| File | Line | Rule | Message |
|---|---|---|---|
| `src/app/og/route.tsx` | 35:53 | `react/jsx-no-comment-textnodes` | Comments inside children section of tag should be placed inside braces |

This single error is what halted the build before static-gen. Likely
a stray `//` or `/* */` inside JSX children that needs to be wrapped
in `{/* */}` braces. Fix priority: **P0** (blocks production build).

## React warnings (4)

All are `react-hooks/exhaustive-deps` — missing-dep warnings on memoized
hooks, not key/prop-type issues:

| File | Line | Hook | Missing dep |
|---|---|---|---|
| `src/components/reddit-trending/SubredditMindshareCanvas.tsx` | 720 | `useCallback` | `draggingId` |
| `src/components/reddit-trending/SubredditMindshareCanvas.tsx` | 733 | `useCallback` | `draggingId` |
| `src/components/reddit-trending/TopicMindshareCanvas.tsx` | 192 | `useMemo` | `groupRefs` |
| `src/components/terminal/BubbleMapCanvas.tsx` | 244 | `useMemo` | `groupRefs` |

Priority: **P2** — likely intentional (canvas refs / drag state are
mutable and often deliberately omitted), but each warrants an explicit
`// eslint-disable-next-line` with a one-line rationale or a stable-ref
pattern. Audit before silencing.

## Next.js warnings (3)

`@next/next/no-img-element` — raw `<img>` instead of `next/image`:

| File | Line |
|---|---|
| `src/app/skills/page.tsx` | 617 |
| `src/components/top10/Top10Page.tsx` | 1398 |
| (one more flagged via duplicate eslint-disable on `skills/page.tsx:615`) | — |

Priority: **P2** — perf nit (LCP / bandwidth), not a bug. Likely
intentional for external favicon-style URLs that don't fit `next/image`'s
remotePatterns. Should be migrated or explicitly silenced.

## Third-party warnings (1)

| Source | Message |
|---|---|
| `@sentry/nextjs` | `DEPRECATION WARNING: It is recommended renaming your sentry.client.config.ts file, or moving its content to instrumentation-client.ts. When using Turbopack sentry.client.config.ts will no longer work.` |

Priority: **P2** — Turbopack-only break. Project pins Turbopack for dev
(`npm run dev`), so this will eventually flip from warning to silent
breakage. Track behind the broader Sentry SDK migration.

## Recharts caveat (the documented `width(-1)` issue)

The brief flagged Recharts `width(-1) and height(-1) of chart should be
greater than 0` warnings as previously observed during prod build. **They
did not appear in this build run** because the build halted at lint
before `next build` reached the static-generation phase where
server-rendered Recharts charts emit those warnings. To capture them,
the lint error in `og/route.tsx` must be fixed first, then re-run the
build. Routes that historically trigger them (per memory):

- `/` (home Trending widget)
- `/twitter`
- pages embedding `<ResponsiveContainer>` without explicit width/height

This audit cannot enumerate them definitively until the build clears
lint. Acknowledged as out-of-scope for W4-H.

## ESLint hygiene noise (48)

41 `@typescript-eslint/no-unused-vars` + 7 stale `eslint-disable`
directives. These are pure linter noise (not console output). Includes
imports left after refactor, dead destructure variables, and
`eslint-disable` lines whose underlying rule no longer fires. Not a
priority for W4-H (which targets runtime / static-gen console noise),
but flagged here for a future hygiene sweep.

Heaviest offenders:
- `src/app/api/og/star-activity/route.tsx` (3 unused locals)
- `src/components/top10/Top10Page.tsx` (3 unused locals)
- `src/app/api/pipeline/__tests__/deltas-route.test.ts` (4)

## Recommended priority for fixes

| Priority | Item | Rationale |
|---|---|---|
| **P0** | `og/route.tsx:35` JSX-comment error | Blocks production build |
| **P1** | Re-run build after P0 lands → capture Recharts warnings | Cannot complete W4-H scope until then |
| **P2** | 4 react-hooks/exhaustive-deps warnings | Audit each — silence or fix with rationale |
| **P2** | Sentry deprecation | Turbopack flip risk |
| **P2** | 3 raw `<img>` usages | LCP / bandwidth |
| **P3** | 48 unused-var / unused-disable lines | Pure hygiene, batch-able |

## Notes

- No `console.error` / `console.warn` patterns found in the captured
  build log — Next.js does not surface those until static-gen, which
  did not run.
- No "Each child in a list should have a unique key" warnings observed.
- No "Failed prop type" warnings observed.
- No `TypeError` runtime stack traces observed.

A follow-up audit should re-run after P0 lands, capturing the
static-gen phase explicitly with `next build 2>&1 | tee build.log` and
greping `build.log` for `Recharts`, `width(-1)`, `console.error`,
`console.warn`, and `TypeError`.
