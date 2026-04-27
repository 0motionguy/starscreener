// /pricing — tier cards, comparison, and FAQ.
//
// Server component. No client state: the monthly/yearly toggle is rendered
// on the server based on the `?cadence=yearly` query param so the page is
// SEO-friendly and ships without a React hydration bundle for the toggle.
//
// Design: terminal aesthetic (font-mono, muted palette, // comments in
// headings) to match /funding, /revenue, /breakouts. No emojis.

import type { Metadata } from "next";
import Link from "next/link";

import { PricingCard } from "@/components/pricing/PricingCard";
import { PricingFAQ } from "@/components/pricing/PricingFAQ";
import { TierComparison } from "@/components/pricing/TierComparison";
import {
  TIER_ORDER,
  TIERS,
  type BillingCadence,
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

// Pages served via the app router do not allow `dynamic = "force-static"`
// unless the route has no search-param reads. We keep this one server-
// rendered so the cadence toggle resolves from the URL on every request.
export const dynamic = "force-dynamic";

interface PricingPageProps {
  searchParams?: Promise<{ cadence?: string | string[] }>;
}

function resolveCadence(raw: string | string[] | undefined): BillingCadence {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "yearly" ? "yearly" : "monthly";
}

// -----------------------------------------------------------------------------
// schema.org — list the paid products so Google can surface price markup.
// Free / enterprise deliberately omitted (no fixed price).
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const cadence = resolveCadence(params?.cadence);
  const jsonLd = buildProductJsonLd();

  const nextCadence: BillingCadence = cadence === "yearly" ? "monthly" : "yearly";

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 md:py-12">
        {/* Hero */}
        <header className="mb-10 border-b border-border-primary pb-8">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-wider">
              Pricing
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// start free — scale when you ship"}
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-base text-text-secondary">
            Start free. Pro at $19 / month for 60 alerts, 3 webhook targets, CSV
            export, and a 10x rate-limit budget. Team from $49 / seat with a
            shared workspace, priority support, and MCP usage reports.
            Enterprise on request.
          </p>

          {/* Cadence toggle — pure link, no client JS */}
          <div className="mt-5 inline-flex items-center gap-0 rounded-sm border border-border-primary p-0.5 text-xs uppercase tracking-wider">
            <a
              href="/pricing"
              aria-current={cadence === "monthly" ? "page" : undefined}
              className={`px-3 py-1.5 ${
                cadence === "monthly"
                  ? "bg-brand text-bg-primary"
                  : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              Monthly
            </a>
            <a
              href="/pricing?cadence=yearly"
              aria-current={cadence === "yearly" ? "page" : undefined}
              className={`px-3 py-1.5 ${
                cadence === "yearly"
                  ? "bg-brand text-bg-primary"
                  : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              Yearly
              <span className="ml-2 text-[10px] text-functional">save ~20%</span>
            </a>
          </div>
          <p className="mt-3 text-[11px] text-text-tertiary">
            {"// showing "}
            {cadence}
            {" prices — "}
            <a
              className="underline decoration-dotted hover:text-brand"
              href={nextCadence === "yearly" ? "/pricing?cadence=yearly" : "/pricing"}
            >
              switch to {nextCadence}
            </a>
          </p>
        </header>

        {/* Pricing cards — 4 up on desktop, stacked on mobile */}
        <section
          aria-label="Plans"
          className="grid gap-5 md:grid-cols-2 xl:grid-cols-4"
        >
          {TIER_ORDER.map((key) => (
            <div key={key} id={key} className="scroll-mt-24">
              <PricingCard
                tier={TIERS[key]}
                cadence={cadence}
                highlighted={key === "pro"}
              />
            </div>
          ))}
        </section>

        {/* Comparison table */}
        <TierComparison />

        {/* FAQ */}
        <PricingFAQ />

        {/* Footer CTA */}
        <section
          aria-labelledby="pricing-cta-heading"
          className="mt-12 border border-border-primary rounded-md bg-bg-secondary/60 p-6 md:p-10"
        >
          <h2
            id="pricing-cta-heading"
            className="text-lg md:text-2xl font-bold uppercase tracking-wider"
          >
            Ship faster than the trend.
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-text-secondary">
            Free covers exploration. Pro covers the day-to-day agent loop. Team
            covers the crew. Enterprise covers whatever contract shape you need.
            The API is the same on every tier; tiers gate how fast, how many,
            and how private.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/" className="v2-btn v2-btn-primary inline-flex">
              START FREE
              <span aria-hidden style={{ marginLeft: 8 }}>→</span>
            </Link>
            <a
              href="mailto:sales@trendingrepo.com?subject=Enterprise%20inquiry"
              className="rounded-sm border border-border-primary bg-bg-primary px-5 py-2.5 text-sm uppercase tracking-wider text-text-primary transition hover:border-brand/60 hover:text-brand"
            >
              Contact sales
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
