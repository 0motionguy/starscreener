// Theme picker — 5 accent-color swatches in the bottom-left sidebar.
// Clicking a swatch swaps the --v2-acc family on .v2-root in real time
// and persists the choice in localStorage so it survives reloads.
//
// Demo only. The 5 themes are hand-tuned so each accent looks correct
// against the dark V2 surfaces. Swatch + glow + soft-fill all derive
// from one base hex.

"use client";

import { useEffect, useState } from "react";

interface ThemeDef {
  id: string;
  label: string;
  /** Base accent hex — used for primary CTAs, active states, brackets. */
  acc: string;
  /** Hover / pressed variant — slightly darker. */
  accDim: string;
  /** Soft fill at ~14% alpha. */
  accSoft: string;
  /** Glow at ~45% alpha. */
  accGlow: string;
}

// Hand-tuned 5-theme palette. All accents check ≥4.5:1 contrast against
// --v2-bg-050 (#101214) so primary buttons stay readable.
const THEMES: ThemeDef[] = [
  {
    id: "lava",
    label: "Liquid Lava",
    acc: "#f56e0f",
    accDim: "#c25608",
    accSoft: "rgba(245, 110, 15, 0.14)",
    accGlow: "rgba(245, 110, 15, 0.45)",
  },
  {
    id: "indigo",
    label: "Indigo",
    acc: "#9297f6",
    accDim: "#555bd8",
    accSoft: "rgba(146, 151, 246, 0.14)",
    accGlow: "rgba(146, 151, 246, 0.45)",
  },
  {
    id: "lime",
    label: "Lime",
    acc: "#def135",
    accDim: "#a9b827",
    accSoft: "rgba(222, 241, 53, 0.14)",
    accGlow: "rgba(222, 241, 53, 0.45)",
  },
  {
    id: "cyan",
    label: "Cyan",
    acc: "#3ad6c5",
    accDim: "#26a597",
    accSoft: "rgba(58, 214, 197, 0.14)",
    accGlow: "rgba(58, 214, 197, 0.45)",
  },
  {
    id: "magenta",
    label: "Magenta",
    acc: "#e879f9",
    accDim: "#a855f7",
    accSoft: "rgba(232, 121, 249, 0.14)",
    accGlow: "rgba(232, 121, 249, 0.45)",
  },
];

const STORAGE_KEY = "v2-theme";
const DEFAULT_THEME = "indigo"; // matches the current Blockworks override

function applyTheme(theme: ThemeDef) {
  // Find every .v2-root in the DOM (typically just one) and rewrite the
  // accent token block. Setting on .style with !important wins over the
  // CSS variables defined inside the same selector in globals.css.
  const roots = document.querySelectorAll<HTMLElement>(".v2-root");
  for (const root of roots) {
    root.style.setProperty("--v2-acc", theme.acc);
    root.style.setProperty("--v2-acc-dim", theme.accDim);
    root.style.setProperty("--v2-acc-soft", theme.accSoft);
    root.style.setProperty("--v2-acc-glow", theme.accGlow);
  }
}

export function ThemePickerV2() {
  const [activeId, setActiveId] = useState<string>(DEFAULT_THEME);
  const [hydrated, setHydrated] = useState(false);

  // Read saved choice on mount and apply immediately. We render swatches
  // before this runs (server) so the layout never shifts; we just paint
  // the brackets on the right one once we know.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const found = THEMES.find((t) => t.id === saved);
      if (found) {
        setActiveId(found.id);
        applyTheme(found);
      } else {
        const def = THEMES.find((t) => t.id === DEFAULT_THEME);
        if (def) applyTheme(def);
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — fall back to default.
    }
    setHydrated(true);
  }, []);

  const handlePick = (theme: ThemeDef) => {
    setActiveId(theme.id);
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {
      // ignore — theme still applies for the session
    }
  };

  const active = THEMES.find((t) => t.id === activeId) ?? THEMES[0];

  return (
    <div className="space-y-2">
      {/* Section label */}
      <div className="flex items-center justify-between">
        <span
          className="v2-mono"
          style={{ color: "var(--v2-ink-400)", fontSize: 9 }}
        >
          <span aria-hidden>{"// "}</span>
          THEME
        </span>
        <span
          className="v2-mono"
          style={{ color: "var(--v2-ink-300)", fontSize: 9 }}
        >
          {active.label.toUpperCase()}
        </span>
      </div>

      {/* 5 swatches in a row */}
      <div className="grid grid-cols-5 gap-1.5">
        {THEMES.map((theme) => {
          const isActive = hydrated && theme.id === activeId;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => handlePick(theme)}
              aria-label={`Switch theme to ${theme.label}`}
              aria-pressed={isActive}
              className="relative group"
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                background: theme.acc,
                border: isActive
                  ? "1px solid #000"
                  : "1px solid var(--v2-line-200)",
                borderRadius: 1,
                cursor: "pointer",
                boxShadow: isActive
                  ? `0 0 0 1px ${theme.acc}, 0 0 12px ${theme.accGlow}`
                  : "none",
                transition: "box-shadow 120ms ease-out, border-color 120ms ease-out",
              }}
            >
              {/* Bracket markers on the active swatch — Sentinel handles
                  reused at swatch scale. */}
              {isActive ? (
                <>
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: -2,
                      left: -2,
                      width: 4,
                      height: 4,
                      background: theme.acc,
                      boxShadow: `0 0 0 1px #000`,
                    }}
                  />
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: -2,
                      right: -2,
                      width: 4,
                      height: 4,
                      background: theme.acc,
                      boxShadow: `0 0 0 1px #000`,
                    }}
                  />
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      bottom: -2,
                      left: -2,
                      width: 4,
                      height: 4,
                      background: theme.acc,
                      boxShadow: `0 0 0 1px #000`,
                    }}
                  />
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      bottom: -2,
                      right: -2,
                      width: 4,
                      height: 4,
                      background: theme.acc,
                      boxShadow: `0 0 0 1px #000`,
                    }}
                  />
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
