// Pricing card — one tier per card. Pure presentation, no client state.
//
// Renders on the server so the pricing page ships without a JS bundle tax.
// All copy comes from the tier definition; this component is a dumb layout.

import type { BillingCadence, TierDefinition } from "@/lib/pricing/tiers";

export interface PricingCardProps {
  tier: TierDefinition;
  cadence: BillingCadence;
  /** Marks the most-prominent card (Pro). Adds a subtle accent border. */
  highlighted?: boolean;
}

// -----------------------------------------------------------------------------
// Price presentation
// -----------------------------------------------------------------------------

function formatDollarAmount(amount: number): string {
  if (amount === 0) return "$0";
  // Whole dollars only for tier pricing; no fractional cents on the card.
  return `$${amount.toLocaleString("en-US")}`;
}

function renderPrice(
  tier: TierDefinition,
  cadence: BillingCadence,
): { lead: string; cadenceHint: string } {
  if (tier.priceMonthlyUsd === null) {
    return { lead: "Custom", cadenceHint: "billed annually" };
  }
  if (cadence === "yearly" && tier.priceYearlyUsd !== null) {
    return {
      lead: formatDollarAmount(tier.priceYearlyUsd),
      cadenceHint: `per ${tier.includedSeats > 1 ? "seat " : ""}/ year`,
    };
  }
  return {
    lead: formatDollarAmount(tier.priceMonthlyUsd),
    cadenceHint: `per ${tier.includedSeats > 1 && tier.key === "team" ? "seat " : ""}/ month`,
  };
}

// -----------------------------------------------------------------------------
// Feature list — the 6-8 lines shown on the card
// -----------------------------------------------------------------------------

interface FeatureLine {
  label: string;
  /** Whether the feature is granted. Drives the ✓ vs — marker. */
  present: boolean;
  /** Override for the marker label (e.g., numeric caps "60 alerts"). */
  value?: string;
}

function buildFeatureLines(tier: TierDefinition): FeatureLine[] {
  const f = tier.features;
  const alerts =
    f.maxAlertRules === -1
      ? "Unlimited alerts"
      : f.maxAlertRules === 0
        ? "No alerts"
        : `${f.maxAlertRules} alerts`;
  const webhooks =
    f.maxWebhookTargets === -1
      ? "Unlimited webhooks"
      : f.maxWebhookTargets === 0
        ? "No webhooks"
        : `${f.maxWebhookTargets} webhook targets`;
  const watchlist =
    f.maxWatchlistRepos === -1
      ? "Unlimited watchlist"
      : `${f.maxWatchlistRepos} watchlist repos`;
  const rateLimit = `${f.rateLimitMultiplier}x rate-limit budget`;

  return [
    { label: alerts, present: f.maxAlertRules !== 0 },
    { label: webhooks, present: f.maxWebhookTargets !== 0 },
    { label: watchlist, present: f.maxWatchlistRepos !== 0 },
    { label: rateLimit, present: f.rateLimitMultiplier > 0 },
    { label: "CSV export", present: f.csvExport },
    { label: "Private watchlist", present: f.privateWatchlist },
    { label: "Weekly email digest", present: f.emailDigest },
    { label: "MCP usage reports", present: f.mcpUsageReports },
    { label: "Team workspace", present: f.teamWorkspace },
    { label: "Priority support", present: f.prioritySupport },
    { label: "Custom SLAs", present: f.customSlas },
    { label: "On-prem feed mirrors", present: f.onPremFeeds },
  ];
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function PricingCard({ tier, cadence, highlighted = false }: PricingCardProps) {
  const price = renderPrice(tier, cadence);
  const features = buildFeatureLines(tier);

  // Per-tier trim: free/pro show the first 8; team/enterprise all 12.
  const displayFeatures =
    tier.key === "team" || tier.key === "enterprise" ? features : features.slice(0, 8);

  const borderClass = highlighted
    ? "border-brand/60 shadow-[0_0_0_1px_var(--color-brand-subtle)]"
    : "border-border-primary";

  return (
    <article
      className={`relative flex h-full flex-col rounded-md border bg-bg-secondary/40 p-6 font-mono ${borderClass}`}
      data-tier={tier.key}
    >
      {highlighted ? (
        <span className="absolute -top-3 left-6 rounded-sm border border-brand/60 bg-bg-primary px-2 py-0.5 text-[10px] uppercase tracking-wider text-brand">
          Most popular
        </span>
      ) : null}

      <header>
        <h2 className="text-sm uppercase tracking-wider text-text-tertiary">
          {tier.displayName}
        </h2>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-4xl font-bold text-text-primary">{price.lead}</span>
          <span className="text-xs text-text-tertiary">{price.cadenceHint}</span>
        </div>
        <p className="mt-3 min-h-[2.5rem] text-sm text-text-secondary">{tier.tagline}</p>
        {tier.minSeats > 1 ? (
          <p className="mt-1 text-[11px] text-text-tertiary">
            {"// "}min {tier.minSeats} seats
          </p>
        ) : null}
      </header>

      <ul className="my-6 flex-1 space-y-2 text-sm">
        {displayFeatures.map((line) => (
          <li
            key={line.label}
            className={`flex items-start gap-2 ${
              line.present ? "text-text-primary" : "text-text-tertiary/60 line-through"
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 font-bold ${line.present ? "text-brand" : "text-border-primary"}`}
            >
              {line.present ? "+" : "-"}
            </span>
            <span>{line.label}</span>
          </li>
        ))}
      </ul>

      <footer>
        <a
          href={tier.ctaHref}
          className={`block w-full rounded-sm px-4 py-2.5 text-center text-sm uppercase tracking-wider transition ${
            highlighted
              ? "bg-brand text-bg-primary hover:opacity-90"
              : "border border-border-primary bg-bg-primary text-text-primary hover:border-brand/60 hover:text-brand"
          }`}
        >
          {tier.ctaLabel}
        </a>
      </footer>
    </article>
  );
}
