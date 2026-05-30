// /account — your watchlist + plan, plus links to the power-user sections.
//
// The identity hero + Clerk gate live in src/app/account/layout.tsx via
// loadAccountContext(). This page is the "overview": watchlist preview,
// billing/upgrade card, and a slim row of links to the dedicated sub-routes
// (alerts / referrals / api-keys / drops / settings).

import Link from "next/link";

import { loadAccountContext } from "@/lib/account/load";
import { refreshTrendingFromStore } from "@/lib/trending";
import {
  getDerivedRepoByFullName,
  getDerivedRepos,
} from "@/lib/derived-repos";
import { Icon } from "@/lib/icons";

import {
  AccountWatchlistPreview,
  type AccountWatchlistRow,
} from "@/components/account/AccountWatchlistPreview";
import { AccountAlertInbox } from "@/components/account/AccountAlertInbox";
import { AccountBillingPanel } from "@/components/account/AccountBillingPanel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Account",
  description: "Your watchlist and plan on TrendingRepo.",
  robots: { index: false, follow: false },
};

function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  return fn().catch((err) => {
    console.warn("[account/page] safe() recovered:", err);
    return fallback;
  });
}

const WATCHLIST_ALERTS = [
  "release + velocity",
  "breakout +24%",
  "HN mention",
  "star threshold",
  "source consensus",
  "weekly digest",
];

const FALLBACK_WATCHLIST_FULL_NAMES = [
  "openai/codex",
  "modelcontextprotocol/servers",
  "vercel/ai-sdk",
  "cline/cline",
  "vercel/next.js",
  "anthropics/claude-code",
];

interface ManageLink {
  href: string;
  label: string;
  icon: string;
  description: string;
  /** Optional count badge (e.g. drops pending review, unread alerts). */
  count?: number;
}

const MANAGE_LINKS: ManageLink[] = [
  {
    href: "/account/alerts",
    label: "Alerts",
    icon: "bell",
    description: "Threshold + breakout rules",
  },
  {
    href: "/account/referrals",
    label: "Referrals",
    icon: "share",
    description: "Invite codes & rewards",
  },
  {
    href: "/account/api-keys",
    label: "API keys",
    icon: "key",
    description: "Programmatic access tokens",
  },
  {
    href: "/account/drops",
    label: "Drops",
    icon: "inbox",
    description: "Submitted repos awaiting review",
  },
  {
    href: "/account/settings",
    label: "Settings",
    icon: "settings",
    description: "Profile, email & preferences",
  },
];

export default async function AccountPage() {
  const ctx = await loadAccountContext();

  // Watchlist preview — enrich each fullName with derived repo stats so
  // AccountWatchlistPreview can emit the shell.js spark contract per row.
  // Fall back to a curated list only for the visual preview when the user
  // has no saved repos yet (the hero's watching count stays honest).
  await safe(async () => {
    await refreshTrendingFromStore();
  }, undefined);
  const derivedRepos = await safe(async () => getDerivedRepos(), []);
  const watchlistFullNames = ctx.watchlistFullNames.length
    ? ctx.watchlistFullNames
    : derivedRepos.length
      ? derivedRepos.slice(0, 6).map((repo) => repo.fullName)
      : FALLBACK_WATCHLIST_FULL_NAMES;

  const watchlistRepos: AccountWatchlistRow[] = watchlistFullNames
    .map((fullName) => {
      const [owner = "", name = ""] = fullName.split("/");
      let row: AccountWatchlistRow = { fullName, owner, name };
      try {
        const derived = getDerivedRepoByFullName(fullName);
        if (derived) {
          row = {
            ...row,
            language: derived.language ?? null,
            category: derived.categoryId ?? null,
            stars: derived.stars ?? null,
            starsDelta24h: derived.starsDelta24h ?? null,
            sparklineData: derived.sparklineData ?? null,
          };
        }
      } catch {
        // Keep the bare row so the surface still renders.
      }
      return row;
    })
    .map((row, index) => ({
      ...row,
      alertLabel: WATCHLIST_ALERTS[index % WATCHLIST_ALERTS.length],
    }));

  return (
    <div className="col gap-4">
      <div className="acc-split">
        <AccountWatchlistPreview repos={watchlistRepos} expanded />
        <AccountAlertInbox events={[]} />
      </div>
      <AccountBillingPanel tier={ctx.tier} tierRecord={ctx.tierRecord} />
      <nav className="acc-manage-grid" aria-label="More account sections">
        {MANAGE_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="acc-manage-card">
            <span className="acc-manage-icon" aria-hidden="true">
              <Icon name={link.icon} size={16} />
            </span>
            <span className="acc-manage-text">
              <span className="acc-manage-label">
                {link.label}
                {typeof link.count === "number" && link.count > 0 ? (
                  <span className="acc-manage-count">{link.count}</span>
                ) : null}
              </span>
              <span className="acc-manage-desc">{link.description}</span>
            </span>
            <span className="acc-manage-chev" aria-hidden="true">
              <Icon name="chevron-right" size={12} />
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
