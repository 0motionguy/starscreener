"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BROWSER_ALERTS_CHANGE_EVENT,
  buildBrowserAlertBody,
  buildBrowserAlertTitle,
  getNewAlertEvents,
  mergeSeenAlertIds,
  readBrowserAlertsEnabled,
  readSeenAlertIds,
  writeSeenAlertIds,
} from "@/lib/browser-alerts";
import type { AlertEvent } from "@/lib/pipeline/types";

interface AlertsResponse {
  ok: boolean;
  events?: AlertEvent[];
}

const USER_ID = "local";
const POLL_INTERVAL_MS = 30_000;

function getNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export function BrowserAlertBridge() {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const primedRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromStorage = () => {
      setEnabled(readBrowserAlertsEnabled(window.localStorage));
      setPermission(getNotificationPermission());
      seenIdsRef.current = new Set(readSeenAlertIds(window.localStorage));
    };

    syncFromStorage();

    const onStorage = (event: Event) => {
      const storageEvent = event as StorageEvent;
      if (
        storageEvent.type === "storage" &&
        storageEvent.key &&
        ![
          "starscreener-browser-alerts-enabled",
          "starscreener-browser-alerts-seen",
        ].includes(storageEvent.key)
      ) {
        return;
      }
      syncFromStorage();
    };

    window.addEventListener(BROWSER_ALERTS_CHANGE_EVENT, onStorage);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", syncFromStorage);

    return () => {
      window.removeEventListener(BROWSER_ALERTS_CHANGE_EVENT, onStorage);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", syncFromStorage);
    };
  }, []);

  const pollAlerts = useCallback(async (primeOnly: boolean) => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/pipeline/alerts?userId=${encodeURIComponent(USER_ID)}&unreadOnly=true`,
        {
          cache: "no-store",
        },
      );
      if (!res.ok) return;

      const data = (await res.json()) as AlertsResponse;
      const events = Array.isArray(data.events) ? data.events : [];
      const fresh = getNewAlertEvents(events, seenIdsRef.current);

      if (!primeOnly) {
        for (const event of fresh.reverse()) {
          const notification = new Notification(
            buildBrowserAlertTitle(event),
            {
              body: buildBrowserAlertBody(event),
              icon: "/apple-touch-icon.svg",
              tag: event.id,
            },
          );
          notification.onclick = () => {
            window.focus();
            window.location.assign(event.url);
            notification.close();
          };
        }
      }

      const mergedSeen = mergeSeenAlertIds(
        Array.from(seenIdsRef.current),
        events.map((event) => event.id),
      );
      seenIdsRef.current = new Set(mergedSeen);
      writeSeenAlertIds(window.localStorage, mergedSeen);
    } catch (err) {
      console.error("[browser-alerts] poll failed", err);
    }
  }, []);

  useEffect(() => {
    if (!enabled || permission !== "granted") return;

    let cancelled = false;

    const prime = async () => {
      if (primedRef.current) return;
      await pollAlerts(true);
      if (!cancelled) primedRef.current = true;
    };

    void prime();

    const intervalId = window.setInterval(() => {
      void pollAlerts(false);
    }, POLL_INTERVAL_MS);

    const onFocus = () => {
      if (document.hidden) return;
      void pollAlerts(false);
    };

    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, permission, pollAlerts]);

  return null;
}
