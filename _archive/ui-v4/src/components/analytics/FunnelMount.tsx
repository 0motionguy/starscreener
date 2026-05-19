"use client";

// AGN-848 — Tiny client component that fires a single `funnel_step` event
// on mount. Lets server components (home, /top10, /repo/[owner]/[name],
// /submit) participate in PostHog funnels without converting to client.
//
// Renders nothing. The capture is wrapped in `captureFunnelStep` so it
// no-ops when PostHog isn't loaded.

import { useEffect } from "react";

import {
  captureFunnelStep,
  type FunnelFlow,
  type FunnelStep,
} from "@/lib/analytics/funnel";

interface FunnelMountProps {
  step: FunnelStep;
  flow: FunnelFlow;
  /** Optional flat properties — e.g. repo full name on the detail page. */
  properties?: Record<string, string | number | boolean | undefined>;
}

export function FunnelMount({ step, flow, properties }: FunnelMountProps) {
  useEffect(() => {
    captureFunnelStep({ step, flow, ...(properties ?? {}) });
    // We deliberately fire-once-per-mount. A page navigating to itself
    // with different props (e.g. different repo) re-mounts the component,
    // so the dependency array can stay empty without dropping events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
