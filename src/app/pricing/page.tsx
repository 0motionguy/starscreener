// /pricing — V2 tier cards, comparison, and FAQ.
//
// Server component. The monthly/yearly toggle is rendered on the server
// based on the `?cadence=yearly` query param so the page is SEO-friendly
// and ships without a React hydration bundle for the toggle.
//
// V2 design: TerminalBar header + small mono title-line + V2 tier cards
// with bracket markers on the highlighted (Pro) plan + dot-field bg from
// the global v2-canvas wrapper.

import type { Metadata } from "next";
import Link from "next/link";

import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { BracketMarkers } from "@/components/today-v2/primitives/BracketMarkers";
import { PricingFAQ } from "@/components/pricing/PricingFAQ";
import { TierComparison } from "@/components/pricing/TierComparison";
import {
  TIER_ORDER,
  TIERS,
  type BillingCadence,
  type TierDefinition,
} from "@/lib/pricing/tiers";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: `${SITE_NAME} — Pricing`,
  description:
    "Start free. Pro at $19/month for 60 alerts, webhooks, CSV export, and priority rate limits. Team from $49/seat. Enterprise on request.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: `${SITE_NAME} — Pricing`,
    description:
      "Start free. Pro at $19/month. Team from $49/seat. Enterprise on request.",
    url: `${SITE_URL.replace(/\/+$/, "")}/pricing`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Pricing`,
    description:
      "Start free. Pro at $19/month. Team from $49/seat. Enterprise on request.",
  },
};

export const dynamic = "force-dynamic";

interface PricingPageProps {
  searchParams?: Promise<{ cadence?: string | string[] }>;
}

function resolveCadence(raw: string | string[] | undefined): BillingCadence {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "yearly" ? "yearly" : "monthly";
}

function buildProductJsonLd(): string {
  const siteBase = SITE_URL.replace(/\/+$/, "");
  const products = TIER_ORDER.filter(
    (key) => TIERS[key].priceMonthlyUsd !== null && TIERS[key].priceMonthlyUsd! > 0,
  ).map((key) => {
    const tier = TIERS[key];
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: `${SITE_NAME} ${tier.displayName}`,
      description: tier.tagline,
      url: `${siteBase}/pricing#${tier.key}`,
      brand: { "@type": "Brand", name: SITE_NAME },
      offers: {
        "@type": "Offer",
        price: tier.priceMonthlyUsd,
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${siteBase}/pricing`,
      },
    };
  });
  return JSON.stringify(products);
}

function formatDollarAmount(amount: number): string {
  if (amount === 0) return "$0";
  return `$${amount.toLocaleString("en-US")}`;
}

function renderPrice(
  tier: TierDefinition,
  cadence: BillingCadence,
): { lead: string; hint: string } {
  if (tier.priceMonthlyUsd === null) {
    return { lead: "Custom", hint: "billed annually" };
  }
  if (cadence === "yearly" && tier.priceYearlyUsd !== null) {
    return {
      lead: formatDollarAmount(tier.priceYearlyUsd),
      hint: `per ${tier.includedSeats > 1 ? "seat " : ""}/ year`,
    };
  }
  return {
    lead: formatDollarAmount(tier.priceMonthlyUsd),
    hint: `per ${tier.includedSeats > 1 && tier.key === "team" ? "seat " : ""}/ month`,
  };
}

interface FeatureLine {
  label: string;
  present: boolean;
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

function PricingCardV2({
  tier,
  cadence,
  highlighted,
}: {
  tier: TierDefinition;
  cadence: BillingCadence;
  highlighted?: boolean;
}) {
  const price = renderPrice(tier, cadence);
  const allFeatures = buildFeatureLines(tier);
  const features =
    tier.key === "team" || tier.key === "enterprise"
      ? allFeatures
      : allFeatures.slice(0, 8);

  return (
    <article
      id={tier.key}
      className={`v2-card relative flex h-full flex-col p-6 scroll-mt-24 ${
        highlighted ? "v2-bracket" : ""
      }`}
      data-tier={tier.key}
      style={
        highlighted
          ? { borderColor: "var(--v2-acc)", boxShadow: "0 0 0 1px var(--v2-acc-soft)" }
          : undefined
      }
    >
      {highlighted ? <BracketMarkers /> : null}
      {highlighted ? (
        <span
          className="v2-tag v2-tag-acc absolute -top-3 left-6"
          style={{ fontSize: 10 }}
        >
          MOST POPULAR
        </span>
      ) : null}

      <header>
        <p className="v2-mono" style={{ color: "var(--v2-ink-300)" }}>
          <span aria-hidden>{"// "}</span>
          {tier.displayName.toUpperCase()}
        </p>
        <div className="mt-3 flex items-baseline gap-2">
          <span
            className="v2-display"
            style={{
              fontSize: "clamp(36px, 5vw, 56px)",
              color: "var(--v2-ink-000)",
            }}
          >
            {price.lead}
          </span>
          <span className="v2-mono-tight" style={{ color: "var(--v2-ink-300)" }}>
            {price.hint}
          </span>
        </div>
        <p
          className="mt-3 min-h-[2.5rem] text-[14px] leading-relaxed"
          style={{ color: "var(--v2-ink-200)" }}
        >
          {tier.tagline}
        </p>
        {tier.minSeats > 1 ? (
          <p className="mt-1 v2-mono" style={{ color: "var(--v2-ink-400)" }}>
            <span aria-hidden>{"// "}</span>
            MIN {tier.minSeats} SEATS
          </p>
        ) : null}
      </header>

      <ul className="my-6 flex-1 space-y-2 text-[14px]">
        {features.map((line) => (
          <li
            key={line.label}
            className="flex items-start gap-2"
            style={{
              color: line.present ? "var(--v2-ink-100)" : "var(--v2-ink-500)",
              textDecoration: line.present ? undefined : "line-through",
            }}
          >
            <span
              aria-hidden
              className="mt-1 inline-block"
              style={{
                width: 6,
                height: 6,
                background: line.present ? "var(--v2-acc)" : "var(--v2-line-200)",
                borderRadius: 1,
                boxShadow: line.present ? "0 0 4px var(--v2-acc-glow)" : undefined,
                flexShrink: 0,
              }}
            />
            <span>{line.label}</span>
          </li>
        ))}
      </ul>

      <footer>
        <Link
          href={tier.ctaHref}
          className={highlighted ? "v2-btn v2-btn-primary" : "v2-btn v2-btn-ghost"}
          style={{ display: "block", textAlign: "center" }}
        >
          {tier.ctaLabel}
        </Link>
      </footer>
    </article>
  );
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const cadence = resolveCadence(params?.cadence);
  const jsonLd = buildProductJsonLd();
  const nextCadence: BillingCadence = cadence === "yearly" ? "monthly" : "yearly";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      {/* Hero */}
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-8">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>PRICING · TIERS · BILLING
              </>
            }
            status={`${TIER_ORDER.length} TIERS`}
          />

          <div className="mt-6">
            <h1
              className="v2-display"
              style={{
                fontSize: "clamp(40px, 6vw, 72px)",
                color: "var(--v2-ink-000)",
              }}
            >
              Start free.{" "}
              <span style={{ color: "var(--v2-ink-400)" }}>Scale</span> when you
              ship.
            </h1>
            <p
              className="mt-4 max-w-[80ch] text-[15px] leading-relaxed"
              style={{ color: "var(--v2-ink-200)" }}
            >
              Pro at $19 / month for 60 alerts, 3 webhook targets, CSV export,
              and a 10× rate-limit budget. Team from $49 / seat with a shared
              workspace, priority support, and MCP usage reports. Enterprise on
              request.
            </p>
          </div>

          {/* Cadence toggle — pure link, no client JS */}
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-0 border border-[color:var(--v2-line-200)] p-0.5">
              <a
                href="/pricing"
                aria-current={cadence === "monthly" ? "page" : undefined}
                className="v2-mono px-3 py-1.5"
                style={{
                  color:
                    cadence === "monthly"
                      ? "var(--v2-bg-000)"
                      : "var(--v2-ink-300)",
                  background:
                    cadence === "monthly" ? "var(--v2-acc)" : "transparent",
                  letterSpacing: "0.20em",
                  fontSize: 11,
                }}
              >
                MONTHLY
              </a>
              <a
                href="/pricing?cadence=yearly"
                aria-current={cadence === "yearly" ? "page" : undefined}
                className="v2-mono px-3 py-1.5 inline-flex items-center gap-2"
                style={{
                  color:
                    cadence === "yearly"
                      ? "var(--v2-bg-000)"
                      : "var(--v2-ink-300)",
                  background:
                    cadence === "yearly" ? "var(--v2-acc)" : "transparent",
                  letterSpacing: "0.20em",
                  fontSize: 11,
                }}
              >
                YEARLY
                <span
                  className="v2-tag v2-tag-green"
                  style={{ fontSize: 9, padding: "1px 5px" }}
                >
                  SAVE 20%
                </span>
              </a>
            </div>
            <p className="v2-mono" style={{ color: "var(--v2-ink-400)" }}>
              <span aria-hidden>{"// "}</span>
              SHOWING {cadence.toUpperCase()} ·{" "}
              <a
                className="underline decoration-dotted"
                style={{ color: "var(--v2-ink-200)" }}
                href={
                  nextCadence === "yearly"
                    ? "/pricing?cadence=yearly"
                    : "/pricing"
                }
              >
                SWITCH TO {nextCadence.toUpperCase()}
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* Pricing cards */}
      <section
        aria-label="Plans"
        className="border-b border-[color:var(--v2-line-100)]"
      >
        <div className="v2-frame py-8">
          <p
            className="v2-mono mb-4"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span aria-hidden>{"// "}</span>
            PLANS · {TIER_ORDER.length} TIERS
          </p>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {TIER_ORDER.map((key) => (
              <PricingCardV2
                key={key}
                tier={TIERS[key]}
                cadence={cadence}
                highlighted={key === "pro"}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame py-8">
          <p
            className="v2-mono mb-4"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span aria-hidden>{"// "}</span>
            COMPARE · LINE BY LINE
          </p>
          <TierComparison />
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame py-8">
          <p
            className="v2-mono mb-4"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span aria-hidden>{"// "}</span>
            FAQ · COMMON QUESTIONS
          </p>
          <PricingFAQ />
        </div>
      </section>

      {/* Footer CTA */}
      <section>
        <div className="v2-frame py-12">
          <div className="v2-card p-8 md:p-12">
            <p
              className="v2-mono mb-3"
              style={{ color: "var(--v2-ink-400)" }}
            >
              <span aria-hidden>{"// "}</span>
              GET STARTED
            </p>
            <h2
              className="v2-display"
              style={{
                fontSize: "clamp(28px, 4vw, 44px)",
                color: "var(--v2-ink-000)",
              }}
            >
              Ship faster than the trend.
            </h2>
            <p
              className="mt-4 max-w-[60ch] text-[14px] leading-relaxed"
              style={{ color: "var(--v2-ink-200)" }}
            >
              Free covers exploration. Pro covers the day-to-day agent loop.
              Team covers the crew. Enterprise covers whatever contract shape
              you need. The API is the same on every tier; tiers gate how fast,
              how many, and how private.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/" className="v2-btn v2-btn-primary">
                START FREE
              </Link>
              <a
                href="mailto:sales@trendingrepo.com?subject=Enterprise%20inquiry"
                className="v2-btn v2-btn-ghost"
              >
                CONTACT SALES
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
