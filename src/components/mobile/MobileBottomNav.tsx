"use client";

// MobileBottomNav — the route-aware 5-tab bottom navigation (app-native).
//
// Radar / Discover / Ask (center primary) / Watchlist / More. Route tabs are
// <Link>; Ask + More open full-screen sheets. Active state is aria-current +
// a top accent bar. Hidden >768px and clear of the home indicator via
// env(safe-area-inset-bottom) — see .mapp-bottom-nav in shell.css.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon/Icon";
import { useMobileApp, type MobileSheetId } from "./MobileAppProvider";

interface Tab {
  key: string;
  label: string;
  icon: string;
  href?: string;
  sheet?: MobileSheetId;
  center?: boolean;
}

const TABS: Tab[] = [
  { key: "radar", label: "Radar", icon: "radar", href: "/" },
  { key: "discover", label: "Discover", icon: "compass", href: "/breakout" },
  { key: "ask", label: "Ask", icon: "messages-square", sheet: "ask", center: true },
  { key: "watchlist", label: "Watchlist", icon: "eye", href: "/tools/watchlist" },
  { key: "more", label: "More", icon: "grid", sheet: "more" },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { activeSheet, toggleSheet } = useMobileApp();

  const routeActive = (href: string): boolean => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav className="mapp-bottom-nav" aria-label="Primary">
      {TABS.map((tab) => {
        const active = tab.sheet
          ? activeSheet === tab.sheet
          : Boolean(tab.href && routeActive(tab.href) && !activeSheet);
        const className = `mapp-tab${tab.center ? " mapp-tab-center" : ""}${
          active ? " active" : ""
        }`;
        const inner = (
          <>
            <span className="mapp-tab-bar" aria-hidden="true" />
            <span className="mapp-tab-ico">
              <Icon name={tab.icon} size={tab.center ? 19 : 17} />
            </span>
            <span className="mapp-tab-label">{tab.label}</span>
          </>
        );

        if (tab.sheet) {
          return (
            <button
              type="button"
              key={tab.key}
              className={className}
              aria-haspopup="dialog"
              aria-expanded={active}
              onClick={() => toggleSheet(tab.sheet as MobileSheetId)}
            >
              {inner}
            </button>
          );
        }

        return (
          <Link
            key={tab.key}
            href={tab.href as string}
            className={className}
            aria-current={active ? "page" : undefined}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
