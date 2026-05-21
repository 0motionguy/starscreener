"use client";

// SidebarUserOverlayBridge — V6-compatible policy stub.
//
// Anonymous-safe shell loads first; this side-effect-only client
// component fills in user-specific sidebar counts after Clerk hydrates.
//
// Pattern (preserved from V4):
//   - Server-resolved `enabled` prop comes from the root layout's
//     getClerkPublishableKey() check. Without it the bridge short-
//     circuits BEFORE any Clerk hook touches the tree — this is the
//     fail-closed path that prevents the
//     "useAuth can only be used within the <ClerkProvider />" crash
//     that took down production on 2026-05-15.
//   - When userId resolves, we hit /api/pipeline/sidebar-overlay?userId=…
//     and stash the count in a Zustand store the sidebar reads from.
//   - When the user signs out, we reset the store back to its anonymous
//     baseline.
//
// This file is on the auth-provider-policy ALLOW_LIST as a sanctioned
// consumer of `useAuth()`.

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { create } from "zustand";

interface SidebarOverlayState {
  unreadAlerts: number;
  loaded: boolean;
  setOverlay: (value: { unreadAlerts: number }) => void;
  reset: () => void;
}

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
