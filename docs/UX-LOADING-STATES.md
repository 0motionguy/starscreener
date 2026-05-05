# UX Loading States

This document defines the site-wide rule for choosing between
**skeletons** and **spinners** as loading affordances. The rule is binary;
edge cases are listed at the bottom.

## The Rule

| Situation | Affordance |
|-----------|------------|
| Above-the-fold list, table, card grid, chart, or detail page | **Skeleton** (preserves layout, no CLS) |
| Inline async action triggered by the user (submit, refresh, save, vote, copy-link, load-more) | **Spinner** (next to / inside the trigger button) |
| Lazy-loaded chart or panel below the fold | **Skeleton** of the same height |
| Tiny inline status (e.g., refresh icon recoloring) | Animate the existing icon — no separate spinner element |

### Why skeletons for content
Spinners on a content area discard the layout. The user sees a loading
indicator, then a layout snap when content arrives — Cumulative Layout
Shift, plus a perceived "slow" feel because the eye has nothing to
anchor on.

A skeleton with the same outer dimensions as the rendered content gives
the user a stable scaffold and reduces perceived latency.

### Why spinners for actions
Skeletons inside a button don't make sense — the button keeps its
existing label and just needs to communicate "I heard you, working on
it." A small spinner inside the button (replacing or beside the icon)
is the canonical pattern.

## Implementation primitives

### Route-level skeletons
Every route under `src/app/**` ships a `loading.tsx` that mirrors the
real page chrome. Most use the `animate-pulse` Tailwind utility on
solid blocks sized to match the upcoming content:

```tsx
// src/app/<route>/loading.tsx
export default function Loading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="animate-pulse space-y-4">
        {/* blocks shaped like the real page */}
      </div>
    </div>
  );
}
```

The root `src/app/loading.tsx` provides the global fallback (terminal
chrome + 10 row skeleton).

### Reusable component
`src/components/shared/Skeleton.tsx` exposes four variants that should
cover most ad-hoc placeholders:

```tsx
<Skeleton variant="card" count={6} />
<Skeleton variant="row" count={12} />
<Skeleton variant="chart" />
<Skeleton variant="detail" />
```

Use this when a route already has a `loading.tsx` but a sub-panel needs
its own placeholder (e.g., a lazy-loaded chart inside an interactive
client component).

### Inline action spinner
`lucide-react` ships `LoaderCircle` and `Loader2`. The convention is:

```tsx
<button disabled={busy}>
  {busy ? (
    <LoaderCircle className="size-4 animate-spin" aria-hidden />
  ) : (
    <Send className="size-4" aria-hidden />
  )}
  {busy ? "Sending…" : "Send"}
</button>
```

`size-4` for prose-line buttons, `size-3.5` for tight pill buttons,
`size-3` for icon-only chips. Always pair with `aria-hidden` since the
button label conveys the busy state.

### Refresh icons
For "refresh" buttons we keep the `RefreshCw` icon and add
`animate-spin` while busy:

```tsx
<RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
```

This avoids swapping element identity mid-animation.

## Site audit (2026-05-05)

Top 12 routes were audited against this rule. All conform.

| Route | Loading affordance | Status |
|-------|-------------------|--------|
| `/` | Root `loading.tsx` → `TerminalSkeleton` | conforms |
| `/repo/[owner]/[name]` | Skeleton (header + stats + chart + panel grid) | conforms |
| `/trending` (alias of `/`) | inherits root skeleton | conforms |
| `/signals` | Skeleton (head + ribbon + KPI band + 12 rank rows) | conforms |
| `/skills` | Skeleton (head + ribbon + KPI band + 12 rank rows) | conforms |
| `/top10` | Skeleton (head + ribbon + 10 rank rows) | conforms |
| `/categories` | Skeleton | conforms |
| `/collections` | Skeleton | conforms |
| `/agent-repos` | Skeleton | conforms |
| `/agent-commerce` | Skeleton | conforms |
| `/digest` | Skeleton | conforms |
| `/you` | Skeleton + PanelEmpty placeholders for hydration | conforms |

### Spinner usage audit
All `animate-spin` usages in the tree (`grep "animate-spin" src/`)
were verified to be inline action affordances on buttons or icon
swaps, not full-area loaders. None require refactoring.

Non-conforming patterns to **not** introduce in future PRs:

- A single centered spinner on a content area that takes more than ~80px of height. Use a skeleton sized to the expected content instead.
- A spinner that replaces a list while pagination loads. Use a skeleton row, or keep the existing list and append a spinner row at the bottom.
- A modal that shows a centered spinner before the form renders. Render the form scaffold immediately and disable inputs, with a small spinner near the relevant field.

## Edge cases

- **Polling refresh** (e.g., live trade tape): keep stale data visible, animate a small badge or icon. No skeleton — the user already has content to read.
- **Optimistic mutations** (vote, watchlist add): no spinner, no skeleton. Update the UI immediately and reconcile on response.
- **Cold-start lazy chart**: `next/dynamic` with `loading: () => <div className="skeleton-shimmer h-[160px]" />` is the canonical pattern (see `McpDownloadsSparklineLazy.tsx`).
- **Auth gate** before a page resolves: show the page skeleton, not a full-screen spinner. The router segment's `loading.tsx` already handles this.

## Reviewer checklist

When reviewing a PR that introduces a new loading state, ask:
1. Is this above-the-fold content? → must be a skeleton.
2. Is this a button or other tap target? → must be an inline spinner.
3. Does the placeholder match the post-load layout? → no large CLS.
4. Does the placeholder ship in `loading.tsx` or via the shared `Skeleton` component? → reuse over re-implementation.
