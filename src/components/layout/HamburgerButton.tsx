"use client";

import { Menu } from "lucide-react";
import { useSidebarStore } from "@/lib/store";

/**
 * HamburgerButton — mobile-only trigger that opens the MobileDrawer.
 */
export function HamburgerButton() {
  const open = useSidebarStore((s) => s.openMobile);
  return (
    <button
      type="button"
      onClick={open}
      className="md:hidden w-10 h-10 flex items-center justify-center rounded-md border border-border-primary hover:bg-bg-card-hover"
      aria-label="Open menu"
    >
      <Menu className="w-4 h-4" />
    </button>
  );
}
