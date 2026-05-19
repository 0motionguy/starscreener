// RevenueHero — page-head for /revenue with segmented category filter.
// Mirrors the .rev-head + .page-eyebrow/.page-title chrome from 10-revenue.html.
// Freshness wires honest verdict via classifyFreshness("revenue", fetchedAt) —
// 36h budget matching the daily-ish TrustMRR catalog sync cadence.
//
// URL contract: ?cat=all|dev-tools|ai|saas|content|analytics|fintech|education

import Link from "next/link";

import { classifyFreshness } from "@/lib/news/freshness";

export const CATEGORY_FILTERS = [
  { id: "all", label: "All" },
  { id: "dev-tools", label: "Dev tools" },
  { id: "ai", label: "AI" },
  { id: "content", label: "Content" },
] as const;

export type RevenueCategoryFilter = (typeof CATEGORY_FILTERS)[number]["id"];

interface RevenueHeroProps {
  selectedCategory: RevenueCategoryFilter;
  verifiedCount: number;
  ossMatchCount: number;
  /** ISO of the underlying trustmrr catalog generation; classified into LIVE/WARM/STALE. */
  fetchedAt: string | null;
}

export function RevenueHero({
  selectedCategory,
  verifiedCount,
  ossMatchCount,
  fetchedAt,
}: RevenueHeroProps) {
  const fresh = classifyFreshness("revenue", fetchedAt ?? null);
  const statusLabel =
    fresh.status === "live" ? "LIVE" : fresh.status === "warn" ? "WARM" : "STALE";

  return (
    <div className="rev-head">
      <div>
        <div className="page-eyebrow">
          <span className={`live-dot ${fresh.status}`} />{" "}
          <b>REVENUE TERMINAL</b> · /revenue · {verifiedCount.toLocaleString()}{" "}
          verified startups · {ossMatchCount} with OSS repo match · {statusLabel}{" "}
          · {fresh.ageLabel}
        </div>
        <h1 className="page-title">Verified MRR for the trending repo desk.</h1>
        <p className="page-sub">
          Revenue verified through{" "}
          <b>direct read-only sync with payment providers</b> — Stripe, Lemon
          Squeezy, Paddle. Tracked OSS matches up top. Broader dev-adjacent
          catalog below. Founders: submit your own MRR and surface here with a
          green check.
        </p>
      </div>
      <div className="segmented" role="group" aria-label="Category filter">
        {CATEGORY_FILTERS.map((c) => (
          <Link
            key={c.id}
            href={{ query: { cat: c.id } }}
            className={c.id === selectedCategory ? "on" : ""}
            prefetch={false}
          >
            {c.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
