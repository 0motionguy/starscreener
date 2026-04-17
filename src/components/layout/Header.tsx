"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { SearchBar } from "@/components/shared/SearchBar";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { HamburgerButton } from "@/components/layout/HamburgerButton";

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
        <Link href={ROUTES.HOME} className="flex items-center gap-2">
          <span className="font-mono font-bold text-lg text-accent-green tracking-tight">
            StarScreener
          </span>
        </Link>
      </div>

      {/* Center: Desktop search — hidden on very small screens to avoid crowding */}
      <div className="hidden sm:flex flex-1 max-w-md mx-2 md:mx-6">
        <SearchBar placeholder="Search repos..." fullWidth />
      </div>

      {/* Right: Theme toggle */}
      <div className="flex items-center gap-1 md:gap-2 shrink-0">
        <ThemeToggle />
      </div>
    </header>
  );
}
