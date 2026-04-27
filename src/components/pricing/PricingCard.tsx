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
    ? "border-[color:var(--v2-acc)]"
    : "border-[color:var(--v2-line-200)]";

  return (
    <article
      className={`relative flex h-full flex-col border bg-[color:var(--v2-bg-050)] p-6 font-mono ${borderClass}`}
      style={{ borderRadius: 2 }}
      data-tier={tier.key}
    >
      {highlighted ? (
        <span
          className="v2-tag absolute -top-3 left-6"
          style={{
            background: "var(--v2-acc-soft)",
            borderColor: "var(--v2-acc)",
            color: "var(--v2-acc)",
          }}
        >
          MOST POPULAR
        </span>
      ) : null}

      <header>
        <h2
          className="v2-mono"
          style={{ fontSize: 11, color: "var(--v2-ink-400)" }}
        >
          {`// ${tier.displayName.toUpperCase()}`}
        </h2>
        <div className="mt-3 flex items-baseline gap-2">
          <span
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontSize: 36,
              fontWeight: 510,
              letterSpacing: "-0.022em",
              color: "var(--v2-ink-000)",
              lineHeight: 1,
            }}
          >
            {price.lead}
          </span>
          <span
            className="v2-mono"
            style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
          >
            {price.cadenceHint}
          </span>
        </div>
        <p
          className="mt-3 min-h-[2.5rem]"
          style={{ fontSize: 13, color: "var(--v2-ink-200)" }}
        >
          {tier.tagline}
        </p>
        {tier.minSeats > 1 ? (
          <p
            className="v2-mono mt-1"
            style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
          >
            {`// MIN ${tier.minSeats} SEATS`}
          </p>
        ) : null}
      </header>

      <ul className="my-6 flex-1 space-y-2" style={{ fontSize: 13 }}>
        {displayFeatures.map((line) => (
          <li
            key={line.label}
            className={`flex items-start gap-2 ${
              line.present ? "" : "line-through"
            }`}
            style={{
              color: line.present ? "var(--v2-ink-100)" : "var(--v2-ink-400)",
              opacity: line.present ? 1 : 0.6,
            }}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 font-bold"
              style={{
                color: line.present
                  ? "var(--v2-acc)"
                  : "var(--v2-line-300)",
              }}
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
          className={`v2-btn block w-full text-center ${
            highlighted ? "v2-btn-primary" : "v2-btn-ghost"
          }`}
          style={{ minHeight: 42 }}
        >
          {tier.ctaLabel.toUpperCase()}
          <span aria-hidden style={{ marginLeft: 8 }}>→</span>
        </a>
      </footer>
    </article>
  );
}
