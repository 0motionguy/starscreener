// TierComparison — dense feature × tier table for the pricing page.
//
// Renders every feature row with its availability per tier. Intended for
// users who want to compare line-by-line instead of scanning four cards.
// Server component — reads static tier data only.

import { TIER_ORDER, TIERS, type UserTier } from "@/lib/pricing/tiers";

interface ComparisonRow {
  label: string;
  /** Per-tier cell content. "—" renders as muted. */
  values: Record<UserTier, string>;
}

function numeric(value: number): string {
  if (value === -1) return "Unlimited";
  if (value === 0) return "—";
  return value.toLocaleString("en-US");
}

function bool(value: boolean): string {
  return value ? "Included" : "—";
}

function buildRows(): ComparisonRow[] {
  const rows: ComparisonRow[] = [];

  const perTier = <T,>(pick: (tier: UserTier) => T): Record<UserTier, T> =>
    ({
      free: pick("free"),
      pro: pick("pro"),
      team: pick("team"),
      enterprise: pick("enterprise"),
    }) as Record<UserTier, T>;

  rows.push({
    label: "Alert rules",
    values: perTier((k) => numeric(TIERS[k].features.maxAlertRules)),
  });
  rows.push({
    label: "Webhook targets",
    values: perTier((k) => numeric(TIERS[k].features.maxWebhookTargets)),
  });
  rows.push({
    label: "Watchlist repos",
    values: perTier((k) => numeric(TIERS[k].features.maxWatchlistRepos)),
  });
  rows.push({
    label: "Rate-limit budget",
    values: perTier((k) => `${TIERS[k].features.rateLimitMultiplier}x`),
  });
  rows.push({
    label: "CSV export",
    values: perTier((k) => bool(TIERS[k].features.csvExport)),
  });
  rows.push({
    label: "Private watchlist",
    values: perTier((k) => bool(TIERS[k].features.privateWatchlist)),
  });
  rows.push({
    label: "Weekly email digest",
    values: perTier((k) => bool(TIERS[k].features.emailDigest)),
  });
  rows.push({
    label: "MCP usage reports",
    values: perTier((k) => bool(TIERS[k].features.mcpUsageReports)),
  });
  rows.push({
    label: "Team workspace",
    values: perTier((k) => bool(TIERS[k].features.teamWorkspace)),
  });
  rows.push({
    label: "Priority support",
    values: perTier((k) => bool(TIERS[k].features.prioritySupport)),
  });
  rows.push({
    label: "Custom SLAs",
    values: perTier((k) => bool(TIERS[k].features.customSlas)),
  });
  rows.push({
    label: "On-prem feed mirrors",
    values: perTier((k) => bool(TIERS[k].features.onPremFeeds)),
  });

  return rows;
}

export function TierComparison() {
  const rows = buildRows();
  return (
    <section
      aria-labelledby="pricing-compare-heading"
      className="mt-12 border border-border-primary rounded-md bg-bg-secondary/40 font-mono"
    >
      <header className="border-b border-border-primary px-4 py-3 md:px-6">
        <h2
          id="pricing-compare-heading"
          className="text-sm uppercase tracking-wider text-text-tertiary"
        >
          {"// Full comparison"}
        </h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-primary bg-bg-primary/60">
              <th
                scope="col"
                className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-text-tertiary md:px-6"
              >
                Feature
              </th>
              {TIER_ORDER.map((key) => (
                <th
                  key={key}
                  scope="col"
                  className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-text-tertiary md:px-6"
                >
                  {TIERS[key].displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.label}
                className={`border-b border-border-primary/60 ${
                  idx % 2 === 1 ? "bg-bg-primary/30" : ""
                }`}
              >
                <th
                  scope="row"
                  className="px-4 py-3 text-left font-medium text-text-secondary md:px-6"
                >
                  {row.label}
                </th>
                {TIER_ORDER.map((key) => {
                  const value = row.values[key];
                  const muted = value === "—";
                  return (
                    <td
                      key={key}
                      className={`px-4 py-3 md:px-6 ${
                        muted ? "text-text-tertiary/60" : "text-text-primary"
                      }`}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
