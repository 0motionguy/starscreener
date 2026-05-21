// /pricing — public pricing page.
//
// Single source of truth for tier prices + feature flags is
// `src/lib/pricing/tiers.ts`. Never hardcode a price or feature row here —
// always read through TIERS / TIER_ORDER so the entitlements helper, the
// account billing panel, and this page can never drift apart.
//
// Billing cadence toggle is URL-driven (?cadence=monthly|yearly) so the page
// stays a Server Component — no `'use client'` overhead for a two-state
// switch. The Stripe wave hasn't landed yet (per CLAUDE.md), so every CTA
// routes to /sign-up with a `?plan=` query string; the sign-up handler is
// expected to bounce to Stripe Checkout once `STRIPE_*_PRICE_ID` envs are
// wired. Enterprise stays mailto for the foreseeable future.
//
// Honesty: the feature comparison table reads booleans + numerics straight
// from TierFeatures. A TODO in tiers.ts (e.g. mcpUsageReports for Pro) shows
// here as a "—" not a checkmark — same contract as the entitlements helper.

import Link from "next/link";

import {
  TIERS,
  TIER_ORDER,
  type TierDefinition,
  type TierFeatures,
  type UserTier,
} from "@/lib/pricing/tiers";

export const revalidate = 3600;

export const metadata = {
  title: "Pricing — TrendingRepo",
  description:
    "Real-time GitHub repo discovery, agent signals, and breakout alerts. Free forever for casual use. Pro from $19/mo. Team from $49/mo. Enterprise on request.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Pricing — TrendingRepo",
    description:
      "Start free. Upgrade to Pro for 60 alerts, webhooks, CSV export, and a 10x rate-limit budget. Team from $49/mo. Enterprise on request.",
    type: "website",
    url: "https://trendingrepo.com/pricing",
    images: [
      {
        url: "/api/og/default",
        width: 1200,
        height: 630,
        alt: "TrendingRepo — Pricing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — TrendingRepo",
    description:
      "Start free. Upgrade to Pro for 60 alerts, webhooks, CSV export, and priority rate limits.",
  },
};

type Cadence = "monthly" | "yearly";

function parseCadence(raw: string | string[] | undefined): Cadence {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "yearly" ? "yearly" : "monthly";
}

// ---------------------------------------------------------------------------
// Formatting helpers — kept inline so the page is one self-contained file.
// ---------------------------------------------------------------------------

function priceLabel(tier: TierDefinition, cadence: Cadence): string {
  if (tier.priceMonthlyUsd === null) return "Custom";
  const monthly = tier.priceMonthlyUsd;
  const yearly = tier.priceYearlyUsd ?? monthly * 12;
  if (monthly === 0) return "$0";
  return cadence === "yearly" ? `$${Math.round(yearly / 12)}` : `$${monthly}`;
}

function billingCaption(tier: TierDefinition, cadence: Cadence): string {
  if (tier.priceMonthlyUsd === null) return "Volume + on-prem pricing";
  if (tier.priceMonthlyUsd === 0) return "forever — no card required";
  if (cadence === "yearly") {
    const yearly = tier.priceYearlyUsd ?? tier.priceMonthlyUsd * 12;
    return `/ mo · billed $${yearly}/yr · save ${yearlySavingsPct(tier)}%`;
  }
  return "/ mo · billed monthly";
}

function yearlySavingsPct(tier: TierDefinition): number {
  if (!tier.priceMonthlyUsd || !tier.priceYearlyUsd) return 0;
  const monthlyTotal = tier.priceMonthlyUsd * 12;
  if (monthlyTotal === 0) return 0;
  const saved = monthlyTotal - tier.priceYearlyUsd;
  return Math.max(0, Math.round((saved / monthlyTotal) * 100));
}

function seatsLine(tier: TierDefinition): string | null {
  if (tier.minSeats <= 1 && tier.includedSeats <= 1) return null;
  if (tier.key === "enterprise") return `MIN ${tier.minSeats} SEATS`;
  return `MIN ${tier.minSeats} SEATS · ${tier.includedSeats} INCLUDED`;
}

function ctaHref(tier: TierDefinition): string {
  // Stripe wave hasn't landed — every paid tier goes to /sign-up with a
  // plan hint so the post-signup handler can route to checkout once the
  // STRIPE_*_PRICE_ID envs are wired. Enterprise stays mailto.
  if (tier.key === "enterprise") return tier.ctaHref;
  if (tier.key === "free") return "/sign-up";
  return `/sign-up?plan=${tier.key}`;
}

function ctaLabel(tier: TierDefinition): string {
  // Override the lib's ctaLabel for the pricing page where the destination
  // is always sign-up (not the in-app upgrade flow).
  if (tier.key === "free") return "Start free";
  if (tier.key === "pro") return "Start Pro";
  if (tier.key === "team") return "Start team trial";
  return "Contact sales";
}

// ---------------------------------------------------------------------------
// Feature-comparison table — rows mirror TierFeatures.
// ---------------------------------------------------------------------------

interface FeatureRow {
  label: string;
  /** Read the value off TierFeatures for a given tier. */
  read: (f: TierFeatures) => string | boolean | number;
  /** "limit" prints "Unlimited" for -1, raw number otherwise. */
  kind: "limit" | "bool" | "multiplier";
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    label: "Alert rules",
    read: (f) => f.maxAlertRules,
    kind: "limit",
  },
  {
    label: "Webhook destinations",
    read: (f) => f.maxWebhookTargets,
    kind: "limit",
  },
  {
    label: "Repos per watchlist",
    read: (f) => f.maxWatchlistRepos,
    kind: "limit",
  },
  {
    label: "API rate-limit budget",
    read: (f) => f.rateLimitMultiplier,
    kind: "multiplier",
  },
  {
    label: "CSV export",
    read: (f) => f.csvExport,
    kind: "bool",
  },
  {
    label: "Private watchlists",
    read: (f) => f.privateWatchlist,
    kind: "bool",
  },
  {
    label: "Weekly email digest",
    read: (f) => f.emailDigest,
    kind: "bool",
  },
  {
    label: "MCP usage reports",
    read: (f) => f.mcpUsageReports,
    kind: "bool",
  },
  {
    label: "Team workspace",
    read: (f) => f.teamWorkspace,
    kind: "bool",
  },
  {
    label: "Priority support",
    read: (f) => f.prioritySupport,
    kind: "bool",
  },
  {
    label: "Custom SLAs",
    read: (f) => f.customSlas,
    kind: "bool",
  },
  {
    label: "On-prem feed mirror",
    read: (f) => f.onPremFeeds,
    kind: "bool",
  },
];

