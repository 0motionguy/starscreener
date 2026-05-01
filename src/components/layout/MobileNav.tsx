"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Eye, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

/**
 * MobileNav — fixed bottom navigation for <md breakpoint.
 *
 * V4 chrome: `--v4-bg-000` bar with `--v4-line-200` top hairline. Each
 * tab is a `--v4-bg-050` card with `--v4-line-200` 1px / 2px-corner
 * border. Active tab is signaled by a 2px `--v4-acc` indicator BAR
 * above the icon (not a filled pill) plus an `--v4-acc` icon + label.
 * Labels are mono uppercase 9px tracking 0.18em.
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
        "pb-[env(safe-area-inset-bottom)]",
      )}
      style={{
        background: "var(--v4-bg-000)",
        borderTop: "1px solid var(--v4-line-200)",
      }}
    >
      <div className="flex items-stretch justify-around gap-2 px-2 py-2 h-[80px]">
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
                "relative flex-1 flex flex-col items-center justify-center gap-1.5",
                "transition-colors",
              )}
              style={{
                background: "var(--v4-bg-050)",
                border: "1px solid var(--v4-line-200)",
                borderRadius: 2,
                color: isActive ? "var(--v4-acc)" : "var(--v4-ink-300)",
              }}
              aria-current={isActive ? "page" : undefined}
            >
              {/* Active indicator — 2px bar at the top of the card. */}
              <span
                aria-hidden="true"
                className="absolute top-0 left-3 right-3"
                style={{
                  height: 2,
                  background: isActive ? "var(--v4-acc)" : "transparent",
                  boxShadow: isActive
                    ? "0 0 8px var(--v4-acc-glow)"
                    : undefined,
                }}
              />
              <Icon
                className="w-[18px] h-[18px]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span
                className="leading-none uppercase"
                style={{
                  fontFamily: "var(--v4-mono)",
                  fontSize: 9,
                  letterSpacing: "0.18em",
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
