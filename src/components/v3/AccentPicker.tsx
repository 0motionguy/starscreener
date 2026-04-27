"use client";

import { useEffect, useState } from "react";
import { applyV3AccentTheme } from "./applyTheme";
import {
  getV3Theme,
  V3_ACCENT_THEMES,
  V3_DEFAULT_THEME_ID,
  V3_THEME_STORAGE_KEY,
} from "./themes";

export function AccentPicker({ compact = false }: { compact?: boolean }) {
  const [activeId, setActiveId] = useState(V3_DEFAULT_THEME_ID);
  const active = getV3Theme(activeId);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(V3_THEME_STORAGE_KEY);
      const theme = getV3Theme(saved);
      setActiveId(theme.id);
      applyV3AccentTheme(theme);
    } catch {
      applyV3AccentTheme(getV3Theme(null));
    }
  }, []);

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <div className="flex items-center justify-between gap-3">
        <span className="v3-label">theme</span>
        {!compact ? (
          <span className="v3-label text-[color:var(--v3-ink-300)]">
            {active.label}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {V3_ACCENT_THEMES.map((theme) => {
          const isActive = theme.id === activeId;
          return (
            <button
              key={theme.id}
              type="button"
              aria-label={`Set accent to ${theme.label}`}
              aria-pressed={isActive}
              onClick={() => {
                setActiveId(theme.id);
                applyV3AccentTheme(theme);
                try {
                  localStorage.setItem(V3_THEME_STORAGE_KEY, theme.id);
                } catch {
                  // Accent still applies for this session.
                }
              }}
              className="v3-swatch"
              style={
                {
                  "--swatch": theme.acc,
                  "--swatch-glow": theme.accGlow,
                } as React.CSSProperties
              }
            >
              {isActive ? (
                <>
                  <span className="v3-swatch-corner left-[-2px] top-[-2px]" />
                  <span className="v3-swatch-corner right-[-2px] top-[-2px]" />
                  <span className="v3-swatch-corner bottom-[-2px] left-[-2px]" />
                  <span className="v3-swatch-corner bottom-[-2px] right-[-2px]" />
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
