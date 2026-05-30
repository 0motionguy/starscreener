// AccountBillingPanel — dense one-card billing strip (operator decree
// 2026-05-30: collapse the 3 stats into a single horizontal row, keep the
// subscription line + upgrade CTA but compact). Same data + same routes,
// just denser. Mirrors the `.models-stats` strip pattern from the models
// surface so the visual language stays consistent across the app.

import Link from "next/link";
import { Icon } from "@/lib/icons";
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
      ? "∞"
      : tier.features.maxWatchlistRepos.toLocaleString();
  const alertCap =
    tier.features.maxAlertRules < 0
      ? "∞"
      : tier.features.maxAlertRules.toLocaleString();
  const subscriptionLabel = tierRecord?.stripeSubscriptionId
    ? `Stripe · ${maskSubscriptionId(tierRecord.stripeSubscriptionId)}`
    : "No paid subscription record attached";

  return (
    <section className="card billing-strip" aria-labelledby="account-billing-head">
      <div className="card-head">
        <h2 className="card-title" id="account-billing-head">
          <b>Billing</b> &middot; current plan
        </h2>
        <span className="grow" />
        <span className="tag">{tier.key.toUpperCase()}</span>
      </div>

      <div className="billing-stats">
        <div className="billing-stat">
          <span className="billing-stat-k">Plan</span>
          <span className="billing-stat-v">{tier.displayName}</span>
          <span className="billing-stat-sub">{price}</span>
        </div>
        <div className="billing-stat">
          <span className="billing-stat-k">Watchlist cap</span>
          <span className="billing-stat-v">{watchCap}</span>
          <span className="billing-stat-sub">repos</span>
        </div>
        <div className="billing-stat">
          <span className="billing-stat-k">Alert rules</span>
          <span className="billing-stat-v">{alertCap}</span>
          <span className="billing-stat-sub">rules</span>
        </div>
        <div className="billing-stat billing-stat-sub-only">
          <span className="billing-stat-k">Subscription</span>
          <span className="billing-stat-sub-line" title={subscriptionLabel}>
            {subscriptionLabel}
          </span>
        </div>
      </div>

      {isFree ? (
        <div className="billing-cta">
          <span className="billing-cta-copy">
            <Icon name="sparkles" size={12} />
            Unlock unlimited watchlist, API access &amp; email digest
          </span>
          <Link className="btn primary sm" href="/pricing">
            <Icon name="arrow-up-right" size={12} />
            Upgrade plan
          </Link>
        </div>
      ) : null}
    </section>
  );
}
