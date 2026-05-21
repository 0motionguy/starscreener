import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { TierDefinition } from "@/lib/pricing/tiers";
import type { UserTierRecord } from "@/lib/pricing/user-tiers";

interface AccountBillingPanelProps {
  tier: TierDefinition;
  tierRecord: UserTierRecord | null;
}

function maskSubscriptionId(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function AccountBillingPanel({
  tier,
  tierRecord,
}: AccountBillingPanelProps) {
  const price =
    tier.priceMonthlyUsd === null
      ? "custom"
      : tier.priceMonthlyUsd === 0
        ? "$0"
        : `$${tier.priceMonthlyUsd}/mo`;
  const isFree = tier.key === "free";
  const watchCap =
    tier.features.maxWatchlistRepos < 0
      ? "unlimited"
      : tier.features.maxWatchlistRepos.toLocaleString();
  const alertCap =
    tier.features.maxAlertRules < 0
      ? "unlimited"
      : tier.features.maxAlertRules.toLocaleString();

  return (
    <section className="card" aria-labelledby="account-billing-head">
      <div className="card-head">
        <h2 className="card-title" id="account-billing-head">
          <b>Billing</b> &middot; current plan
        </h2>
        <span className="grow" />
        <span className="tag">{tier.key.toUpperCase()}</span>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 12 }}>
        <div className="g-3">
          <div className="kpi">
            <span className="kpi-label">Plan</span>
            <span className="kpi-value">{tier.displayName}</span>
            <span className="kpi-delta">{price}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Watchlist cap</span>
            <span className="kpi-value">{watchCap}</span>
            <span className="kpi-delta">repos</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Alert rules</span>
            <span className="kpi-value">{alertCap}</span>
            <span className="kpi-delta">rules</span>
          </div>
        </div>
        <div className="feed-item">
          <b>Subscription</b>
          <span>
            {tierRecord?.stripeSubscriptionId
              ? `Stripe ${maskSubscriptionId(tierRecord.stripeSubscriptionId)}`
              : "No paid subscription record attached."}
          </span>
        </div>
        {isFree ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              paddingTop: 8,
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            <span className="muted" style={{ fontSize: 11 }}>
              Unlock unlimited watchlist, API access and email digest.
            </span>
            <Link className="btn primary sm" href="/pricing">
              <ArrowUpRight size={14} strokeWidth={1.8} aria-hidden="true" />
              Upgrade plan
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
