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

import posthog from "posthog-js";

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
  if (typeof window === "undefined") return;
  try {
    // posthog.__loaded is set by posthog-js once init() resolves.
    // Skipping when the SDK is dormant avoids accidental queueing in
    // preview / local-dev builds without analytics provisioned.
    if (!posthog.__loaded) return;
    posthog.capture("funnel_step", props);
  } catch {
    // Analytics must never throw upstream.
  }
}
