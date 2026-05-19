// RevenueLeaderboard — verified revenue leaderboard table (.rev-row).
// Rows are presentational; sort/filter/paging happens in the page.

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
}

function fmtMrr(cents: number | null): string {
  if (!cents || cents <= 0) return "—";
  const usd = cents / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(usd >= 10_000_000 ? 2 : 2)}M`;
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
  if (pct === null || !Number.isFinite(pct)) return "—";
  if (Math.abs(pct) < 0.5) return "+stable";
  return pct >= 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
}

function providerSlug(provider: string | null): string {
  const slug = (provider ?? "").toLowerCase();
  if (slug.includes("stripe")) return "stripe";
  if (slug.includes("lemon")) return "lemon";
  if (slug.includes("paddle")) return "paddle";
  return slug || "—";
}

function logoLetter(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function descLine(s: VerifiedStartup): string {
  const parts: string[] = [];
  if (s.website) {
    const host = s.website.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    parts.push(host);
  }
  if (s.description) parts.push(s.description);
  if (s.matchedRepoFullName) parts.push(`matched ${s.matchedRepoFullName}`);
  if (s.country) parts.push(s.country);
  return parts.join(" · ");
}

export function RevenueLeaderboard({
  rows,
  totalInFilter,
  totalCorpus,
  combinedRevenueUsd,
  selectedCategoryId,
  categoryPills,
}: RevenueLeaderboardProps) {
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
        <span></span>
        <span>Startup</span>
        <span className="right">MRR / 30d rev</span>
        <span className="right">last 30d</span>
        <span className="right">Δ 30d</span>
        <span className="right">PP</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "32px 16px", color: "var(--fg-muted)", fontSize: 12 }}>
          Catalog payload not loaded yet — leaderboard will populate after the
          next TrustMRR sync.
        </div>
      ) : (
        <div>
          {rows.map((s, i) => {
            const growth = fmtGrowth(s.growthMrr30d);
            const growthClass =
              s.growthMrr30d === null
                ? ""
                : s.growthMrr30d >= 0
                  ? "up"
                  : "down";
            return (
              <div className="rev-row" key={s.slug ?? `${s.name}-${i}`}>
                <span className="rr-rank">{i + 1}</span>
                <div className="rr-logo">{logoLetter(s.name)}</div>
                <div className="rr-co">
                  <span className="name">
                    {s.name}{" "}
                    <span className="rr-verified" aria-label="verified revenue">
                      ✓
                    </span>
                  </span>
                  <span className="desc">{descLine(s)}</span>
                </div>
                <span className="rr-mrr">{fmtMrr(s.mrrCents)}</span>
                <span className="rr-30d">{fmtMrr(s.last30DaysCents)}</span>
                <span className={`rr-growth ${growthClass}`}>{growth}</span>
                <span className="rr-pp">{providerSlug(s.paymentProvider)}</span>
              </div>
            );
          })}
        </div>
      )}

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
          Showing {rows.length} of {totalCorpus.toLocaleString()} · use category
          filters or search
        </span>
        <span style={{ color: "var(--accent)", fontWeight: 600 }}>
          Full catalog · PRO
        </span>
      </div>
    </div>
  );
}
