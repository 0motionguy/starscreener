"use client";

import { useEffect, useState } from "react";
import type { PostHog } from "posthog-js";
// NOTE: type-only import is erased by SWC; no runtime cost.

interface PHContext {
  client: PostHog;
  Provider: React.ComponentType<{ client: PostHog; children: React.ReactNode }>;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<PHContext | null>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    let cancelled = false;
    let triggered = false;

    const load = async () => {
      if (cancelled || triggered) return;
      triggered = true;
      const [{ default: posthog }, { PostHogProvider: PHProvider }] = await Promise.all([
        import("posthog-js"),
        import("posthog-js/react"),
      ]);
      if (cancelled) return;
      if (!posthog.__loaded) {
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
          loaded: (i) => {
            i.register({ project: "trendingrepo", surface: "web" });
            if (process.env.NODE_ENV === "development") i.debug();
          },
        });
      }
      // Expose via window so legacy callers (funnel.ts) can capture without
      // importing posthog-js eagerly themselves.
      (window as unknown as { posthog?: PostHog }).posthog = posthog;
      setCtx({ client: posthog, Provider: PHProvider });
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

  // Render children unwrapped while client is null. The PHProvider wrapper
  // is only required when callers use posthog-js/react's hooks; our
  // imperative captures (funnel.ts via window.posthog) work without it.
  if (!ctx) return <>{children}</>;
  const Provider = ctx.Provider;
  return <Provider client={ctx.client}>{children}</Provider>;
}
