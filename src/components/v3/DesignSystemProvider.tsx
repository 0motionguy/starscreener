"use client";

import { useEffect } from "react";
import { applyV3AccentTheme } from "./applyTheme";
import { getV3Theme, V3_THEME_STORAGE_KEY } from "./themes";

export function DesignSystemProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    try {
      const saved = localStorage.getItem(V3_THEME_STORAGE_KEY);
      applyV3AccentTheme(getV3Theme(saved));
    } catch {
      applyV3AccentTheme(getV3Theme(null));
    }
  }, []);

  return <div className="v3-root">{children}</div>;
}
