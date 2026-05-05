"use client";

// AGN-615 — Global keyboard shortcuts.
//
// Listens app-wide for "/" (focus the canonical SearchBar) and "?"
// (open the keyboard help overlay). Bypasses both when the user is
// typing into an input/textarea/contenteditable, when modifier keys
// are held, or when another dialog is already open — that last guard
// keeps us from double-firing alongside route-local handlers like the
// Terminal page's own "?" listener.

import { useEffect } from "react";

interface Options {
  onShowHelp: () => void;
  /** Pass current help-open state so we don't toggle off via "?". */
  helpOpen: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function anotherDialogOpen(): boolean {
  if (typeof document === "undefined") return false;
  // role="dialog" with aria-modal="true" matches our KeyboardHelp,
  // ColumnPicker, etc. If something is already up, defer to it.
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

export function useGlobalShortcuts({ onShowHelp, helpOpen }: Options): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      // "/" focuses the header search input. Use the first element
      // tagged with data-global-search — that's the SearchBar in the
      // header on every route, and the in-page bar on /search.
      if (e.key === "/" && !e.shiftKey) {
        if (anotherDialogOpen()) return;
        const el = document.querySelector<HTMLInputElement>(
          'input[data-global-search="true"]',
        );
        if (el) {
          e.preventDefault();
          el.focus();
          // Select existing query so the user can type-replace.
          if (typeof el.select === "function") el.select();
        }
        return;
      }

      // "?" opens the help modal. Browsers report the literal "?"
      // already (Shift handled), but accept the Shift+/ form too for
      // keyboard layouts that don't.
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        if (helpOpen) return;
        if (anotherDialogOpen()) return;
        // Defer to a microtask so any route-local listener (e.g. the
        // Terminal page's own "?" handler, mounted later in the tree
        // and therefore registered after this one) gets a chance to
        // claim the event first via preventDefault. If it did, stand
        // down — we'd otherwise stack two help dialogs on that page.
        queueMicrotask(() => {
          if (e.defaultPrevented) return;
          if (anotherDialogOpen()) return;
          onShowHelp();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onShowHelp, helpOpen]);
}
