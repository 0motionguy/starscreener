"use client";

import { useEffect, type ReactNode } from "react";
import type { PostHog } from "posthog-js";
import { flushPendingFunnelSteps } from "@/lib/analytics/funnel";
import { resolvePublicPostHogConfig } from "@/lib/analytics/posthog-config";
// NOTE: type-only import is erased by SWC; no runtime cost.

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const { key, host } = resolvePublicPostHogConfig({
      NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      NEXT_PUBLIC_POSTHOG_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_TOKEN,
      NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    });
    if (!key) return;

    let cancelled = false;
    let triggered = false;

    const load = async () => {
      if (cancelled || triggered) return;
      triggered = true;
      const { default: posthog } = await import("posthog-js");
      if (cancelled) return;
      if (!posthog.__loaded) {
        posthog.init(key, {
          api_host: host,
          defaults: "2026-01-30",
          capture_pageview: "history_change",
          capture_pageleave: true,
          person_profiles: "identified_only",
          // Skip the session-recording chunk on every page. Replay-on-error
          // is already gated by the Sentry replay flag (Phase 1 perf work);
          // PostHog recording isn't wired into any internal review surface
          // today. Flip back to false if a future analyst wants session
          // replay.
          disable_session_recording: true,
          loaded: (i) => {
            i.register({ project: "trendingrepo", surface: "web" });
            if (process.env.NODE_ENV === "development") i.debug();
          },
        });
      }
      // Expose via window so legacy callers (funnel.ts) can capture without
      // importing posthog-js eagerly themselves.
      (window as unknown as { posthog?: PostHog }).posthog = posthog;
      flushPendingFunnelSteps();
      window.dispatchEvent(new Event("trendingrepo:posthog-ready"));
    };

    // Idle trigger
    type IdleHandle = number;
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => IdleHandle;
    }).requestIdleCallback;
    let idleId: IdleHandle | null = null;
    if (ric) {
      idleId = ric(() => void load(), { timeout: 3000 });
    } else {
      idleId = window.setTimeout(load, 1500) as unknown as IdleHandle;
    }

    // Interaction trigger
    const onInteract = () => void load();
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, onInteract, { once: true, passive: true }));

    return () => {
      cancelled = true;
      const cancelIdle = (window as unknown as { cancelIdleCallback?: (h: IdleHandle) => void }).cancelIdleCallback;
      if (cancelIdle && idleId !== null) cancelIdle(idleId);
      else if (idleId !== null) clearTimeout(idleId as unknown as number);
      events.forEach((e) => window.removeEventListener(e, onInteract));
    };
  }, []);

  return <>{children}</>;
}
