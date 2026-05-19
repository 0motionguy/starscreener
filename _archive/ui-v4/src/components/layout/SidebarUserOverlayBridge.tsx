"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
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

interface SidebarUserOverlayBridgeProps {
  enabled: boolean;
}

export function SidebarUserOverlayBridge({
  enabled,
}: SidebarUserOverlayBridgeProps) {
  if (!enabled) return null;
  return <SidebarUserOverlayBridgeInner />;
}

function SidebarUserOverlayBridgeInner() {
  const { isLoaded, userId } = useAuth();
  const setOverlay = useSidebarOverlayStore((s) => s.setOverlay);
  const reset = useSidebarOverlayStore((s) => s.reset);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!userId) {
      reset();
      return;
    }

    let cancelled = false;

    const params = new URLSearchParams({ userId });
    fetch(`/api/pipeline/sidebar-overlay?${params.toString()}`, {
      credentials: "include",
    })
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
  }, [isLoaded, reset, setOverlay, userId]);

  return null;
}
