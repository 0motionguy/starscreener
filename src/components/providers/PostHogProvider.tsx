"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

const CONSENT_KEY = "trendingrepo-cookie-consent-v1";
const CONSENT_EVENT = "trendingrepo:cookie-consent-changed";
const WEB_VITAL_NAMES = new Set(["CLS", "LCP", "FID", "INP"]);

function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CONSENT_KEY) === "accepted";
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useReportWebVitals((metric) => {
    if (!WEB_VITAL_NAMES.has(metric.name)) return;
    posthog.capture("web-vital", {
      metric_name: metric.name,
      metric_value: metric.value,
      metric_delta: metric.delta,
      metric_id: metric.id,
      metric_rating: metric.rating,
      metric_navigation_type: metric.navigationType,
    });
  });

  useEffect(() => {
    const syncConsent = () => {
      if (hasAnalyticsConsent()) {
        posthog.opt_in_capturing();
      } else {
        posthog.opt_out_capturing();
      }
    };

    window.addEventListener(CONSENT_EVENT, syncConsent);

    if (!hasAnalyticsConsent()) {
      posthog.opt_out_capturing();
      return () => {
        window.removeEventListener(CONSENT_EVENT, syncConsent);
      };
    }

    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) {
      return () => {
        window.removeEventListener(CONSENT_EVENT, syncConsent);
      };
    }
    if (posthog.__loaded) {
      syncConsent();
      return () => {
        window.removeEventListener(CONSENT_EVENT, syncConsent);
      };
    }

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: "history_change",
      capture_pageleave: true,
      person_profiles: "identified_only",
      // Skip the session-recording chunk on every page. Replay-on-error
      // is already gated by the Sentry replay flag (Phase 1 perf work);
      // PostHog recording isn't wired into any internal review surface
      // today. Flip back to false if a future analyst wants session
      // replay.
      disable_session_recording: true,
      loaded: (ph) => {
        ph.register({ project: "trendingrepo", surface: "web" });
        syncConsent();
        if (process.env.NODE_ENV === "development") ph.debug();
      },
    });

    return () => {
      window.removeEventListener(CONSENT_EVENT, syncConsent);
    };
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
