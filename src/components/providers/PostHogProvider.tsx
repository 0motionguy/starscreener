"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
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
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
