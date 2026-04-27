"use client";

// Client wrapper that defers loading the real MobileDrawer (which pulls
// framer-motion, ~30 kB gzipped) until the browser has the chunk in hand.
// Used by the root layout, which is a Server Component and therefore can't
// pass `ssr: false` to next/dynamic directly. The drawer is invisible until
// the user taps the hamburger, so SSR-rendering it adds no value.

import dynamic from "next/dynamic";

const MobileDrawer = dynamic(
  () =>
    import("@/components/layout/MobileDrawer").then((m) => ({
      default: m.MobileDrawer,
    })),
  { ssr: false },
);

export function MobileDrawerLazy() {
  return <MobileDrawer />;
}
