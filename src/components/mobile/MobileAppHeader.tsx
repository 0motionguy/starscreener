"use client";

// MobileAppHeader — the app-native top chrome that replaces the desktop
// Topbar/Ticker/Statusbar on mobile (see shell.css: `.mapp-on .topbar` etc.
// are hidden ≤767px when the shell is live). Compact: brand + current screen
// title on the left, Search (opens the search sheet) + Account on the right.
// Sits above the safe-area inset; the hamburger drawer is retired here — the
// bottom nav + More sheet are the whole navigation surface.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon/Icon";
import { useMobileApp } from "./MobileAppProvider";

// Titles for the routes the app surfaces directly. Nested/leaf routes fall
// back to the longest matching prefix, then to a prettified path segment.
const TITLES: Record<string, string> = {
  "/": "Radar",
  "/breakout": "Discover",
  "/tools/watchlist": "Watchlist",
  "/tools/top-10": "Top 10",
  "/tools/star-history": "Star History",
  "/tools/tier-list": "Tier List",
  "/tools/compare": "Compare",
  "/market-signals": "Mentions",
  "/funding": "Funding",
  "/revenue": "Revenue",
  "/agent-commerce": "Agent Commerce",
  "/models": "Models",
  "/account": "Account",
  "/drop": "Drop a repo",
  "/categories": "Categories",
  "/best": "Best Of",
  "/collections": "Collections",
  "/blog": "Blog",
  "/glossary": "Glossary",
};

function titleFor(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const prefix = Object.keys(TITLES)
    .filter((k) => k !== "/" && pathname.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (prefix) return TITLES[prefix];
  const seg = pathname.split("/").filter(Boolean).pop() ?? "";
  return seg
    ? seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "TrendingRepo";
}

export function MobileAppHeader() {
  const pathname = usePathname();
  const { openSheet } = useMobileApp();
  const title = titleFor(pathname);

  return (
    <header className="mapp-header" aria-label="App header">
      <Link href="/" className="mapp-header-brand" aria-label="TrendingRepo home">
        <span className="mapp-header-eyebrow">TrendingRepo</span>
        <span className="mapp-header-title">{title}</span>
      </Link>
      <div className="mapp-header-actions">
        <button
          type="button"
          className="mapp-header-btn"
          aria-label="Search"
          aria-haspopup="dialog"
          onClick={() => openSheet("search")}
        >
          <Icon name="search" size={18} />
        </button>
        <Link href="/account" className="mapp-header-btn" aria-label="Account">
          <Icon name="user" size={18} />
        </Link>
      </div>
    </header>
  );
}
