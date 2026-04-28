"use client";

import { useEffect, useState } from "react";

/**
 * Track `window.innerWidth` and re-render when it changes. SSR-safe (returns
 * a sensible default during prerender). Resize events are coalesced through
 * `requestAnimationFrame` so a continuous drag-resize fires at most one
 * setW per animation frame instead of every browser resize event (often
 * 120+/s on high-refresh displays).
 *
 * Used by Terminal.tsx for breakpoint-aware column visibility.
 */
export function useWindowWidth(): number {
  const [w, setW] = useState<number>(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;
    const onResize = () => {
      if (raf !== 0) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        setW(window.innerWidth);
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (raf !== 0) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return w;
}
