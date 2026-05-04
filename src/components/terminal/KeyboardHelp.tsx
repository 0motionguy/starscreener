"use client";

// StarScreener — Keyboard shortcuts help overlay.
//
// Centered modal listing every Terminal hotkey. Opens when the user
// presses "?" (handled by the Terminal key listener); dismisses on
// Escape, outside click, or the explicit close button.

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUT_GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: "Navigation",
    items: [
      { keys: ["\u2191", "\u2193"], label: "Move focus up/down" },
      { keys: ["PgUp", "PgDn"], label: "Jump 10 rows" },
      { keys: ["Home"], label: "Jump to first row" },
      { keys: ["End"], label: "Jump to last row" },
      { keys: ["Enter"], label: "Open focused repo" },
      { keys: ["Esc"], label: "Clear focus / close overlays" },
    ],
  },
  {
    title: "Actions",
    items: [
      { keys: ["W"], label: "Toggle watch on focused repo" },
      { keys: ["C"], label: "Toggle compare on focused repo" },
    ],
  },
  {
    title: "Help",
    items: [{ keys: ["?"], label: "Open this shortcut reference" }],
  },
];

interface KeyboardHelpProps {
  onClose: () => void;
}

export function KeyboardHelp({ onClose }: KeyboardHelpProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Focus the close button so keyboard users can dismiss immediately.
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay p-4 animate-fade-in"
    >
      <div
        ref={ref}
        className={cn(
          "w-full max-w-md v2-card",
          "shadow-[var(--shadow-overlay)] animate-slide-up",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-secondary px-4 py-3">
          <span className="font-display text-[15px] font-semibold text-text-primary">
            Keyboard shortcuts
          </span>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-7 items-center justify-center rounded text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary transition-colors"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4 max-h-[70vh] overflow-y-auto">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="label-section mb-2">{group.title}</div>
              <ul className="space-y-1.5">
                {group.items.map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between gap-3 text-[12px]"
                  >
                    <span className="text-text-secondary">{s.label}</span>
                    <span className="inline-flex items-center gap-1">
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className={cn(
                            "inline-flex min-w-[24px] items-center justify-center",
                            "rounded border border-border-strong bg-bg-secondary",
                            "px-1.5 py-0.5 font-mono text-[10px] text-text-primary tabular-nums",
                          )}
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="border-t border-border-secondary px-4 py-2">
          <span className="text-[11px] text-text-tertiary">
            Press{" "}
            <kbd className="inline-flex min-w-[20px] items-center justify-center rounded border border-border-strong bg-bg-secondary px-1 py-0.5 font-mono text-[10px] text-text-primary">
              Esc
            </kbd>{" "}
            to close.
          </span>
        </div>
      </div>
    </div>
  );
}
