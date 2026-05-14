"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getLoadedBrowserPostHog } from "@/lib/analytics/posthog-client";

export function PostHogPageviewBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastCapturedUrlRef = useRef<string | null>(null);

  const pageKey = useMemo(() => {
    if (!pathname) return null;
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!pageKey) return;

    const capturePageview = () => {
      const posthog = getLoadedBrowserPostHog();
      if (!posthog) return;

      const url = new URL(pageKey, window.location.origin).toString();
      if (lastCapturedUrlRef.current === url) return;

      lastCapturedUrlRef.current = url;
      posthog.capture("$pageview", {
        $current_url: url,
        project: "trendingrepo",
        surface: "web",
      });
    };

    if (getLoadedBrowserPostHog()) {
      capturePageview();
      return;
    }

    window.addEventListener("trendingrepo:posthog-ready", capturePageview, {
      once: true,
    });
    return () => {
      window.removeEventListener("trendingrepo:posthog-ready", capturePageview);
    };
  }, [pageKey]);

  return null;
}
