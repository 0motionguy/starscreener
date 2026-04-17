"use client";

import { useEffect, useState } from "react";
import { useFilterStore, useSidebarStore } from "@/lib/store";

/**
 * StoreProvider — non-blocking hydration gate for Zustand persist stores.
 *
 * We subscribe to `onFinishHydration` for both stores so components that care
 * about the hydration signal can check it themselves via
 * `useFilterStore.persist.hasHydrated()`. We deliberately do NOT block the
 * render tree — that would delay first paint and cause a noticeable flash on
 * initial load. Components that need deterministic hydration should render a
 * skeleton row until `hasHydrated()` returns true.
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [, setHydrated] = useState(false);

  useEffect(() => {
    const unsubFilter = useFilterStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    const unsubSidebar = useSidebarStore.persist.onFinishHydration(() => {
      /* no-op — sidebar hydration is non-critical for render */
    });

    // In case hydration already completed synchronously before the effect
    // attached (fast refresh, cached data, etc.), check immediately.
    if (useFilterStore.persist.hasHydrated()) setHydrated(true);

    return () => {
      unsubFilter();
      unsubSidebar();
    };
  }, []);

  return <>{children}</>;
}
