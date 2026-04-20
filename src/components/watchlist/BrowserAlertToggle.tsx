"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  BROWSER_ALERTS_CHANGE_EVENT,
  readBrowserAlertsEnabled,
  writeBrowserAlertsEnabled,
} from "@/lib/browser-alerts";
import { cn } from "@/lib/utils";
import { toast, toastAlertError } from "@/lib/toast";

function getPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
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

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={unsupported}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-button)] text-xs font-medium min-h-[36px]",
          "border transition-colors duration-150",
          enabled
            ? "border-accent-green/40 bg-accent-green/10 text-accent-green"
            : blocked
              ? "border-accent-red/40 bg-accent-red/10 text-accent-red"
              : unsupported
                ? "border-border-primary bg-bg-card text-text-tertiary opacity-60 cursor-not-allowed"
                : "border-border-primary bg-bg-card text-text-secondary hover:border-text-tertiary",
        )}
      >
        {enabled ? <BellOff size={13} /> : <Bell size={13} />}
        {enabled
          ? "Browser alerts on"
          : blocked
            ? "Alerts blocked"
            : unsupported
              ? "Alerts unavailable"
              : "Enable alerts"}
      </button>
      <p className="text-[10px] text-text-tertiary">
        Open-tab browser notifications
      </p>
    </div>
  );
}
