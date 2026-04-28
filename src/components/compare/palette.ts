// Single source of truth for the 4-slot compare palette. Banner accents,
// chart strokes, repo-profile column headers, and heatmap series all index
// into the same slot, so swapping or extending the palette stays in one
// place. Resolves to `var(--color-series-N)` so theme overrides flow
// through automatically.
export const COMPARE_PALETTE: readonly string[] = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
];

export const COMPARE_MAX_SLOTS = 4;