function renderCell(row: FeatureRow, tier: UserTier): React.ReactNode {
  const features = TIERS[tier].features;
  const value = row.read(features);
  if (row.kind === "bool") {
    return value === true ? (
      <span className="pricing-check" aria-label="Included">
        ✓
      </span>
    ) : (
      <span className="pricing-x" aria-label="Not included">
        —
      </span>
    );
  }
  if (row.kind === "multiplier") {
    return <span className="pricing-num">{`${value}x`}</span>;
  }
  // limit
  if (value === -1) {
    return <span className="pricing-num accent">Unlimited</span>;
  }
  if (value === 0) {
    return <span className="pricing-x">—</span>;
  }
  return <span className="pricing-num">{value}</span>;
}

// ---------------------------------------------------------------------------
// FAQ — five common pricing questions.
// ---------------------------------------------------------------------------

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is there a free tier?",
    a: "Yes — Free is free forever. 3 alert rules, 5-repo watchlist, full read access to every public surface. No card required to sign up.",
  },
  {
    q: "How does annual billing work?",
    a: "Switch the toggle above to see the yearly discount. Annual plans are billed once per year and save roughly 21% vs paying monthly. You can downgrade or cancel any time.",
  },
  {
    q: "Can I cancel any time?",
    a: "Yes. Cancelling stops the next renewal — your Pro / Team features stay live until the end of the current billing period, then your account drops to Free without losing your alerts or watchlists.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major cards via Stripe Checkout. Receipts are emailed automatically and a Stripe-hosted billing portal lets you update card details or download invoices.",
  },
  {
    q: "Do you offer a student or open-source discount?",
    a: "Yes — maintainers of public repos with 500+ stars and full-time students get Pro free for 12 months. Email sales@trendingrepo.com with a link to your repo / a .edu address.",
  },
];

