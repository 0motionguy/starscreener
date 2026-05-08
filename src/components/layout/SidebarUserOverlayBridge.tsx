"use client";

// SidebarUserOverlayBridge — fetches the per-user sidebar overlay
// (`unreadAlerts`) once on mount, only when Clerk says the viewer is
// signed in, and pumps the result into a Zustand store slice that
// `<Sidebar>` reads via `useSidebarOverlayStore()`.
//
// Why a bridge:
//   * The root layout used to call `pipeline.ensureReady()` + read
//     alerts in-tree, paying the cost on every page render including
//     anonymous traffic. The shell payload is now anonymous-safe and
//     the overlay is opt-in / client-only / no-store.
//   * Mounting unconditionally is safe: the component renders nothing
//     visible. When signed-out, the effect early-returns; when signed-in,
//     a single fetch fires and writes to the store. Subsequent renders
//     skip the fetch (one-shot guard).
//
// Co-located store: this file owns the Zustand slice for overlay state.
// Adding the slice to the existing `src/lib/store.ts` would have meant
// touching the persist `partialize`/`migrate` block — overlay data is
// per-session and should NOT persist across reloads, so keeping it in a
// dedicated transient store is the right separation of concerns.

import { useEffect, useRef } from "react";
import { create } from "zustand";
import { useUser } from "@clerk/nextjs";

interface SidebarOverlayState {
  unreadAlerts: number;
  loaded: boolean;
  setOverlay: (value: { unreadAlerts: number }) => void;
  reset: () => void;
}

/**
 * Transient (non-persisted) Zustand store holding the per-user sidebar
 * overlay data. Read by `<Sidebar>`; written exclusively by this bridge.
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
  // When Clerk isn't configured (CI builds, public previews, local dev
  // without auth), the layout shell skips wrapping the tree in
  // <ClerkProvider>. Calling useUser() outside ClerkProvider hard-throws
  // during static prerender, so we bail out before the inner component
  // (which holds the hook) ever mounts.
  if (!CLERK_PUBLIC_KEY) return null;
  return <SidebarUserOverlayBridgeInner />;
}

function SidebarUserOverlayBridgeInner() {
  const { isLoaded, isSignedIn, user } = useUser();
  const setOverlay = useSidebarOverlayStore((s) => s.setOverlay);
  const reset = useSidebarOverlayStore((s) => s.reset);
  const fetchedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) {
      // Signed out (or signed out mid-session) → clear any prior overlay
      // and skip the fetch.
      if (fetchedForUserRef.current !== null) {
        fetchedForUserRef.current = null;
        reset();
      }
      return;
    }
    if (fetchedForUserRef.current === user.id) return;
    fetchedForUserRef.current = user.id;

    let cancelled = false;
    const url = `/api/pipeline/sidebar-overlay?userId=${encodeURIComponent(user.id)}`;
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((json: OverlayResponse) => {
        if (cancelled) return;
        setOverlay({ unreadAlerts: json.unreadAlerts ?? 0 });
      })
      .catch(() => {
        // Silent fail — sidebar already shows 0 unread alerts and the
        // overlay is non-critical chrome.
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user, setOverlay, reset]);

  return null;
}
