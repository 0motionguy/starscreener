"use client";

import { useEffect, useState } from "react";
import {
  V3_BG_THEMES,
  V3_BG_THEME_STORAGE_KEY,
  V3_DEFAULT_BG_ID,
  getV3BgTheme,
} from "./BgThemes";

/**
 * Background-theme picker — five swatches (3 dark + 2 light).
 * Writes the chosen id to localStorage and applies it by setting
 * `html[data-bg-theme]`, which globals.css uses to override the V3
 * surface tokens for that theme. Mirrors AccentPicker's API.
 */
export function BgThemePicker({ compact = false }: { compact?: boolean }) {
  const [activeId, setActiveId] = useState(V3_DEFAULT_BG_ID);
  const active = getV3BgTheme(activeId);

  // Mount: read the saved id, sync state + apply.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(V3_BG_THEME_STORAGE_KEY);
      const theme = getV3BgTheme(saved);
      setActiveId(theme.id);
      document.documentElement.dataset.bgTheme = theme.id;
    } catch {
      document.documentElement.dataset.bgTheme = V3_DEFAULT_BG_ID;
    }
  }, []);

  function pick(id: string) {
    setActiveId(id);
    document.documentElement.dataset.bgTheme = id;
    try {
      localStorage.setItem(V3_BG_THEME_STORAGE_KEY, id);
    } catch {
      // Theme still applies for this session.
    }
  }

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <div className="flex items-center justify-between gap-3">
        <span className="v3-label">surface</span>
        {!compact ? (
          <span className="v3-label text-[color:var(--v3-ink-300)]">
            {active.label}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {V3_BG_THEMES.map((theme) => {
          const isActive = theme.id === activeId;
          return (
            <button
              key={theme.id}
              type="button"
              aria-label={`Set background to ${theme.label}`}
              aria-pressed={isActive}
              onClick={() => pick(theme.id)}
              title={theme.label}
              className="v3-swatch relative"
              style={
                {
                  // Reuse the swatch chrome from globals.css but show
                  // a surface-coloured fill + a tiny "Aa" so the user
                  // can preview ink contrast at a glance.
                  "--swatch": theme.bg,
                  "--swatch-glow": "transparent",
                  border: `1px solid ${theme.bgEdge}`,
                } as React.CSSProperties
              }
            >
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  fontFamily: "var(--font-geist), Inter, sans-serif",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  color: theme.ink,
                  opacity: isActive ? 1 : 0.7,
                }}
              >
                Aa
              </span>
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
