"use client";

// Client wrapper that defers loading the real MobileDrawer (which pulls
// framer-motion, ~30 kB gzipped) until the viewport can actually open it.
// Used by the root layout, which is a Server Component and therefore can't
// pass `ssr: false` to next/dynamic directly.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const MobileDrawer = dynamic(
  () =>
    import("@/components/layout/MobileDrawer").then((m) => ({
      default: m.MobileDrawer,
    })),
  { ssr: false },
);

const MOBILE_QUERY = "(max-width: 767.98px)";

export function MobileDrawerLazy() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => {
      setEnabled((prev) => prev || mql.matches);
    };
    update();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    }
    mql.addListener(update);
    return () => mql.removeListener(update);
  }, []);

  if (!enabled) return null;
  return <MobileDrawer />;
}
