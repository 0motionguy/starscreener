"use client";

import { useEffect, type ReactNode } from "react";
import { flushPendingFunnelSteps } from "@/lib/analytics/funnel";
import type { BrowserPostHogClient } from "@/lib/analytics/posthog-client";
import { resolvePublicPostHogConfig } from "@/lib/analytics/posthog-config";
import {
  CONSENT_CHANGED_EVENT,
  hasAnalyticsConsent,
  type ConsentState,
} from "@/lib/consent/cookie";
// NOTE: type-only import is erased by SWC; no runtime cost.

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const { key, host } = resolvePublicPostHogConfig({
      NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      NEXT_PUBLIC_POSTHOG_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_TOKEN,
      NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    });
    if (!key) return;

    // S3.5.C — GDPR / CCPA gate. PostHog never loads until the user has
    // actively granted analytics consent via the ConsentBanner. The
    // banner dispatches `trendingrepo:consent-changed` so we can flip
    // into the live state without a page reload when they accept.
    let cancelled = false;
    let triggered = false;
    let listeningForConsent = false;

    const load = async () => {
      if (cancelled || triggered) return;
      triggered = true;
      const { default: posthog } = await import("posthog-js/dist/module.slim");
      if (cancelled) return;
      if (!posthog.__loaded) {
        posthog.init(key, {
          api_host: host,
          defaults: "2026-01-30",
          capture_pageview: false,
          capture_pageleave: true,
          autocapture: false,
          capture_performance: false,
          person_profiles: "identified_only",
          // Keep PostHog to explicit analytics only. Pageviews are captured by
          // PostHogPageviewBridge, and funnels are wired by
          // captureFunnelStep/FunnelMount/TrackedExternalLink, so the app does
          // not need the survey, flag, product-tour, web-vitals, dead-click,
          // exception, history-autocapture, or recording extension bundles.
          disable_session_recording: true,
          disable_surveys: true,
          disable_surveys_automatic_display: true,
          disable_web_experiments: true,
          disable_product_tours: true,
          disable_conversations: true,
          disable_external_dependency_loading: true,
          advanced_disable_feature_flags: true,
          advanced_disable_toolbar_metrics: true,
          loaded: (i) => {
            i.register({ project: "trendingrepo", surface: "web" });
            if (process.env.NODE_ENV === "development") i.debug();
          },
        });
      }
      // Expose via window so legacy callers (funnel.ts) can capture without
      // importing posthog-js eagerly themselves.
      (window as unknown as { posthog?: BrowserPostHogClient }).posthog = posthog;
      flushPendingFunnelSteps();
      window.dispatchEvent(new Event("trendingrepo:posthog-ready"));
    };

    // Idle / interaction triggers — guarded by the consent gate inside
    // `loadIfConsented` so they fire-once but don't actually load
    // posthog until consent is in place.
    type IdleHandle = number;
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => IdleHandle;
    }).requestIdleCallback;
    let idleId: IdleHandle | null = null;

    const events = ["pointerdown", "keydown", "scroll"] as const;
    const onInteract = () => void loadIfConsented();

    function loadIfConsented() {
      if (cancelled || triggered) return;
      if (!hasAnalyticsConsent()) {
        // Subscribe (once) to the consent-changed event so we can flip
        // into the live state as soon as the user accepts.
        if (!listeningForConsent) {
          listeningForConsent = true;
          window.addEventListener(
            CONSENT_CHANGED_EVENT,
            onConsentChanged as EventListener,
            { once: true },
          );
        }
        return;
      }
      void load();
    }

    function onConsentChanged(event: CustomEvent<ConsentState>) {
      listeningForConsent = false;
      if (cancelled) return;
      if (event.detail.analytics) {
        void load();
      }
    }

    if (ric) {
      idleId = ric(() => loadIfConsented(), { timeout: 3000 });
    } else {
      idleId = window.setTimeout(loadIfConsented, 1500) as unknown as IdleHandle;
    }
    events.forEach((e) =>
      window.addEventListener(e, onInteract, { once: true, passive: true }),
    );

    return () => {
      cancelled = true;
      const cancelIdle = (window as unknown as { cancelIdleCallback?: (h: IdleHandle) => void }).cancelIdleCallback;
      if (cancelIdle && idleId !== null) cancelIdle(idleId);
      else if (idleId !== null) clearTimeout(idleId as unknown as number);
      events.forEach((e) => window.removeEventListener(e, onInteract));
      if (listeningForConsent) {
        window.removeEventListener(
          CONSENT_CHANGED_EVENT,
          onConsentChanged as EventListener,
        );
      }
    };
  }, []);

  return <>{children}</>;
}
