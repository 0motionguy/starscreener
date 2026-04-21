"use client";

import Link from "next/link";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { SearchBar } from "@/components/shared/SearchBar";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { HamburgerButton } from "@/components/layout/HamburgerButton";
import { FreshBadge } from "@/components/layout/FreshBadge";

/**
 * Header — 56px sticky top bar.
 *
 * Layout:
 *   [Hamburger (mobile only)] [Logo]      [SearchBar (desktop)]      [ThemeToggle]
 *
 * The old desktop nav links (Trending/Categories/Compare) have been removed
 * as of Phase 1C — those now live in the Sidebar. Mobile users reach them
 * through the MobileDrawer (via the hamburger) or the bottom MobileNav.
 */
export function Header() {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full",
        "h-14 border-b border-border-primary",
        "bg-bg-primary/80 backdrop-blur-xl",
        "flex items-center justify-between",
        "px-4 md:px-6",
        "gap-3",
      )}
    >
      {/* Left: Hamburger (mobile) + Logo */}
      <div className="flex items-center gap-3 shrink-0">
        <HamburgerButton />
        <Link
          href={ROUTES.HOME}
          className="flex items-center gap-2.5 group"
          aria-label="TrendingRepo home"
        >
          <span className="flex flex-col leading-none">
            <span className="font-display font-bold text-lg tracking-tight text-text-primary leading-none">
              Trending<span className="text-brand">Repo</span>
            </span>
            <span
              className="hidden sm:inline font-mono text-[9px] uppercase tracking-[0.14em] text-text-tertiary leading-none mt-0.5"
              aria-hidden="true"
            >
              The trend map for open source
            </span>
          </span>
        </Link>
      </div>

      {/* Center: Desktop search — hidden on very small screens to avoid crowding */}
      <div className="hidden sm:flex flex-1 max-w-md mx-2 md:mx-6">
        <SearchBar placeholder="Search repos..." fullWidth />
      </div>

      {/* Right: FreshBadge + Submit + Theme toggle */}
      <div className="flex items-center gap-1 md:gap-2 shrink-0">
        <FreshBadge />
        <Link
          href={ROUTES.SUBMIT}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-card",
            // Outlined brand-orange CTA — distinct from the mid-gray
            // SearchBar so it reads as the primary user action.
            "border border-brand/60 bg-transparent px-3",
            "text-sm font-medium text-brand transition-colors",
            "hover:bg-brand hover:text-black hover:border-brand",
          )}
          aria-label="Drop your repo"
        >
          <Send className="h-4 w-4" />
          <span className="hidden md:inline">Drop repo</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
