"use client";

// Pipes Next.js Web Vitals (CLS / LCP / FID / INP / FCP / TTFB) into PostHog
// so the same Core Web Vitals appear next to funnel events in the explorer.
// Mounts once inside the <PostHogProvider> in src/app/layout.tsx.
//
// Consent posture: we DO NOT initialize PostHog from this component. If the
// PostHogProvider hasn't already called `posthog.init` (no NEXT_PUBLIC_POSTHOG_KEY,
// or consent gate elsewhere), `posthog.__loaded` stays false and we silently
// drop the metric. Vercel's own /_vercel/insights pipeline (OBS-1) keeps
// running independently regardless.
//
// Event shape: 'web_vital' with properties { name, value, id, rating?,
// delta?, navigation_type?, path }. Matches the AC for AGN-850.

import { useReportWebVitals } from "next/web-vitals";
import posthog from "posthog-js";

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    // Bail if PostHog has not been initialized (no key, or consent gate
    // elsewhere has not initialized it yet). Avoids spinning up the SDK
    // just to send a vital, and respects existing consent posture.
    if (!posthog.__loaded) return;

    try {
      posthog.capture("web_vital", {
        name: metric.name,
        value: metric.value,
        id: metric.id,
        rating: (metric as { rating?: string }).rating,
        delta: metric.delta,
        navigation_type: (metric as { navigationType?: string }).navigationType,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      });
    } catch {
      // analytics failure must never throw upstream
    }
  });

  return null;
}
