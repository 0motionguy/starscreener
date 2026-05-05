"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

interface SidebarCountPayload {
  trendingReposCount?: number;
}

const POLL_MS = 60_000;

// AGN-612 [UX-5]: keep homepage browser-tab title synced with live repo count.
export function BrowserTabLiveCounter() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    let cancelled = false;
    const fallbackTitle = document.title;

    const updateTitle = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/pipeline/sidebar-data", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as SidebarCountPayload;
        const count = Number(json.trendingReposCount ?? 0);
        if (cancelled || !Number.isFinite(count) || count <= 0) return;
        document.title = `(${count}) TrendingRepo - The trend map for open source`;
      } catch {
        // Silent fail: keep the existing title.
      }
    };

    void updateTitle();
    const id = window.setInterval(() => {
      void updateTitle();
    }, POLL_MS);
    const onVisibility = () => {
      if (document.hidden) return;
      void updateTitle();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      document.title = fallbackTitle;
    };
  }, [pathname]);

  return null;
}
