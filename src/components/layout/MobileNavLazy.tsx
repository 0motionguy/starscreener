"use client";

// MobileNavLazy — viewport-gated lazy wrapper for MobileNav.
//
// Two layers of deferral:
//   1. `next/dynamic` with `ssr: false` so the chunk only enters the
//      bundle on the client and never lands on the SSR critical path.
//   2. `window.matchMedia("(max-width: 767.98px)")` viewport gate so a
//      desktop session never even requests the chunk. The mobile bottom
//      nav is `display: none` above the md breakpoint, so loading it on
//      desktop is pure waste.
//
// On viewport resize (e.g. dev tools toggling responsive mode) the
// component re-evaluates. Once mobile, the chunk is fetched and stays
// loaded for the rest of the session — there's no benefit to unmounting
// it on a transient resize back to desktop.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const MobileNavDynamic = dynamic(
  () =>
    import("@/components/layout/MobileNav").then((m) => ({
      default: m.MobileNav,
    })),
  { ssr: false },
);

const MOBILE_QUERY = "(max-width: 767.98px)";

export function MobileNavLazy() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => {
      setEnabled((prev) => prev || mql.matches);
    };
    update();
    // `change` is the modern API; older Safari uses addListener.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    }
    mql.addListener(update);
    return () => mql.removeListener(update);
  }, []);

  if (!enabled) return null;
  return <MobileNavDynamic />;
}
