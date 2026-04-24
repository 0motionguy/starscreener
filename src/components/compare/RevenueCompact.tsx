"use client";

// Revenue mini-module for compare columns. Verified MRR wins if present;
// otherwise falls back to self-reported or a TrustMRR claim hint. Empty
// state is the subtle "—" marker — we explicitly do NOT inflate the column
// with a big "No revenue data" panel.

import { DollarSign } from "lucide-react";
import type { CanonicalRepoProfileRevenue } from "@/lib/api/repo-profile";

interface RevenueCompactProps {
  revenue: CanonicalRepoProfileRevenue;
}

function formatMrr(cents: number | null | undefined): string | null {
  if (cents == null || cents <= 0) return null;
  const usd = cents / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1000)}k`;
  return `$${Math.round(usd)}`;
}

export function RevenueCompact({ revenue }: RevenueCompactProps) {
  const { verified, selfReported, trustmrrClaim } = revenue;
  const primary = verified ?? selfReported ?? trustmrrClaim;
  const mrr = formatMrr(primary?.mrrCents ?? null);
  const tier = verified
    ? "verified"
    : selfReported
      ? "self"
      : trustmrrClaim
        ? "claim"
        : null;

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <DollarSign size={12} className="text-accent-green shrink-0" />
        <span className="text-xs font-mono uppercase tracking-wider text-text-tertiary">
          Revenue
        </span>
      </div>
      {mrr ? (
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-sm font-mono font-semibold text-accent-green tabular-nums">
            {mrr}
            <span className="text-text-tertiary font-normal">/mo</span>
          </span>
          {tier === "verified" && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-accent-green/80 shrink-0">
              verified
            </span>
          )}
          {tier === "self" && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary shrink-0">
              self
            </span>
          )}
          {tier === "claim" && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary shrink-0">
              claim
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-tertiary">—</p>
      )}
    </div>
  );
}
