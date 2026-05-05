"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { WebVitalsReporter } from "@/components/providers/WebVitalsReporter";

const PostHogProviderDeferred = dynamic(
  () =>
    import("@/components/providers/PostHogProvider").then(
      (mod) => mod.PostHogProvider,
    ),
  { ssr: false },
);

const BrowserAlertBridgeDeferred = dynamic(
  () =>
    import("@/components/alerts/BrowserAlertBridge").then(
      (mod) => mod.BrowserAlertBridge,
    ),
  { ssr: false },
);

const BrowserTabLiveCounterDeferred = dynamic(
  () =>
    import("@/components/layout/BrowserTabLiveCounter").then(
      (mod) => mod.BrowserTabLiveCounter,
    ),
  { ssr: false },
);

const CookieConsentBannerDeferred = dynamic(
  () =>
    import("@/components/layout/CookieConsentBanner").then(
      (mod) => mod.CookieConsentBanner,
    ),
  { ssr: false },
);

interface ClientDeferredProvidersProps {
  children: React.ReactNode;
}

export function ClientDeferredProviders({
  children,
}: ClientDeferredProvidersProps) {
  const [posthogIdleReady, setPosthogIdleReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const win = window as Window & typeof globalThis;
    const start = () => {
      if (!cancelled) setPosthogIdleReady(true);
    };

    if ("requestIdleCallback" in win) {
      const idleId = win.requestIdleCallback(start, { timeout: 2500 });
      return () => {
        cancelled = true;
        win.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = globalThis.setTimeout(start, 800);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <>
      <WebVitalsReporter />
      {posthogIdleReady ? (
        <PostHogProviderDeferred>{children}</PostHogProviderDeferred>
      ) : (
        children
      )}
      <BrowserAlertBridgeDeferred />
      <BrowserTabLiveCounterDeferred />
      <CookieConsentBannerDeferred />
    </>
  );
}

