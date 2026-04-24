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

const POLL_INTERVAL_MS = 30_000;

/**
 * Best-effort session bootstrap. /api/pipeline/alerts now derives the
 * caller's userId from an HMAC-signed ss_user cookie issued by
 * /api/auth/session. In dev with SESSION_SECRET unset the session route
 * returns a dev-fallback identity ("local") without setting a cookie, and
 * the alerts endpoint's dev-fallback path covers us.
 */
async function ensureSessionCookie(): Promise<void> {
  try {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    // Non-fatal; the alerts poll below will just 401 and we skip delivering
    // notifications this cycle.
  }
}

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
        "/api/pipeline/alerts?unreadOnly=true",
        {
          cache: "no-store",
          credentials: "include",
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
      // Make sure the ss_user cookie exists before polling alerts — without
      // it, every /api/pipeline/alerts call will 401 in production.
      await ensureSessionCookie();
      if (cancelled) return;
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
