"use client";

import { useSidebarStore } from "@/lib/store";

/**
 * HamburgerButton — mobile-only trigger that opens the MobileDrawer.
 *
 * V4 chrome (visual only): 1.5px-stroke icon at `--v4-ink-200`, no border
 * at rest, `--v4-line-200` 1px border + faint `--v4-bg-050` wash on hover.
 * Open behavior, accessibility, and store wiring are unchanged.
 */
export function HamburgerButton() {
  const open = useSidebarStore((s) => s.openMobile);
  return (
    <button
      type="button"
      onClick={open}
      className="md:hidden w-10 h-10 flex items-center justify-center transition-colors"
      style={{
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: 2,
        color: "var(--v4-ink-200)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--v4-line-200)";
        e.currentTarget.style.background = "var(--v4-bg-050)";
        e.currentTarget.style.color = "var(--v4-ink-100)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "transparent";
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--v4-ink-200)";
      }}
      aria-label="Open menu"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
        aria-hidden="true"
      >
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="17" x2="20" y2="17" />
      </svg>
    </button>
  );
}
