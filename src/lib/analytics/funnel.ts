// AGN-848 — Client-side PostHog funnel helper.
//
// Wraps `posthog-js` so call sites emit a single event shape
// (`funnel_step`) without reaching for the SDK directly. PostHog is
// initialised by `<PostHogProvider>` (src/components/providers); when
// no public PostHog token is set the SDK never loads and every
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

import { getLoadedBrowserPostHog, type BrowserPostHogClient } from "@/lib/analytics/posthog-client";

const MAX_PENDING_FUNNEL_STEPS = 50;
const pendingFunnelSteps: FunnelStepProps[] = [];

/**
 * Runtime accessor for the PostHog SDK. The SDK is dynamically loaded by
 * `<PostHogProvider>` (idle / first-interaction) and exposed on
 * `window.posthog` once initialised. We never eagerly import `posthog-js`
 * here — that would defeat the lazy-load and pull ~50kb gzip into every
 * client bundle that calls `captureFunnelStep`.
 *
 * Returns `null` while the SDK is dormant (server-render, before idle,
 * or when no public PostHog token is set and the provider bailed).
 */
function getPosthog(): BrowserPostHogClient | null {
  return getLoadedBrowserPostHog();
}

function enqueueFunnelStep(props: FunnelStepProps): void {
  if (pendingFunnelSteps.length >= MAX_PENDING_FUNNEL_STEPS) {
    pendingFunnelSteps.shift();
  }
  pendingFunnelSteps.push(props);
}

/**
 * Canonical funnel identifiers. Keep this list authoritative — the
 * PostHog dashboard funnels filter on `flow=...` exact match, and a
 * stray string here means a funnel quietly stops counting.
 *
 * 1. `discover-repo`     home -> search -> repo-detail -> github click
 * 2. `top10-discover`    home -> /top10 -> repo-detail -> github click
 * 3. `watchlist-add`     repo-detail -> watchlist add
 * 4. `compare-add`       repo-detail -> compare add -> /compare
 * 5. `submit-repo`       /submit open -> form fill -> submit success
 * 6. `revenue-claim`     repo-detail/direct -> claim revenue form -> submit success
 * 7. `account-auth`      header account CTA -> hosted auth -> webhook success
 */
export type FunnelFlow =
  | "discover-repo"
  | "top10-discover"
  | "watchlist-add"
  | "compare-add"
  | "submit-repo"
  | "revenue-claim"
  | "account-auth";

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
  // compare
  | "compare_add"
  | "compare_view"
  // submit
  | "submit_open"
  | "submit_fill"
  | "submit_success"
  // revenue claim
  | "revenue_claim_open"
  | "revenue_claim_submit_success"
  // account auth
  | "account_cta_click"
  | "sign_in_view"
  | "sign_up_view"
  | "sign_in_success"
  | "sign_up_success";

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
 *   - PostHog SDK was never initialised (no public PostHog token)
 */
export function captureFunnelStep(props: FunnelStepProps): void {
  try {
    const posthog = getPosthog();
    if (posthog) {
      posthog.capture("funnel_step", props);
      return;
    }
    enqueueFunnelStep(props);
  } catch {
    // Analytics must never throw upstream.
  }
}

export function flushPendingFunnelSteps(): void {
  const posthog = getPosthog();
  if (!posthog || pendingFunnelSteps.length === 0) return;

  const steps = pendingFunnelSteps.splice(0, pendingFunnelSteps.length);
  for (const props of steps) {
    try {
      posthog.capture("funnel_step", props);
    } catch {
      // Analytics must never throw upstream.
    }
  }
}
