// AGN-848 — Client-side PostHog funnel helper.
//
// Wraps `posthog-js` so call sites emit a single event shape
// (`funnel_step`) without reaching for the SDK directly. PostHog is
// initialised by `<PostHogProvider>` (src/components/providers); when
// `NEXT_PUBLIC_POSTHOG_KEY` is unset the SDK never loads and every
// capture here becomes a no-op.
//
// All funnels documented in `docs/POSTHOG-FUNNELS.md`. Add a new flow
// there before adding capture calls so the dashboard side stays in sync
// with what the client emits.
//
// Contract:
//   - Pure side-effect, fire-and-forget. Never throws.
//   - Server-rendered code paths are guarded via the `typeof window`
//     check so accidental imports from a Server Component do not blow
//     up the build.
//   - Properties are flat key/value pairs — PostHog funnels filter on
//     property equality, so nested objects defeat the dashboard.

"use client";

import type { PostHog } from "posthog-js";

/**
 * Runtime accessor for the PostHog SDK. The SDK is dynamically loaded by
 * `<PostHogProvider>` (idle / first-interaction) and exposed on
 * `window.posthog` once initialised. We never eagerly import `posthog-js`
 * here — that would defeat the lazy-load and pull ~50kb gzip into every
 * client bundle that calls `captureFunnelStep`.
 *
 * Returns `null` while the SDK is dormant (server-render, before idle,
 * or when `NEXT_PUBLIC_POSTHOG_KEY` is unset and the provider bailed).
 */
function getPosthog(): PostHog | null {
  if (typeof window === "undefined") return null;
  const ph = (window as unknown as { posthog?: PostHog }).posthog;
  return ph?.__loaded ? ph : null;
}

/**
 * Canonical funnel identifiers. Keep this list authoritative — the
 * PostHog dashboard funnels filter on `flow=...` exact match, and a
 * stray string here means a funnel quietly stops counting.
 *
 * 1. `discover-repo`     home -> search -> repo-detail -> github click
 * 2. `top10-discover`    home -> /top10 -> repo-detail -> github click
 * 3. `watchlist-add`     repo-detail -> watchlist add
 * 4. `submit-repo`       /submit open -> form fill -> submit success
 */
export type FunnelFlow =
  | "discover-repo"
  | "top10-discover"
  | "watchlist-add"
  | "submit-repo";

/**
 * Canonical step identifiers. Listed centrally so any regression in
 * call-site naming surfaces as a TypeScript error rather than silently
 * fragmenting the dashboard counts.
 */
export type FunnelStep =
  // entry / discovery
  | "home_view"
  | "search_query"
  | "search_result_select"
  | "top10_view"
  | "repo_view"
  | "github_click"
  // watchlist
  | "watchlist_add"
  // submit
  | "submit_open"
  | "submit_fill"
  | "submit_success";

interface FunnelStepProps {
  step: FunnelStep;
  flow: FunnelFlow;
  /** Optional flat properties — repo full name, query length, etc. */
  [key: string]: string | number | boolean | undefined;
}

/**
 * Emit a single funnel step. Safe to call from any client component.
 * No-ops when:
 *   - running on the server (typeof window === "undefined")
 *   - PostHog SDK was never initialised (NEXT_PUBLIC_POSTHOG_KEY unset)
 */
export function captureFunnelStep(props: FunnelStepProps): void {
  try {
    // getPosthog() short-circuits to null on the server, before the
    // lazy-loaded SDK has finished initialising, or when the provider
    // bailed out (NEXT_PUBLIC_POSTHOG_KEY unset). Skipping when the
    // SDK is dormant avoids accidental queueing in preview / local-dev
    // builds without analytics provisioned.
    getPosthog()?.capture("funnel_step", props);
  } catch {
    // Analytics must never throw upstream.
  }
}
