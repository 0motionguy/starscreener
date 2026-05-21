"use client";

// AccountSubnav — sticky .acc-subnav tab list with 8 buttons.
// Tab state is pure URL state (?tab=) so the page is deep-linkable.
// Now a client component because itshover icons use framer-motion.
// Active tab gets `.on`. Nav counts come in via props.

import type { ComponentType } from "react";
import Link from "next/link";
import {
  BookmarkIcon,
  CreditCard,
  DownloadIcon,
  FilledBellIcon,
  GearIcon,
  LockIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons-animated";
import type { AnimatedIconProps } from "@/components/icons-animated";

export const ACCOUNT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "watchlist", label: "Watchlist" },
  { id: "alerts", label: "Alerts" },
  { id: "referrals", label: "Referrals" },
  { id: "billing", label: "Billing" },
  { id: "api-keys", label: "API keys" },
  { id: "drops", label: "Drops" },
  { id: "settings", label: "Settings" },
] as const;

export type AccountTab = (typeof ACCOUNT_TABS)[number]["id"];

interface AccountSubnavProps {
  active: AccountTab;
  watchlistCount: number;
  alertsCount: number;
  referralsCount: number;
  apiKeysCount: number;
  dropsCount: number;
}

const TAB_ICON: Record<AccountTab, ComponentType<AnimatedIconProps>> = {
  overview: UserIcon,
  watchlist: BookmarkIcon,
  alerts: FilledBellIcon,
  referrals: UsersIcon,
  billing: CreditCard,
  "api-keys": LockIcon,
  drops: DownloadIcon,
  settings: GearIcon,
};

function TabIcon({ tab }: { tab: AccountTab }) {
  const Icon = TAB_ICON[tab];
  return <Icon size={14} strokeWidth={1.5} color="currentColor" aria-hidden="true" />;
}

function countFor(tab: AccountTab, props: AccountSubnavProps): number | null {
  switch (tab) {
    case "watchlist":
      return props.watchlistCount;
    case "alerts":
      return props.alertsCount;
    case "referrals":
      return props.referralsCount;
    case "api-keys":
      return props.apiKeysCount;
    case "drops":
      return props.dropsCount;
    default:
      return null;
  }
}

export function AccountSubnav(props: AccountSubnavProps) {
  return (
    <aside
      className="acc-subnav"
      role="tablist"
      aria-label="Account sections"
      data-tabset
      data-panel-group="account"
    >
      {ACCOUNT_TABS.map((tab) => {
        const count = countFor(tab.id, props);
        const isActive = props.active === tab.id;
        return (
          <Link
            key={tab.id}
            href={{ pathname: "/account", query: { tab: tab.id } }}
            className={`acc-subnav-link${isActive ? " on" : ""}`}
            prefetch={false}
            role="tab"
            aria-current={isActive ? "page" : undefined}
            aria-selected={isActive}
            aria-controls={`account-panel-${tab.id}`}
            id={`account-tab-${tab.id}`}
            data-tab={tab.id}
          >
            <TabIcon tab={tab.id} />
            <span>{tab.label}</span>
            {count !== null ? (
              <span className="nav-count">{count.toLocaleString()}</span>
            ) : null}
          </Link>
        );
      })}
    </aside>
  );
}
