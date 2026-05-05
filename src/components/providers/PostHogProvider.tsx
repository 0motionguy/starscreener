"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { CONSENT_CHANGED_EVENT, readConsent } from "@/lib/consent";

// Lazily initialise posthog-js only after the user has accepted
// analytics via the consent banner (AGN-840). Before consent we
// never call posthog.init, so no network calls or cookies are set.
// Re-runs on the consent-changed event so accepting the banner
// fires the SDK without a page reload.
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    function syncConsent() {
      setHasConsent(readConsent()?.analytics === true);
    }
    syncConsent();
    window.addEventListener(CONSENT_CHANGED_EVENT, syncConsent);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, syncConsent);
  }, []);

  useEffect(() => {
    if (!hasConsent) return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    if (posthog.__loaded) return;

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
        if (process.env.NODE_ENV === "development") ph.debug();
      },
    });
  }, [hasConsent]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
