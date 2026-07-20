"use client";

// MobileAppChrome — the single mount point for the mobile app shell.
//
// layout.tsx renders this once (behind NEXT_PUBLIC_TRENDINGREPO_MOBILE_APP_V1)
// alongside the existing desktop chrome. Everything inside is hidden >768px
// via shell.css, and the sheets render null unless open, so on desktop this
// is inert. The provider adds the `mapp-on` root class on mount.

import { MobileAppProvider } from "./MobileAppProvider";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { MobileAskSheet } from "./MobileAskSheet";

export function MobileAppChrome() {
  return (
    <MobileAppProvider>
      <MobileBottomNav />
      <MobileMoreSheet />
      <MobileAskSheet />
    </MobileAppProvider>
  );
}
