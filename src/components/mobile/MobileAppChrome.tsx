"use client";

// MobileAppChrome — the single mount point for the mobile app shell.
//
// layout.tsx renders this once (behind NEXT_PUBLIC_TRENDINGREPO_MOBILE_APP_V1)
// alongside the existing desktop chrome. On mobile (≤767px, shell.css) this
// header + bottom nav replace the desktop Topbar/Ticker/Statusbar and the
// hamburger drawer; the sheets render null unless open, so on desktop the
// whole tree is inert. The provider adds the `mapp-on` root class on mount.

import { MobileAppProvider } from "./MobileAppProvider";
import { MobileAppHeader } from "./MobileAppHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileSearchSheet } from "./MobileSearchSheet";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { MobileAskSheet } from "./MobileAskSheet";

export function MobileAppChrome() {
  return (
    <MobileAppProvider>
      <MobileAppHeader />
      <MobileBottomNav />
      <MobileSearchSheet />
      <MobileMoreSheet />
      <MobileAskSheet />
    </MobileAppProvider>
  );
}
