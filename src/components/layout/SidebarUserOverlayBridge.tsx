"use client";

import { useEffect } from "react";
import { create } from "zustand";

interface SidebarOverlayState {
  unreadAlerts: number;
  loaded: boolean;
  setOverlay: (value: { unreadAlerts: number }) => void;
  reset: () => void;
}

/**
 * Transient, non-persisted sidebar overlay data. The root sidebar shell is
 * anonymous-safe; this bridge fills in user-specific counts after hydration.
 */
export const useSidebarOverlayStore = create<SidebarOverlayState>((set) => ({
  unreadAlerts: 0,
  loaded: false,
  setOverlay: ({ unreadAlerts }) => set({ unreadAlerts, loaded: true }),
  reset: () => set({ unreadAlerts: 0, loaded: false }),
}));

interface OverlayResponse {
  unreadAlerts?: number;
}

const CLERK_PUBLIC_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function SidebarUserOverlayBridge() {
  if (!CLERK_PUBLIC_KEY) return null;
  return <SidebarUserOverlayBridgeInner />;
}

function SidebarUserOverlayBridgeInner() {
  const setOverlay = useSidebarOverlayStore((s) => s.setOverlay);
  const reset = useSidebarOverlayStore((s) => s.reset);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/pipeline/sidebar-overlay", { credentials: "include" })
      .then((response) =>
        response.ok ? (response.json() as Promise<OverlayResponse>) : null,
      )
      .then((json) => {
        if (cancelled) return;
        if (json) {
          setOverlay({ unreadAlerts: json.unreadAlerts ?? 0 });
        } else {
          reset();
        }
      })
      .catch(() => {
        // Non-critical chrome: anonymous and failed auth keep zero unread alerts.
      });

    return () => {
      cancelled = true;
    };
  }, [setOverlay, reset]);

  return null;
}
