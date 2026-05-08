// Canonical number / time format helpers.
//
// Consolidates the ~17 inline `compactNumber` definitions and ~10 inline
// `formatRelative` / `ageLabel` definitions scattered across the codebase
// (see audit notes — `og-primitives.tsx`, `signals/page.tsx`,
// `news/newsTopMetrics.ts`, dozens of page.tsx files). Existing call sites
// keep their local copies for now; new code (and incremental refactors)
// should import from here.
//
// Output style follows the most-used variant in the codebase:
//   - compactNumber: "12.3k", "823", "1.2M" (lowercase k, capital M)
//   - formatRelativeTime: "12s ago", "5m ago", "3h ago", "12d ago"

/**
 * Compact number formatter.
 *
 *   compactNumber(823)        → "823"
 *   compactNumber(1234)       → "1.2k"
 *   compactNumber(12_345)     → "12k"
 *   compactNumber(1_234_567)  → "1.2M"
 *   compactNumber(NaN)        → "—"
 */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs < 1000) return n.toString();
  if (abs < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (abs < 1_000_000) return `${Math.round(n / 1000)}k`;
  if (abs < 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1_000_000)}M`;
}

/**
 * Relative-time formatter for ISO-8601 inputs.
 *
 *   formatRelativeTime(null)               → "—"
 *   formatRelativeTime(<future iso>)       → "just now"
 *   formatRelativeTime(<-30s ago>)         → "30s ago"
 *   formatRelativeTime(<-7m ago>)          → "7m ago"
 *   formatRelativeTime(<-3h ago>)          → "3h ago"
 *   formatRelativeTime(<-5d ago>)          → "5d ago"
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/**
 * Locale-formatted full number ("12,345"). Use for dense metric tables
 * where the exact figure matters and the column is wide enough.
 */
export function formatLargeNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

/**
 * Alias for {@link compactNumber}. Kept for parity with call-sites that
 * use `formatNumber` semantically (e.g. KPI cards). Identical output.
 */
export const formatNumber = compactNumber;
