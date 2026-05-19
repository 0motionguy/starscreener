"use client";

// AGN-615 — Global shortcut surface.
//
// Mounts the app-wide keyboard listener and renders the help overlay
// when the user presses "?". Lives in the root layout so every route
// gets the binding. Route-local handlers (e.g. the Terminal page's
// arrows / W / C bindings) keep working — useGlobalShortcuts steps
// aside while another dialog is open or while focus is in a field.

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";

interface Shortcut {
  keys: string[];
  label: string;
}

const GLOBAL_GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: "Global",
    items: [
      { keys: ["/"], label: "Focus search" },
      { keys: ["?"], label: "Show this help" },
      { keys: ["Esc"], label: "Close overlays" },
    ],
  },
  {
    title: "Terminal (on screening pages)",
    items: [
      { keys: ["↑", "↓"], label: "Move focus up/down" },
      { keys: ["PgUp", "PgDn"], label: "Jump 10 rows" },
      { keys: ["Home"], label: "Jump to first row" },
      { keys: ["End"], label: "Jump to last row" },
      { keys: ["Enter"], label: "Open focused repo" },
      { keys: ["W"], label: "Toggle watch on focused repo" },
      { keys: ["C"], label: "Toggle compare on focused repo" },
    ],
  },
];

export function GlobalShortcuts() {
  const [open, setOpen] = useState(false);
  const showHelp = useCallback(() => setOpen(true), []);
  const closeHelp = useCallback(() => setOpen(false), []);
  useGlobalShortcuts({ onShowHelp: showHelp, helpOpen: open });

  if (!open) return null;
  return <GlobalKeyboardHelp onClose={closeHelp} />;
}

function GlobalKeyboardHelp({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
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

        <div className="px-4 py-3 space-y-4 max-h-[70vh] overflow-y-auto">
          {GLOBAL_GROUPS.map((group) => (
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
