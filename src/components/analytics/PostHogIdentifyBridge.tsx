"use client";

import { useEffect } from "react";

import { useClientSession } from "@/lib/hooks/useClientSession";
import { getLoadedBrowserPostHog } from "@/lib/analytics/posthog-client";

export function PostHogIdentifyBridge() {
  const { loaded, userId } = useClientSession();

  useEffect(() => {
    if (!loaded || !userId) return;

    const identify = () => {
      getLoadedBrowserPostHog()?.identify(userId, {
        project: "trendingrepo",
        surface: "web",
      });
    };

    if (getLoadedBrowserPostHog()) {
      identify();
      return;
    }

    window.addEventListener("trendingrepo:posthog-ready", identify, {
      once: true,
    });
    return () => {
      window.removeEventListener("trendingrepo:posthog-ready", identify);
    };
  }, [loaded, userId]);

  return null;
}
