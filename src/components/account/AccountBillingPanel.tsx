import type { TierDefinition } from "@/lib/pricing/tiers";
import type { UserTierRecord } from "@/lib/pricing/user-tiers";

interface AccountBillingPanelProps {
  tier: TierDefinition;
  tierRecord: UserTierRecord | null;
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

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Billing</b> · current plan
        </h2>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 10 }}>
        <div className="kpi">
          <span className="kpi-label">Plan</span>
          <span className="kpi-value">{tier.displayName}</span>
          <span className="kpi-delta">{price}</span>
        </div>
        <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12 }}>
          {tierRecord?.stripeSubscriptionId
            ? `Stripe subscription ${tierRecord.stripeSubscriptionId}`
            : "No paid subscription record attached."}
        </p>
      </div>
    </section>
  );
}
