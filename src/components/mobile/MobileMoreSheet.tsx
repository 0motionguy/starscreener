"use client";

// MobileMoreSheet — the "More" bottom sheet: every route the bottom nav
// doesn't surface, grouped exactly as the sidebar / ⌘K registry groups them
// (NAV_COMMANDS is the single source of truth, kept in sync with the sidebar).
//
// Plus the PWA "Install" affordance, which is NOT a route (/install does not
// exist) — it appears only when the browser fires beforeinstallprompt and is
// dismissed after the user chooses. Full PWA polish (manifest shortcuts,
// offline shell) lands in Wave 6.

import { useEffect, useState } from "react";
import Link from "next/link";
import { NAV_COMMANDS } from "@/lib/nav-commands";
import { Icon } from "@/components/icon/Icon";
import { MobileSheet } from "./MobileSheet";
import { useMobileApp } from "./MobileAppProvider";

// Render order for the sidebar groups (any group present in NAV_COMMANDS but
// missing here is appended after, so nothing silently drops).
const GROUP_ORDER = ["Discover", "View", "Tools", "Market", "Resources", "Account"];
const GROUP_ICON: Record<string, string> = {
  Discover: "compass",
  View: "eye",
  Tools: "hammer",
  Market: "dollar",
  Resources: "book",
  Account: "key",
};

function orderedGroups() {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const g of GROUP_ORDER) {
    if (NAV_COMMANDS.some((c) => c.group === g)) {
      order.push(g);
      seen.add(g);
    }
  }
  for (const c of NAV_COMMANDS) {
    if (!seen.has(c.group)) {
      order.push(c.group);
      seen.add(c.group);
    }
  }
  return order.map((group) => ({
    group,
    items: NAV_COMMANDS.filter((c) => c.group === group),
  }));
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function MobileInstallRow() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred) return null;

  const install = async () => {
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <div className="mapp-more-group">
      <div className="mapp-more-group-head">
        <Icon name="download" size={12} />
        <span>App</span>
      </div>
      <button type="button" className="mapp-more-row mapp-more-install" onClick={install}>
        <span className="mapp-more-label">Install TrendingRepo</span>
        <Icon name="download" size={16} className="mapp-more-chev" />
      </button>
    </div>
  );
}

export function MobileMoreSheet() {
  const { closeSheet } = useMobileApp();
  const groups = orderedGroups();

  return (
    <MobileSheet id="more" title="More">
      <nav className="mapp-more" aria-label="All sections">
        {groups.map(({ group, items }) => (
          <div className="mapp-more-group" key={group}>
            <div className="mapp-more-group-head">
              <Icon name={GROUP_ICON[group] ?? "grid"} size={12} />
              <span>{group}</span>
            </div>
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="mapp-more-row"
                onClick={closeSheet}
              >
                <span className="mapp-more-label">{item.label}</span>
                <Icon name="chevron-right" size={16} className="mapp-more-chev" />
              </Link>
            ))}
          </div>
        ))}
        <MobileInstallRow />
      </nav>
    </MobileSheet>
  );
}
