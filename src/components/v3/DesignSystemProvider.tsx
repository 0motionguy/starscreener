"use client";

// Theme bootstrap is owned by the inline <script> in src/app/layout.tsx
// (it runs before first paint, reads the storage keys, and writes the
// CSS variables + data-attributes this provider also restores). This
// effect is the post-hydration safety net — it re-reads localStorage
// once on mount so any state the bootstrap script missed (e.g. JS-off
// stale render, post-navigation route handlers that wipe the root
// element) gets resynced. SSR mismatches are silenced via
// suppressHydrationWarning on <html> in the root layout.

import { useEffect } from "react";
import { applyV3AccentTheme } from "./applyTheme";
import {
  V3_THEME_STORAGE_KEY,
  getV3Theme,
} from "./themes";
import {
  V3_BG_THEME_STORAGE_KEY,
  getV3BgTheme,
} from "./BgThemes";

export function DesignSystemProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    try {
      const accentId = localStorage.getItem(V3_THEME_STORAGE_KEY);
      applyV3AccentTheme(getV3Theme(accentId));
    } catch {
      // localStorage unavailable — head script already applied default.
    }
    try {
      const surfaceId = localStorage.getItem(V3_BG_THEME_STORAGE_KEY);
      document.documentElement.dataset.surface = getV3BgTheme(surfaceId).id;
    } catch {
      // localStorage unavailable — head script already applied default.
    }
  }, []);

  return <div className="v3-root">{children}</div>;
}
