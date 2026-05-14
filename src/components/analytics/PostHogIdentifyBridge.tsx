"use client";

import { useEffect } from "react";
import type { PostHog } from "posthog-js";

import { useClientSession } from "@/components/layout/useClientSession";

function getLoadedPostHog(): PostHog | null {
  if (typeof window === "undefined") return null;
  const posthog = (window as unknown as { posthog?: PostHog }).posthog;
  return posthog?.__loaded ? posthog : null;
}

export function PostHogIdentifyBridge() {
  const { loaded, userId } = useClientSession();

  useEffect(() => {
    if (!loaded || !userId) return;

    const identify = () => {
      getLoadedPostHog()?.identify(userId, {
        project: "trendingrepo",
        surface: "web",
      });
    };

    if (getLoadedPostHog()) {
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