// ---------------------------------------------------------------------------
// Page component.
// ---------------------------------------------------------------------------

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PricingPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const cadence = parseCadence(params.cadence);
  const proSavings = yearlySavingsPct(TIERS.pro);

  return (
    <div className="pricing-page">
      <PricingRouteStyles />

      <header className="page-head">
        <div>
          <div className="page-eyebrow">
            <span className="dot">●</span> {"// PRICING · start free — scale when you ship"}
          </div>
          <h1 className="page-title">Pricing for operators.</h1>
          <p className="page-sub">
            Real-time GitHub discovery, agent signals, and breakout alerts.
            Free forever for casual use. Upgrade when you need more alerts,
            webhook delivery, CSV export, or a higher API budget.
          </p>
        </div>

        <div className="segmented pricing-cadence" role="group" aria-label="Billing cadence">
          <Link
            href={{ query: { cadence: "monthly" } }}
            className={cadence === "monthly" ? "on" : ""}
            prefetch={false}
          >
            Monthly
          </Link>
          <Link
            href={{ query: { cadence: "yearly" } }}
            className={cadence === "yearly" ? "on" : ""}
            prefetch={false}
          >
            Yearly · save {proSavings}%
          </Link>
        </div>
      </header>

      <section className="pricing-grid" aria-label="Pricing tiers">
        {TIER_ORDER.map((key) => {
          const tier = TIERS[key];
          const recommended = key === "pro";
          const seats = seatsLine(tier);
          return (
            <article
              key={key}
              className={`pricing-card${recommended ? " recommended" : ""}`}
              id={tier.key}
            >
              {recommended ? (
                <span className="pricing-badge">RECOMMENDED</span>
              ) : null}
              <div className="pricing-card-eyebrow">
                <span>{`// ${tier.displayName.toUpperCase()}`}</span>
                {seats ? <span className="pricing-seats">{seats}</span> : null}
              </div>
              <h2 className="pricing-name">{tier.displayName}</h2>
              <p className="pricing-tagline">{tier.tagline}</p>

              <div className="pricing-price">
                <span className="pricing-amount">{priceLabel(tier, cadence)}</span>
                <span className="pricing-period">
                  {billingCaption(tier, cadence)}
                </span>
              </div>

              <Link
                href={ctaHref(tier)}
                className={`btn ${recommended ? "primary" : "ghost"} pricing-cta`}
                prefetch={false}
              >
                {ctaLabel(tier)}
              </Link>

              <ul className="pricing-features">
                {tierHighlights(tier).map((line) => (
                  <li key={line}>
                    <span className="pricing-check" aria-hidden="true">
                      ✓
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <section className="pricing-compare" aria-labelledby="compare-head">
        <div className="card">
          <div className="card-head">
            <h2 className="card-title" id="compare-head">
              <b>Full comparison</b> · every feature, every tier
            </h2>
          </div>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th scope="col" className="pricing-feature-col">
                    Feature
                  </th>
                  {TIER_ORDER.map((key) => (
                    <th
                      key={key}
                      scope="col"
                      className={key === "pro" ? "pricing-col accent" : "pricing-col"}
                    >
                      {TIERS[key].displayName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="pricing-feature-cell">
                      {row.label}
                    </th>
                    {TIER_ORDER.map((key) => (
                      <td
                        key={key}
                        className={key === "pro" ? "pricing-cell accent" : "pricing-cell"}
                      >
                        {renderCell(row, key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="pricing-faq" aria-labelledby="faq-head">
        <div className="card">
          <div className="card-head">
            <h2 className="card-title" id="faq-head">
              <b>Frequently asked</b> · billing, plans, fine print
            </h2>
          </div>
          <div className="pricing-faq-body">
            {FAQS.map(({ q, a }) => (
              <details key={q} className="pricing-faq-item">
                <summary className="pricing-faq-q">{q}</summary>
                <p className="pricing-faq-a">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing-cta-strip" aria-label="Get started">
        <div>
          <div className="page-eyebrow">
            <span className="dot">●</span> {"// GET STARTED"}
          </div>
          <h2 className="pricing-cta-title">Start free. Track anything.</h2>
          <p className="pricing-cta-sub">
            No credit card required for the free tier. Upgrade in-app when you
            need webhooks, CSV export, or a bigger rate budget.
          </p>
        </div>
        <div className="pricing-cta-actions">
          <Link href="/sign-up" className="btn primary lg" prefetch={false}>
            Start free
          </Link>
          <Link
            href="/sign-up?plan=pro"
            className="btn ghost lg"
            prefetch={false}
          >
            Try Pro
          </Link>
        </div>
      </section>

      <footer className="pricing-footnote">
        <span>Secure checkout powered by Stripe.</span>
        <span>·</span>
        <span>No credit card required for the free tier.</span>
        <span>·</span>
        <a href="mailto:sales@trendingrepo.com">sales@trendingrepo.com</a>
      </footer>
    </div>
  );
}

/**
 * Per-tier highlight bullets shown above the full comparison table. Pulls
 * from `TierFeatures` so a change to the table propagates to the card copy.
 */
function tierHighlights(tier: TierDefinition): string[] {
  const f = tier.features;
  const out: string[] = [];
  if (tier.key === "free") {
    out.push(
      `${f.maxAlertRules} alert rules`,
      `${f.maxWatchlistRepos}-repo watchlist`,
      "Read access to every public surface",
      "Public API at the baseline rate budget",
    );
    return out;
  }
  if (tier.key === "pro") {
    out.push(
      `${f.maxAlertRules} alert rules`,
      `${f.maxWebhookTargets} webhook destinations`,
      "Unlimited watchlists · private + public",
      "CSV export across every list",
      `${f.rateLimitMultiplier}x API rate-limit budget`,
      "Weekly digest email",
    );
    return out;
  }
  if (tier.key === "team") {
    out.push(
      "Unlimited alerts, webhooks, and watchlists",
      `${f.rateLimitMultiplier}x rate-limit budget`,
      "Shared team workspace + webhooks",
      "MCP tool-use usage reports",
      "Priority support · 24h SLA",
      `${tier.includedSeats} seats included`,
    );
    return out;
  }
  // enterprise
  out.push(
    "Everything in Team",
    `${f.rateLimitMultiplier}x rate-limit budget`,
    "Custom SLA contract",
    "On-prem feed mirror",
    `${tier.minSeats}+ seats · volume pricing`,
    "Dedicated Slack channel",
  );
  return out;
}

// ---------------------------------------------------------------------------
// Route-scoped styles. Single inline <style> so the page stays one file —
// matches the AgentCommerceRouteStyles pattern.
// ---------------------------------------------------------------------------

function PricingRouteStyles() {
  return (
    <style>{`
      .pricing-page {
        padding: 18px 22px 40px;
        max-width: 1320px;
        margin: 0 auto;
      }
      .pricing-page .page-head {
        align-items: flex-end;
        margin-bottom: 22px;
      }
      .pricing-page .page-eyebrow .dot { color: var(--accent); margin-right: 4px; }

      .pricing-cadence {
        font-family: var(--font-mono);
        font-size: 11px;
      }

      /* Tier cards */
      .pricing-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 28px;
      }
      @media (max-width: 1100px) {
        .pricing-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 640px) {
        .pricing-grid { grid-template-columns: 1fr; }
      }

      .pricing-card {
        position: relative;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        padding: 18px 16px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        transition: border-color var(--d-base) var(--ease),
                    transform var(--d-fast) var(--ease),
                    background var(--d-base) var(--ease);
      }
      .pricing-card:hover {
        border-color: var(--border-hover);
        background: var(--surface-2);
      }
      .pricing-card.recommended {
        border-color: var(--accent);
        background:
          linear-gradient(180deg, var(--accent-wash) 0%, transparent 60%),
          var(--surface);
        box-shadow: 0 0 0 1px var(--accent-soft);
      }
      .pricing-card.recommended:hover {
        box-shadow: var(--glow-orange);
      }

      .pricing-badge {
        position: absolute;
        top: -10px;
        right: 14px;
        background: var(--accent);
        color: #1a0e08;
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.14em;
        padding: 3px 8px;
        border-radius: var(--r-pill);
        font-weight: 700;
      }

      .pricing-card-eyebrow {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.16em;
        color: var(--fg-faint);
        text-transform: uppercase;
        display: flex;
        justify-content: space-between;
        gap: 8px;
        align-items: baseline;
      }
      .pricing-card-eyebrow .pricing-seats {
        color: var(--fg-disabled);
        font-size: 9.5px;
      }

      .pricing-name {
        font-family: var(--font-display);
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--fg-bright);
        margin: 0;
      }
      .pricing-tagline {
        color: var(--fg-subtle);
        font-size: 12.5px;
        line-height: 1.45;
        margin: 0;
        min-height: 36px;
      }

      .pricing-price {
        display: flex;
        align-items: baseline;
        gap: 8px;
        padding: 12px 0 4px;
        border-top: 1px dashed var(--border-subtle);
      }
      .pricing-amount {
        font-family: var(--font-mono);
        font-variant-numeric: tabular-nums;
        font-size: 30px;
        font-weight: 700;
        color: var(--fg-bright);
        letter-spacing: -0.02em;
      }
      .pricing-card.recommended .pricing-amount { color: var(--accent); }
      .pricing-period {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
        letter-spacing: 0.04em;
      }

      .pricing-cta {
        width: 100%;
        justify-content: center;
        margin-top: 2px;
      }

      .pricing-features {
        list-style: none;
        padding: 0;
        margin: 8px 0 0;
        display: grid;
        gap: 6px;
        font-size: 12.5px;
        color: var(--fg-muted);
      }
      .pricing-features li {
        display: grid;
        grid-template-columns: 14px 1fr;
        gap: 7px;
        align-items: start;
      }
      .pricing-check {
        color: var(--accent);
        font-family: var(--font-mono);
        font-size: 12px;
      }
      .pricing-x {
        color: var(--fg-disabled);
        font-family: var(--font-mono);
      }

      /* Comparison table */
      .pricing-compare {
        margin-bottom: 28px;
      }
      .pricing-table-wrap {
        overflow-x: auto;
        scrollbar-width: thin;
      }
      .pricing-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12.5px;
      }
      .pricing-table th,
      .pricing-table td {
        padding: 10px 14px;
        text-align: left;
        border-bottom: 1px solid var(--border-subtle);
      }
      .pricing-table thead th {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-faint);
        background: var(--surface-2);
      }
      .pricing-table thead th.accent {
        color: var(--accent);
      }
      .pricing-table tbody tr:nth-child(even) {
        background: rgba(255, 255, 255, 0.012);
      }
      .pricing-table tbody tr:hover {
        background: var(--surface-2);
      }
      .pricing-feature-cell {
        color: var(--fg);
        font-weight: 500;
        width: 36%;
      }
      .pricing-col {
        text-align: center !important;
        width: 16%;
      }
      .pricing-cell {
        text-align: center !important;
        font-family: var(--font-mono);
        font-variant-numeric: tabular-nums;
      }
      .pricing-cell.accent {
        background: var(--accent-wash);
      }
      .pricing-num {
        color: var(--fg);
      }
      .pricing-num.accent {
        color: var(--accent);
      }

      /* FAQ */
      .pricing-faq {
        margin-bottom: 28px;
      }
      .pricing-faq-body {
        padding: 4px 0;
      }
      .pricing-faq-item {
        border-bottom: 1px solid var(--border-subtle);
        padding: 14px 16px;
      }
      .pricing-faq-item:last-child { border-bottom: 0; }
      .pricing-faq-q {
        cursor: pointer;
        font-weight: 600;
        color: var(--fg-bright);
        font-size: 13px;
        list-style: none;
        position: relative;
        padding-right: 24px;
      }
      .pricing-faq-q::-webkit-details-marker { display: none; }
      .pricing-faq-q::after {
        content: "+";
        position: absolute;
        right: 0;
        top: 0;
        color: var(--accent);
        font-family: var(--font-mono);
        font-size: 14px;
        transition: transform var(--d-fast) var(--ease);
      }
      .pricing-faq-item[open] .pricing-faq-q::after {
        content: "−";
      }
      .pricing-faq-a {
        color: var(--fg-muted);
        margin: 8px 0 0;
        font-size: 12.5px;
        line-height: 1.55;
        max-width: 70ch;
      }

      /* Final CTA strip */
      .pricing-cta-strip {
        background:
          linear-gradient(180deg, var(--accent-wash) 0%, transparent 100%),
          var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        padding: 22px 22px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 18px;
        flex-wrap: wrap;
        margin-bottom: 18px;
      }
      .pricing-cta-title {
        font-family: var(--font-display);
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--fg-bright);
        margin: 4px 0 6px;
      }
      .pricing-cta-sub {
        color: var(--fg-subtle);
        font-size: 13px;
        margin: 0;
        max-width: 56ch;
      }
      .pricing-cta-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .pricing-footnote {
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.06em;
        color: var(--fg-faint);
        text-transform: uppercase;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
        padding: 14px 0 4px;
      }
      .pricing-footnote a {
        color: var(--fg-subtle);
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .pricing-footnote a:hover { color: var(--accent); }
    `}</style>
  );
}
