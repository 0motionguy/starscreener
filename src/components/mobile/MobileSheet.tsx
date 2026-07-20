"use client";

// MobileSheet — full-screen sheet primitive for the mobile app shell.
//
// Renders nothing unless it is the active sheet. When active: a dialog with a
// backdrop, a titled header + close button, focus trap (Tab cycles inside),
// and Escape-to-close. Motion is CSS-only (see .mapp-sheet in shell.css) with
// a prefers-reduced-motion fallback, so nothing here animates layout in JS.

import { useEffect, useRef } from "react";
import { Icon } from "@/components/icon/Icon";
import { useMobileApp, type MobileSheetId } from "./MobileAppProvider";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function MobileSheet({
  id,
  title,
  children,
}: {
  id: MobileSheetId;
  title: string;
  children: React.ReactNode;
}) {
  const { activeSheet, closeSheet } = useMobileApp();
  const open = activeSheet === id;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusables = () =>
      panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => el.offsetParent !== null,
          )
        : [];

    // Move focus into the sheet on open — prefer an explicit target (e.g. the
    // Ask input) so the primary control gets the keyboard, else first focusable.
    const initial =
      panel?.querySelector<HTMLElement>("[data-initial-focus]") ?? focusables()[0];
    initial?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSheet();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeSheet]);

  if (!open) return null;

  return (
    <div
      className="mapp-sheet-root"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="mapp-sheet-backdrop"
        aria-label="Close"
        tabIndex={-1}
        onClick={closeSheet}
      />
      <div className="mapp-sheet" ref={panelRef}>
        <div className="mapp-sheet-head">
          <span className="mapp-sheet-title">{title}</span>
          <button
            type="button"
            className="mapp-sheet-close"
            aria-label="Close"
            onClick={closeSheet}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="mapp-sheet-body">{children}</div>
      </div>
    </div>
  );
}
