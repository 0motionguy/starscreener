"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Eye, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

/**
 * MobileNav — fixed bottom navigation for <md breakpoint.
 *
 * Trimmed to 3 tabs as of Phase 1C: Home, Watchlist, Search. Categories and
 * Compare are reached through the MobileDrawer sidebar (opened via the
 * hamburger in the Header).
 */
const TABS: { href: string; label: string; icon: typeof Home }[] = [
  { href: ROUTES.HOME, label: "Home", icon: Home },
  { href: ROUTES.WATCHLIST, label: "Watchlist", icon: Eye },
  { href: ROUTES.SEARCH, label: "Search", icon: Search },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "md:hidden",
        "bg-bg-primary border-t border-border-primary",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <div className="flex items-center justify-around h-14">
        {TABS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5",
                "w-full h-full",
                "transition-colors",
                isActive ? "text-accent-green" : "text-text-tertiary",
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
