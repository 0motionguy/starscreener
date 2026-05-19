// AccountSubnav — sticky .acc-subnav tab list with 8 buttons.
// Tab state is pure URL state (?tab=) so the page is RSC-friendly and
// deep-linkable. Active tab gets `.on`. Nav counts come in via props.

import Link from "next/link";

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

const ICON_PATH: Record<AccountTab, string> = {
  overview: "M2 14L6 9L9 12L14 5",
  watchlist:
    "M8 2l1.8 4 4.2.4-3.2 2.9.9 4.3L8 11.5l-3.7 2.1.9-4.3L2 6.4l4.2-.4L8 2z",
  alerts: "M3 12V8a5 5 0 0110 0v4l1 2H2l1-2z",
  referrals: "", // multi-shape; handled below
  billing: "M2 4h12v8H2zM2 7h12",
  "api-keys": "M11 3a3 3 0 11-3 3l-5 5v2h2l5-5",
  drops: "M10 3v10m0 0l-4-4m4 4l4-4M3 17h14",
  settings: "M5 6.5a3 3 0 015.5 1.5c0 1.5-2 1.5-2.5 3M8 13v.5",
};

function TabIcon({ tab }: { tab: AccountTab }) {
  if (tab === "referrals") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="5" r="2.5" />
        <circle cx="3" cy="11" r="2" />
        <circle cx="13" cy="11" r="2" />
        <path d="M6 7L4 9m4-2l2 2" />
      </svg>
    );
  }
  if (tab === "settings") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" />
        <path d={ICON_PATH[tab]} />
      </svg>
    );
  }
  if (tab === "billing") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="4" width="12" height="8" rx="1" />
        <path d="M2 7h12" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d={ICON_PATH[tab]} />
    </svg>
  );
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
    <aside className="acc-subnav" role="navigation" aria-label="Account sections">
      {ACCOUNT_TABS.map((tab) => {
        const count = countFor(tab.id, props);
        const isActive = props.active === tab.id;
        return (
          <Link
            key={tab.id}
            href={{ pathname: "/account", query: { tab: tab.id } }}
            className={`acc-subnav-link${isActive ? " on" : ""}`}
            prefetch={false}
            aria-current={isActive ? "page" : undefined}
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
