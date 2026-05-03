"use client";

import { useEffect, useState } from "react";
import {
  V3_BG_THEMES,
  V3_BG_THEME_STORAGE_KEY,
  V3_DEFAULT_BG_ID,
  getV3BgTheme,
} from "./BgThemes";

/**
 * Surface-scale picker — three buttons (Aa sm / md / lg) that the user
 * clicks to scale the site's typography + spacing. Writes the chosen id
 * to localStorage and applies it by setting `html[data-surface]`, which
 * globals.css uses to scope the type / spacing tokens.
 */
export function BgThemePicker({ compact = false }: { compact?: boolean }) {
  const [activeId, setActiveId] = useState<string>(V3_DEFAULT_BG_ID);
  const active = getV3BgTheme(activeId);

  // Mount: read the saved id, sync state + apply.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(V3_BG_THEME_STORAGE_KEY);
      const theme = getV3BgTheme(saved);
      setActiveId(theme.id);
      document.documentElement.dataset.surface = theme.id;
    } catch {
      document.documentElement.dataset.surface = V3_DEFAULT_BG_ID;
    }
  }, []);

  function pick(id: string) {
    setActiveId(id);
    document.documentElement.dataset.surface = id;
    try {
      localStorage.setItem(V3_BG_THEME_STORAGE_KEY, id);
    } catch {
      // Surface still applies for this session.
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
      <div className="grid grid-cols-3 gap-1.5">
        {V3_BG_THEMES.map((theme) => {
          const isActive = theme.id === activeId;
          return (
            <button
              key={theme.id}
              type="button"
              aria-label={`Set surface scale to ${theme.label}`}
              aria-pressed={isActive}
              onClick={() => pick(theme.id)}
              title={theme.label}
              className="v3-swatch relative"
              style={
                {
                  "--swatch": "var(--v4-bg-050)",
                  "--swatch-glow": "transparent",
                  border: `1px solid var(--v4-line-200)`,
                } as React.CSSProperties
              }
            >
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  fontFamily: "var(--font-geist), Inter, sans-serif",
                  fontSize: theme.previewSize,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  color: "var(--v4-ink-100)",
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
