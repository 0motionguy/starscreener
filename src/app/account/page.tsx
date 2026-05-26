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

import {
  AccountWatchlistPreview,
  type AccountWatchlistRow,
} from "@/components/account/AccountWatchlistPreview";
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

const MANAGE_LINKS = [
  { href: "/account/alerts", label: "Alerts" },
  { href: "/account/referrals", label: "Referrals" },
  { href: "/account/api-keys", label: "API keys" },
  { href: "/account/drops", label: "Drops" },
  { href: "/account/settings", label: "Settings" },
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
      <AccountWatchlistPreview repos={watchlistRepos} expanded />
      <AccountBillingPanel tier={ctx.tier} tierRecord={ctx.tierRecord} />
      <nav className="acc-manage" aria-label="More account sections">
        {MANAGE_LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
