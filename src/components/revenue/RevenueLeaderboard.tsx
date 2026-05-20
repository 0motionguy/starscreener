import Link from "next/link";

import type { VerifiedStartup } from "@/lib/revenue-startups";

import {
  CategoryFilterPills,
  type CategoryPillItem,
} from "./CategoryFilterPills";

interface RevenueLeaderboardProps {
  rows: VerifiedStartup[];
  totalInFilter: number;
  totalCorpus: number;
  combinedRevenueUsd: number;
  selectedCategoryId: string;
  categoryPills: CategoryPillItem[];
  nextLimit: number | null;
}

function fmtMrr(cents: number | null): string {
  if (!cents || cents <= 0) return "-";
  const usd = cents / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
  return `$${Math.round(usd)}`;
}

function fmtCombined(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(0)}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
  return `$${Math.round(usd)}`;
}

function fmtGrowth(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "+stable";
  if (Math.abs(pct) < 0.5) return "+stable";
  return pct >= 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
}

function providerSlug(provider: string | null): string {
  const slug = (provider ?? "").toLowerCase();
  if (slug.includes("stripe")) return "stripe";
  if (slug.includes("lemon")) return "lemon";
  if (slug.includes("paddle")) return "paddle";
  return slug || "verified";
}

function logoLetter(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function descLine(startup: VerifiedStartup): string {
  const parts: string[] = [];
  if (startup.website) {
    const host = startup.website
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "");
    parts.push(host);
  }
  if (startup.description) parts.push(startup.description);
  if (startup.matchedRepoFullName) {
    parts.push(`matched ${startup.matchedRepoFullName}`);
  }
  if (startup.country) parts.push(startup.country);
  return parts.join(" · ");
}

export function RevenueLeaderboard({
  rows,
  totalInFilter,
  totalCorpus,
  combinedRevenueUsd,
  selectedCategoryId,
  categoryPills,
  nextLimit,
}: RevenueLeaderboardProps) {
  const nextHref =
    nextLimit === null
      ? null
      : { query: { cat: selectedCategoryId, limit: String(nextLimit) } };

  return (
    <div className="panel fade-up">
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 02"}</span>
        <span className="ph-title">Verified revenue leaderboard</span>
        <span className="ph-meta">
          <b>{totalInFilter.toLocaleString()}</b> of{" "}
          {totalCorpus.toLocaleString()} · dev-adjacent · combined{" "}
          {fmtCombined(combinedRevenueUsd)} / 30d
        </span>
      </div>

      <CategoryFilterPills
        items={categoryPills}
        selectedId={selectedCategoryId}
      />

      <div className="rev-table-head">
        <span className="right">#</span>
        <span />
        <span>Startup</span>
        <span className="right">MRR / 30d rev</span>
        <span className="right">last 30d</span>
        <span className="right">delta 30d</span>
        <span className="right">PP</span>
      </div>

      <div>
        {rows.map((startup, index) => {
          const growthClass =
            startup.growthMrr30d === null
              ? ""
              : startup.growthMrr30d >= 0
                ? "up"
                : "down";
          return (
            <div className="rev-row" key={startup.slug ?? `${startup.name}-${index}`}>
              <span className="rr-rank">{index + 1}</span>
              <div className="rr-logo">{logoLetter(startup.name)}</div>
              <div className="rr-co">
                <span className="name">
                  {startup.name}{" "}
                  <span className="rr-verified" aria-label="verified revenue">
                    &#10003;
                  </span>
                </span>
                <span className="desc">{descLine(startup)}</span>
              </div>
              <span className="rr-mrr">{fmtMrr(startup.mrrCents)}</span>
              <span className="rr-30d">{fmtMrr(startup.last30DaysCents)}</span>
              <span className={`rr-growth ${growthClass}`}>
                {fmtGrowth(startup.growthMrr30d)}
              </span>
              <span className="rr-pp">
                {providerSlug(startup.paymentProvider)}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          padding: "14px 16px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--fg-muted)",
        }}
      >
        <span>
          Showing {rows.length} of {totalCorpus.toLocaleString()} · use
          category filters or search
        </span>
        {nextHref ? (
          <Link
            href={nextHref}
            prefetch={false}
            style={{ color: "var(--accent)", fontWeight: 600 }}
          >
            Load 50 more -&gt;
          </Link>
        ) : (
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>
            Full filter loaded
          </span>
        )}
      </div>
    </div>
  );
}
