"use client";

// MobileAppHeader — the app-native top chrome that replaces the desktop
// Topbar/Ticker/Statusbar on mobile (shell.css hides them ≤767px when the
// shell is live). Compact: brand + current screen title on the left, Search +
// Account on the right. On a /repo/* detail route it becomes a back-aware
// header (back button + owner/repo), so the detail screen reads as a pushed
// app view. The hamburger drawer is retired here — the bottom nav + More sheet
// are the whole navigation surface.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icon/Icon";
import { useMobileApp } from "./MobileAppProvider";

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
  return seg ? seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "TrendingRepo";
}

// `/repo/<owner>/<name>` (and its subroutes) → "owner/name", else null.
function repoLabelFor(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  return parts[0] === "repo" && parts.length >= 3 ? `${parts[1]}/${parts[2]}` : null;
}

export function MobileAppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { openSheet } = useMobileApp();
  const repoLabel = repoLabelFor(pathname);

  return (
    <header className="mapp-header" aria-label="App header">
      {repoLabel ? (
        <>
          <button
            type="button"
            className="mapp-header-back"
            aria-label="Back"
            onClick={() => router.back()}
          >
            <Icon name="arrow-left" size={18} />
          </button>
          <span className="mapp-header-brand">
            <span className="mapp-header-eyebrow">Repository</span>
            <span className="mapp-header-title">{repoLabel}</span>
          </span>
        </>
      ) : (
        <Link href="/" className="mapp-header-brand" aria-label="TrendingRepo home">
          <span className="mapp-header-eyebrow">TrendingRepo</span>
          <span className="mapp-header-title">{titleFor(pathname)}</span>
        </Link>
      )}
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
