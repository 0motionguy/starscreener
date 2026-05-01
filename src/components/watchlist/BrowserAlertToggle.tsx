"use client";

// V4 — BrowserAlertToggle (W10-B migration).
//
// Browser-notification opt-in pill rendered alongside alert rule lists.
// Behavior is unchanged from the V3 version (notification permission flow,
// localStorage persistence, BROWSER_ALERTS_CHANGE_EVENT broadcast); only
// chrome moved from V3 token aliases (border-primary / accent-green / …)
// to V4 inline styles using `var(--v4-*)` so the pill matches the W10 alert
// surfaces (PageHead → SectionHead → AlertTriggerCard rail).

import { useEffect, useState, type CSSProperties } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  BROWSER_ALERTS_CHANGE_EVENT,
  readBrowserAlertsEnabled,
  writeBrowserAlertsEnabled,
} from "@/lib/browser-alerts";
import { toast, toastAlertError } from "@/lib/toast";

function getPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

type ToggleState = "on" | "blocked" | "unsupported" | "off";

function toneStyle(state: ToggleState): CSSProperties {
  // Visual state vocabulary maps to the V4 token palette:
  //   on         → money (positive — alerts armed)
  //   blocked    → red (browser-denied permission)
  //   unsupported→ ink-300 muted disabled chrome
  //   off        → neutral default
  switch (state) {
    case "on":
      return {
        borderColor: "var(--v4-money)",
        background: "var(--v4-money-soft)",
        color: "var(--v4-money)",
      };
    case "blocked":
      return {
        borderColor: "var(--v4-red)",
        background: "var(--v4-red-soft)",
        color: "var(--v4-red)",
      };
    case "unsupported":
      return {
        borderColor: "var(--v4-line-200)",
        background: "var(--v4-bg-050)",
        color: "var(--v4-ink-300)",
        opacity: 0.6,
        cursor: "not-allowed",
      };
    case "off":
    default:
      return {
        borderColor: "var(--v4-line-200)",
        background: "var(--v4-bg-050)",
        color: "var(--v4-ink-200)",
      };
  }
}

export function BrowserAlertToggle() {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setEnabled(readBrowserAlertsEnabled(window.localStorage));
    setPermission(getPermission());
  }, []);

  const unsupported = permission === "unsupported";
  const blocked = permission === "denied";

  const sync = (nextEnabled: boolean) => {
    if (typeof window === "undefined") return;
    writeBrowserAlertsEnabled(window.localStorage, nextEnabled);
    setEnabled(nextEnabled);
    setPermission(getPermission());
    window.dispatchEvent(new Event(BROWSER_ALERTS_CHANGE_EVENT));
  };

  const handleClick = async () => {
    if (typeof window === "undefined" || unsupported) return;

    if (enabled) {
      sync(false);
      return;
    }

    let nextPermission = getPermission();
    if (nextPermission !== "granted") {
      nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
    }

    if (nextPermission !== "granted") {
      toastAlertError(
        nextPermission === "denied"
          ? "Browser notifications are blocked"
          : "Notification permission not granted",
      );
      sync(false);
      return;
    }

    sync(true);
    toast.success("Browser alerts enabled");
  };

  const state: ToggleState = enabled
    ? "on"
    : blocked
      ? "blocked"
      : unsupported
        ? "unsupported"
        : "off";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
      }}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={unsupported}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          minHeight: 32,
          border: "1px solid",
          borderRadius: 2,
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          cursor: unsupported ? "not-allowed" : "pointer",
          transition: "border-color 150ms ease, background 150ms ease",
          ...toneStyle(state),
        }}
      >
        {enabled ? <BellOff size={12} /> : <Bell size={12} />}
        {enabled
          ? "Browser alerts on"
          : blocked
            ? "Alerts blocked"
            : unsupported
              ? "Alerts unavailable"
              : "Enable alerts"}
      </button>
      <p
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          color: "var(--v4-ink-300)",
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Open-tab browser notifications
      </p>
    </div>
  );
}
