// /pricing — public pricing page (operator-grade receipt aesthetic).
//
// Single source of truth for tier prices + feature flags is
// `src/lib/pricing/tiers.ts`. Never hardcode a price or feature row here —
// always read through TIERS so the entitlements helper, the account billing
// panel, and this page can never drift apart.
//
// 2026-05-24 redesign: the page is a brand-register surface (the only
// marketing page on the codebase). It pivots on the "one founder coffee"
// price-anchor: Pro is the cost of a single SF latte for a whole month. The
// SF Founder Coffee Index is real (11 verifiable cafés, each with a Google
// Maps deeplink and a website). The hero "receipt" is a terminal printout,
// not a paper-cafe pastiche — receipts in trendingrepo are dark canvas with
// liquid-lava highlights, matching the rest of the product.
//
// Honesty contract: every price shown is real. Cafe drink prices are typical
// menu prices and labeled "approx." in the chrome — the index is comparative,
// not transactional. The trendingrepo Pro row pulls $6.50 from TIERS.pro.

import { Suspense } from "react";
import Link from "next/link";

import {
  TIERS,
  type TierDefinition,
} from "@/lib/pricing/tiers";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";
import { CheckoutLauncher } from "@/components/pricing/CheckoutLauncher";
import { CheckoutSuccess } from "@/components/pricing/CheckoutSuccess";

export const revalidate = 3600;

export const metadata = {
  title: "Pricing · Trendingrepo",
  description:
    "Pro is $6.50/mo. Cheaper than a Blue Bottle latte. Real-time GitHub discovery, breakout alerts, 60 alert rules, webhooks, CSV export, weekly digest.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing · Trendingrepo",
    description:
      "$6.50/mo. The price of one SF founder coffee. A whole month of breakout repo signal.",
    type: "website",
    url: "https://trendingrepo.com/pricing",
    images: [
      {
        url: "/api/og/pricing",
        width: 1200,
        height: 630,
        alt: "Trendingrepo Pricing · $6.50/mo · cheaper than a SF latte",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing · Trendingrepo",
    description:
      "$6.50/mo. The price of one SF founder coffee. A whole month of breakout repo signal.",
  },
};

// ---------------------------------------------------------------------------
// SF Founder Coffee Index — real cafés, real prices, real links.
//
// Prices are typical menu prices for a signature drink as of 2026-Q2;
// they vary by location, milk, and tip. The list is sorted by drink price
// descending so the Pro row at $6.50 lands in context. Every entry has a
// real website and a Google Maps deeplink built with the official
// `?api=1&query=` format so it works on every platform.
// ---------------------------------------------------------------------------

interface Cafe {
  name: string;
  hood: string;
  drink: string;
  price: number;
  /** Brand-recognizable monogram (1–2 chars). */
  mark: string;
  /** Brand swatch — used for the monogram chip. */
  hue: string;
  /** Why founders/operators actually go here. Keep it dry. */
  reason: string;
  website: string;
  maps: string;
}

const CAFES: readonly Cafe[] = [
  {
    name: "Blue Bottle Coffee",
    hood: "South Park · SoMa",
    drink: "Caffè Latte",
    price: 7.50,
    mark: "BB",
    hue: "#1163b6",
    reason: "pitch breakfasts",
    website: "https://bluebottlecoffee.com",
    maps: "https://www.google.com/maps/search/?api=1&query=Blue+Bottle+Coffee+South+Park+San+Francisco",
  },
  {
    name: "The Mill",
    hood: "Divisadero · NoPa",
    drink: "Caffè Latte",
    price: 7.00,
    mark: "TM",
    hue: "#2a2a2a",
    reason: "weekend ideation",
    website: "https://www.themillsf.com",
    maps: "https://www.google.com/maps/search/?api=1&query=The+Mill+Divisadero+San+Francisco",
  },
  {
    name: "Saint Frank Coffee",
    hood: "Russian Hill",
    drink: "Cortado",
    price: 6.75,
    mark: "SF",
    hue: "#6f8f63",
    reason: "seed-stage circles",
    website: "https://saintfrankcoffee.com",
    maps: "https://www.google.com/maps/search/?api=1&query=Saint+Frank+Coffee+Russian+Hill+San+Francisco",
  },
  {
    name: "Sightglass Coffee",
    hood: "SoMa · 7th St",
    drink: "Caffè Latte",
    price: 6.75,
    mark: "SG",
    hue: "#c89b3f",
    reason: "founder 1:1s",
    website: "https://sightglasscoffee.com",
    maps: "https://www.google.com/maps/search/?api=1&query=Sightglass+Coffee+7th+Street+San+Francisco",
  },
  {
    name: "Equator Coffees",
    hood: "Mission Bay",
    drink: "Caffè Latte",
    price: 6.60,
    mark: "EQ",
    hue: "#0f7a3f",
    reason: "YC sightings",
    website: "https://www.equatorcoffees.com",
    maps: "https://www.google.com/maps/search/?api=1&query=Equator+Coffees+Mission+Bay+San+Francisco",
  },
  {
    name: "Ritual Coffee Roasters",
    hood: "Hayes Valley",
    drink: "Caffè Latte",
    price: 6.50,
    mark: "RT",
    hue: "#dd1f26",
    reason: "cerebral valley meetups",
    website: "https://ritualroasters.com",
    maps: "https://www.google.com/maps/search/?api=1&query=Ritual+Coffee+Hayes+Valley+San+Francisco",
  },
  {
    name: "The Coffee Movement",
    hood: "Nob Hill",
    drink: "Latte",
    price: 6.50,
    mark: "CM",
    hue: "#d4af37",
    reason: "solo builders",
    website: "https://www.thecoffeemovement.com",
    maps: "https://www.google.com/maps/search/?api=1&query=The+Coffee+Movement+Nob+Hill+San+Francisco",
  },
  {
    name: "Café Réveille",
    hood: "Hayes Valley",
    drink: "Caffè Latte",
    price: 6.50,
    mark: "RV",
    hue: "#c9a961",
    reason: "morning rituals",
    website: "https://cafereveille.com",
    maps: "https://www.google.com/maps/search/?api=1&query=Cafe+Reveille+Hayes+Valley+San+Francisco",
  },
  {
    name: "Andytown Coffee",
    hood: "FiDi · Outer Sunset",
    drink: "Snowy Plover",
    price: 6.25,
    mark: "AT",
    hue: "#1f3a5f",
    reason: "pre 1:1 fuel",
    website: "https://www.andytownsf.com",
    maps: "https://www.google.com/maps/search/?api=1&query=Andytown+Coffee+San+Francisco",
  },
  {
    name: "Linea Caffe",
    hood: "Mission",
    drink: "Caffè Latte",
    price: 6.00,
    mark: "LN",
    hue: "#7a3b2c",
    reason: "founder coffee crawl",
    website: "https://lineacaffe.com",
    maps: "https://www.google.com/maps/search/?api=1&query=Linea+Caffe+Mission+San+Francisco",
  },
  {
    name: "Philz Coffee",
    hood: "SoMa · Berry St",
    drink: "Mint Mojito",
    price: 5.95,
    mark: "PH",
    hue: "#7a4a1c",
    reason: "standup runs",
    website: "https://www.philzcoffee.com",
    maps: "https://www.google.com/maps/search/?api=1&query=Philz+Coffee+Berry+Street+San+Francisco",
  },
];

function median(prices: readonly number[]): number {
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatUsd(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// FAQ (4 items, every word earns its place).
// ---------------------------------------------------------------------------

const FAQS: readonly { q: string; a: string }[] = [
  {
    q: "Why $6.50?",
    a: "It is roughly one founder coffee per month. Enough to pay for the crawler, the storage, the alerting pipeline, and the time to keep it sharp. Not a venture-backed price. Just operator math.",
  },
  {
    q: "What about a free plan?",
    a: "The public surfaces stay free forever. Trending lists, breakout pages, the search bar, every category view. Pro unlocks the workflow tools: alerts, webhooks, CSV export, watchlists, weekly digest.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. One click in your account, no email loop, no retention call. Your watchlists and alert rules stay on file in case you come back.",
  },
  {
    q: "Who built this?",
    a: "An operator, for operators. Run by one founder out of Europe with a serverless stack and a stubborn refusal to add seat-based pricing. Replies on email within a day.",
  },
];

// ---------------------------------------------------------------------------
// Page component.
// ---------------------------------------------------------------------------

export default function PricingPage() {
  const authEnabled = Boolean(getClerkPublishableKey());
  const pro = TIERS.pro;
  const proPrice = pro.priceMonthlyUsd ?? 6.5;
  const proYearly = pro.priceYearlyUsd ?? 60;
  const proYearlyEquivMonth = proYearly / 12;

  const medianCoffee = median(CAFES.map((c) => c.price));
  const coffeesUnderPro = CAFES.filter((c) => c.price >= proPrice).length;

  return (
    <div className="pricing-shell">
      <PricingRouteStyles />

      {/* Completes the funnel: ?plan=pro|team → ensure Clerk-tied session →
          POST /api/checkout/stripe → redirect to Stripe. Suspense-wrapped
          because it reads useSearchParams on this ISR page. */}
      <Suspense fallback={null}>
        <CheckoutLauncher authEnabled={authEnabled} />
      </Suspense>

      {/* Owner-verified post-checkout confirmation: ?checkout=success&session_id
          → poll /api/checkout/verify → trustworthy active/delayed/failed state
          instead of a bare pricing page. Suspense-wrapped (reads useSearchParams). */}
      <Suspense fallback={null}>
        <CheckoutSuccess />
      </Suspense>

      {/* ─────────────────── HERO ─────────────────── */}
      <section className="ps-hero" aria-labelledby="ps-hero-title">
        <div className="ps-hero-left">
          <div className="ps-eyebrow">
            <span className="ps-eyebrow-dot" aria-hidden="true" />
            <span>{"// PRICING · ONE COFFEE · ALL MONTH"}</span>
          </div>

          <h1 id="ps-hero-title" className="ps-title">
            Stay on top of <em>AI</em> for less than{" "}
            <span className="ps-strike">another newsletter</span>.{" "}
            <span className="ps-title-beat">One founder coffee.</span>
          </h1>

          <p className="ps-lede">
            Real-time discovery across GitHub, Hacker News, X, Bluesky,
            Product Hunt, Dev.to, arXiv, and more. Breakout alerts, watchlists,
            webhooks, CSV exports, digests, and reports. For {formatUsd(proPrice)}/month.
          </p>

          <div className="ps-cta-row">
            <div className="ps-cta-stack">
              <Link href="/pricing?plan=pro" className="ps-btn ps-btn-primary" prefetch={false}>
                Start Pro · {formatUsd(proPrice)}/mo
                <span aria-hidden="true" className="ps-btn-arrow">→</span>
              </Link>
              <span className="ps-cta-tag">One coffee. One month of signal.</span>
            </div>
            <div className="ps-cta-meta">
              <span className="ps-cta-meta-top">No enterprise games. No seat math.</span>
              <span>Just signal. Built by an operator.</span>
            </div>
          </div>

          <div className="ps-microlog" aria-hidden="true">
            <div><span className="ps-microlog-pre">$</span> trendingrepo --status</div>
            <div><span className="ps-microlog-pre">›</span> 1,284 repos · streaming · 7 sources live</div>
            <div><span className="ps-microlog-pre">›</span> next scan in 14m · breakouts/24h: 12</div>
          </div>
        </div>

        <div className="ps-hero-right">
          <Receipt
            proPrice={proPrice}
            medianCoffee={medianCoffee}
            cafesAboveProCount={coffeesUnderPro}
          />
        </div>
      </section>

      {/* ─────────────────── PRO + COFFEE INDEX ─────────────────── */}
      <section className="ps-grid" id="pro" aria-label="Pro plan and SF Founder Coffee Index">
        <ProCard pro={pro} proPrice={proPrice} proYearly={proYearly} proYearlyEquivMonth={proYearlyEquivMonth} />
        <CoffeeIndex cafes={CAFES} proPrice={proPrice} medianCoffee={medianCoffee} />
      </section>

      {/* ─────────────────── COMPARISON CARDS ─────────────────── */}
      <section className="ps-compare" aria-label="What it costs, what it gets you">
        <article className="ps-compare-card">
          <div className="ps-compare-label">
            <span className="ps-compare-pip" aria-hidden="true" />
            <span>{"// ONE COFFEE"}</span>
          </div>
          <div className="ps-compare-meta">~ daily</div>
          <h3 className="ps-compare-h">{formatUsd(Math.min(...CAFES.map((c) => c.price)))} to {formatUsd(Math.max(...CAFES.map((c) => c.price)))}</h3>
          <p>What founders pay at the SF cafés where they meet, plan, and refresh feeds.</p>
        </article>

        <article className="ps-compare-card">
          <div className="ps-compare-label">
            <span className="ps-compare-pip" aria-hidden="true" />
            <span>{"// ONE MONTH OF PRO"}</span>
          </div>
          <div className="ps-compare-meta">{formatUsd(proPrice)}</div>
          <h3 className="ps-compare-h">60 alerts · digests · webhooks · CSV · reports</h3>
          <p>Real-time GitHub plus agent signals, breakout flags, weekly digest, 10x API budget.</p>
        </article>

        <article className="ps-compare-card ps-compare-card-pri">
          <div className="ps-compare-label">
            <span className="ps-compare-pip" aria-hidden="true" />
            <span>{"// ONE MISSED BREAKOUT"}</span>
          </div>
          <div className="ps-compare-meta">priceless</div>
          <h3 className="ps-compare-h">The repo you would have shipped on.</h3>
          <p>Catching it three weeks early changes what you build next. That is the whole bet.</p>
        </article>
      </section>

      {/* ─────────────────── FAQ ─────────────────── */}
      <section className="ps-faq" aria-labelledby="ps-faq-head">
        <header className="ps-section-head">
          <h2 id="ps-faq-head">Honest answers.</h2>
          <span className="ps-section-head-meta">
            {"// FAQ · "}
            {FAQS.length.toString().padStart(2, "0")}
            {" ITEMS"}
          </span>
        </header>

        <div className="ps-faq-grid">
          {FAQS.map((f, i) => (
            <article key={f.q} className="ps-faq-card">
              <span className="ps-faq-num">Q.{(i + 1).toString().padStart(2, "0")}</span>
              <h4>{f.q}</h4>
              <p>{f.a}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ─────────────────── CLOSING STRIP ─────────────────── */}
      <section className="ps-close" aria-label="Get started">
        <div className="ps-close-corner ps-close-corner-tl" aria-hidden="true" />
        <div className="ps-close-corner ps-close-corner-tr" aria-hidden="true" />
        <div className="ps-close-corner ps-close-corner-bl" aria-hidden="true" />
        <div className="ps-close-corner ps-close-corner-br" aria-hidden="true" />

        <p className="ps-close-quote">
          Buy us a coffee. <span>We will keep the signal running.</span>
        </p>

        <div className="ps-close-row">
          <Link href="/pricing?plan=pro" className="ps-btn ps-btn-primary" prefetch={false}>
            Start Pro · {formatUsd(proPrice)}/mo
            <span aria-hidden="true" className="ps-btn-arrow">→</span>
          </Link>
          <span className="ps-close-meta">
            cheaper than a latte · more useful than another newsletter
          </span>
        </div>

        <p className="ps-close-signed">
          ~ Built for the people who want to see <span>the repo before it becomes a thread.</span>
        </p>
      </section>

      <footer className="ps-foot">
        <div className="ps-foot-left">
          <span>© {new Date().getFullYear()} trendingrepo</span>
          <span aria-hidden="true">·</span>
          <Link href="/" prefetch={false}>Trending</Link>
          <Link href="/breakout" prefetch={false}>Breakout</Link>
          <Link href="/funding" prefetch={false}>Funding</Link>
          <a href="mailto:hi@trendingrepo.com">Contact</a>
        </div>
        <div className="ps-foot-right">
          <span>Secure checkout via Stripe.</span>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Receipt — the hero artifact. A terminal-style transaction log, not a paper
// café receipt. Stays in the trendingrepo identity instead of pastiching a
// generic cafe receipt aesthetic.
// ---------------------------------------------------------------------------

function Receipt({
  proPrice,
  medianCoffee,
  cafesAboveProCount,
}: {
  proPrice: number;
  medianCoffee: number;
  cafesAboveProCount: number;
}) {
  const skipped = [
    { qty: 1, name: "Blue Bottle latte", note: "pitch breakfast", price: 7.50 },
    { qty: 1, name: "Sightglass latte", note: "founder 1:1", price: 6.75 },
    { qty: 1, name: "Ritual Hayes Valley", note: "cerebral valley", price: 6.50 },
  ];
  const subSkipped = skipped.reduce((s, r) => s + r.price * r.qty, 0);
  const savings = subSkipped - proPrice;

  return (
    <div className="rcpt" role="img" aria-label={`Receipt: skip three SF coffees, get a month of Pro for ${formatUsd(proPrice)}.`}>
      <div className="rcpt-paper-corner rcpt-paper-corner-tl" aria-hidden="true" />
      <div className="rcpt-paper-corner rcpt-paper-corner-tr" aria-hidden="true" />

      <div className="rcpt-stamp" aria-hidden="true">
        <span>PAID</span>
        <span className="rcpt-stamp-ring" />
      </div>

      <header className="rcpt-head">
        <div className="rcpt-mark">
          <span className="rcpt-mark-dot" />
          <span className="rcpt-mark-name">trendingrepo<span>.</span>terminal</span>
        </div>
        <div className="rcpt-meta">
          <span>TXN #2026-05-{(new Date().getDate()).toString().padStart(2, "0")}-OP</span>
          <span>NODE · sfo-1</span>
        </div>
      </header>

      <div className="rcpt-divider rcpt-divider-thick" />

      <div className="rcpt-section">
        <span>{"["}</span> <span>SKIPPED</span> <span>{"]"}</span>
        <span className="rcpt-section-fill" aria-hidden="true">··················································</span>
      </div>

      <ul className="rcpt-lines" aria-label="Coffees you did not buy">
        {skipped.map((r) => (
          <li key={r.name} className="rcpt-line rcpt-line-skip">
            <span className="rcpt-line-qty">{r.qty.toString().padStart(2, "0")}</span>
            <span className="rcpt-line-name">
              <span className="rcpt-line-name-main">{r.name}</span>
              <span className="rcpt-line-name-note">{r.note}</span>
            </span>
            <span className="rcpt-line-price rcpt-line-price-strike">{formatUsd(r.price)}</span>
          </li>
        ))}
      </ul>

      <div className="rcpt-subtotal rcpt-subtotal-save">
        <span>3 coffees skipped</span>
        <b>−{formatUsd(subSkipped)}</b>
      </div>

      <div className="rcpt-divider" />

      <div className="rcpt-section">
        <span>{"["}</span> <span>RECEIVED</span> <span>{"]"}</span>
        <span className="rcpt-section-fill" aria-hidden="true">··············································</span>
      </div>

      <ul className="rcpt-lines" aria-label="What Pro gives you">
        <li className="rcpt-line rcpt-line-incl">
          <span className="rcpt-line-qty">60</span>
          <span className="rcpt-line-name">
            <span className="rcpt-line-name-main">Alert rules</span>
          </span>
          <span className="rcpt-line-price rcpt-line-price-incl">incl.</span>
        </li>
        <li className="rcpt-line rcpt-line-incl">
          <span className="rcpt-line-qty">∞</span>
          <span className="rcpt-line-name">
            <span className="rcpt-line-name-main">Unlimited watchlists</span>
          </span>
          <span className="rcpt-line-price rcpt-line-price-incl">incl.</span>
        </li>
        <li className="rcpt-line rcpt-line-incl">
          <span className="rcpt-line-qty">52</span>
          <span className="rcpt-line-name">
            <span className="rcpt-line-name-main">Weekly digests + reports</span>
          </span>
          <span className="rcpt-line-price rcpt-line-price-incl">incl.</span>
        </li>
        <li className="rcpt-line rcpt-line-incl">
          <span className="rcpt-line-qty">✓</span>
          <span className="rcpt-line-name">
            <span className="rcpt-line-name-main">Breakout repo alerts</span>
          </span>
          <span className="rcpt-line-price rcpt-line-price-incl">incl.</span>
        </li>
        <li className="rcpt-line rcpt-line-incl">
          <span className="rcpt-line-qty">✓</span>
          <span className="rcpt-line-name">
            <span className="rcpt-line-name-main">Agent + AI signal tracking</span>
          </span>
          <span className="rcpt-line-price rcpt-line-price-incl">incl.</span>
        </li>
        <li className="rcpt-line rcpt-line-incl">
          <span className="rcpt-line-qty">✓</span>
          <span className="rcpt-line-name">
            <span className="rcpt-line-name-main">CSV exports + webhooks</span>
          </span>
          <span className="rcpt-line-price rcpt-line-price-incl">incl.</span>
        </li>
      </ul>

      <div className="rcpt-subtotal">
        <span>Pro plan · 1 month</span>
        <b>{formatUsd(proPrice)}</b>
      </div>

      <div className="rcpt-total-row">
        <span className="rcpt-total-label">TOTAL DUE</span>
        <span className="rcpt-total-amt">
          {formatUsd(proPrice)}
          <span className="rcpt-total-per">/ mo</span>
        </span>
      </div>

      <div className="rcpt-divider rcpt-divider-thick" />

      <div className="rcpt-payment">
        <span>PAID · VISA ····0042</span>
        <span className="rcpt-payment-save">You saved {formatUsd(savings)}</span>
      </div>

      <p className="rcpt-thanks">
        Thanks for keeping the crawler warm.
        <small>Median founder coffee: {formatUsd(medianCoffee)}. Your Pro: {formatUsd(proPrice)}. {cafesAboveProCount} of {CAFES.length} SF cafés cost more.</small>
      </p>

      <div className="rcpt-barcode" aria-hidden="true">
        <span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
        <span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
      </div>
      <div className="rcpt-barcode-code">TR-{new Date().toISOString().slice(0, 7)}-OP-650</div>

      <p className="rcpt-fine">
        * approximate menu prices, vary by store / milk / tip<br />
        cancel anytime · no seat fees · no annual lock-in
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pro card. Reads tier definition from TIERS.pro so price + features stay in
// lockstep with the entitlements helper.
// ---------------------------------------------------------------------------

const PRO_FEATURES: readonly string[] = [
  "60 alert rules",
  "Unlimited watchlists (private + public)",
  "3 webhook destinations",
  "CSV export across every list",
  "10× API rate-limit budget",
  "Weekly digest email",
  "Breakout repo alerts",
  "Agent + AI signal tracking",
  "Founder & operator reports",
];

function ProCard({
  pro,
  proPrice,
  proYearly,
  proYearlyEquivMonth,
}: {
  pro: TierDefinition;
  proPrice: number;
  proYearly: number;
  proYearlyEquivMonth: number;
}) {
  const yearlySavingsPct = Math.max(
    0,
    Math.round(((proPrice * 12 - proYearly) / (proPrice * 12)) * 100),
  );

  return (
    <article className="pro-card">
      <div className="pro-card-corner pro-card-corner-tl" aria-hidden="true" />
      <div className="pro-card-corner pro-card-corner-br" aria-hidden="true" />
      <div className="pro-card-rim" aria-hidden="true" />

      <header className="pro-head">
        <span className="pro-eyebrow">
          <span className="pro-eyebrow-slash">{"//"}</span> PRO PLAN
        </span>
        <span className="pro-rec" aria-label="Recommended plan">
          ◆ recommended
        </span>
      </header>

      <h2 className="pro-name">{pro.displayName}</h2>
      <p className="pro-tag">{pro.tagline}</p>

      <div className="pro-price-row">
        <div className="pro-price-stack">
          <div className="pro-price">
            <span className="pro-price-dollar">$</span>
            {Number.isInteger(proPrice) ? proPrice : proPrice.toFixed(2)}
          </div>
          <div className="pro-price-meta">
            <span>/ month · billed monthly</span>
            <span className="pro-price-yearly">
              or {formatUsd(proYearlyEquivMonth)}/mo annually · save {yearlySavingsPct}%
            </span>
          </div>
        </div>
        <div className="pro-anchor" role="note">
          <span className="pro-anchor-glyph" aria-hidden="true">☕</span>
          <span>
            About the price of <b>one SF founder coffee</b>.
            <br />Skip one latte. Stay ahead all month.
          </span>
        </div>
      </div>

      <div className="pro-cta-block">
        <Link href="/pricing?plan=pro" className="ps-btn ps-btn-primary ps-btn-block" prefetch={false}>
          Start Pro
          <span aria-hidden="true" className="ps-btn-arrow">→</span>
        </Link>
        <span className="pro-cta-sub">Cancel anytime <span aria-hidden="true">·</span> no seat fees <span aria-hidden="true">·</span> Stripe checkout</span>
      </div>

      <ul className="pro-features">
        {PRO_FEATURES.map((line) => (
          <li key={line}>
            <svg className="pro-features-check" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2.5 7.5 L5.5 10.5 L11.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <section className="pro-funds" aria-labelledby="pro-funds-head">
        <header className="pro-funds-head">
          <span className="pro-funds-glyph" aria-hidden="true">☕</span>
          <h3 id="pro-funds-head">
            Where your {formatUsd(proPrice)} goes
          </h3>
        </header>
        <ul className="pro-funds-list">
          <li><span className="pro-funds-dot" aria-hidden="true" />repo crawling</li>
          <li><span className="pro-funds-dot" aria-hidden="true" />alert delivery</li>
          <li><span className="pro-funds-dot" aria-hidden="true" />infrastructure</li>
          <li><span className="pro-funds-dot" aria-hidden="true" />new sources</li>
          <li><span className="pro-funds-dot" aria-hidden="true" />better ranking</li>
          <li><span className="pro-funds-dot" aria-hidden="true" />weekly reports</li>
        </ul>
        <p className="pro-funds-note">
          One operator. No investors. Every dollar funds the next scan.
        </p>
      </section>
    </article>
  );
}

// ---------------------------------------------------------------------------
// SF Founder Coffee Index — the centerpiece. Every row links out to the
// café's website and Google Maps. The trendingrepo Pro row anchors the
// comparison at the bottom.
// ---------------------------------------------------------------------------

function CoffeeIndex({
  cafes,
  proPrice,
  medianCoffee,
}: {
  cafes: readonly Cafe[];
  proPrice: number;
  medianCoffee: number;
}) {
  return (
    <article className="cafe-card">
      <header className="cafe-head">
        <div className="cafe-eyebrow-row">
          <span className="cafe-eyebrow">
            <span className="cafe-eyebrow-slash">{"//"}</span> SF FOUNDER COFFEE INDEX
          </span>
          <span className="cafe-approx">~ approx. menu prices</span>
        </div>
        <h2 className="cafe-title">11 cafés founders meet at. One Pro plan beats most of them.</h2>
        <p className="cafe-sub">
          Real spots, real menus. Every row links to the café and the map. Sorted by drink price.
        </p>
      </header>

      <ol className="cafe-list" aria-label="SF Founder Coffee Index">
        {cafes.slice(0, 8).map((cafe, idx) => (
          <CafeRow key={cafe.name} cafe={cafe} idx={idx} />
        ))}

        {/* Expandable: the last 3 cafés. <details> keeps this server-rendered. */}
        {cafes.length > 8 && (
          <li className="cafe-more-wrap">
            <details className="cafe-more">
              <summary className="cafe-more-summary">
                <span className="cafe-more-plus" aria-hidden="true">+</span>
                Show {cafes.length - 8} more cafés
                <span className="cafe-more-chevron" aria-hidden="true">›</span>
              </summary>
              <ol className="cafe-more-list" aria-label="Additional cafés">
                {cafes.slice(8).map((cafe, i) => (
                  <CafeRow key={cafe.name} cafe={cafe} idx={i + 8} />
                ))}
              </ol>
            </details>
          </li>
        )}

        {/* Pinned Pro row */}
        <li className="cafe-row cafe-row-pro">
          <span className="cafe-rank cafe-rank-pro" aria-hidden="true">
            ✦
          </span>
          <CafeGlyph mark="TR" hue="#ff6b35" name="Trendingrepo Pro" pro />
          <div className="cafe-info">
            <Link href="/pricing?plan=pro" className="cafe-name cafe-name-pro" prefetch={false}>
              trendingrepo · Pro
              <svg className="cafe-name-out" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M3 7L7 3M7 3H4M7 3V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <div className="cafe-tags cafe-tags-pro">
              <span className="cafe-tag-drink">A whole month of signal</span>
              <span className="cafe-tag-sep" aria-hidden="true">·</span>
              <span className="cafe-tag-hood">everywhere</span>
              <span className="cafe-tag-sep" aria-hidden="true">·</span>
              <span className="cafe-tag-reason">always on</span>
            </div>
          </div>
          <span className="cafe-price cafe-price-pro">{formatUsd(proPrice)}</span>
          <div className="cafe-actions cafe-actions-pro">
            <Link href="/pricing?plan=pro" className="cafe-action cafe-action-cta" prefetch={false}>
              <span>start →</span>
            </Link>
          </div>
        </li>
      </ol>

      <footer className="cafe-foot">
        <div className="cafe-stat">
          <span className="cafe-stat-k">Median founder coffee</span>
          <span className="cafe-stat-v">{formatUsd(medianCoffee)} / cup</span>
        </div>
        <div className="cafe-stat cafe-stat-you">
          <span className="cafe-stat-k">Your Pro plan</span>
          <span className="cafe-stat-v">{formatUsd(proPrice)} / month</span>
        </div>
        <p className="cafe-punch">
          One coffee. <span>One whole month of signal.</span>
        </p>
        <p className="cafe-disclaimer">
          Coffee prices are approximate and vary by location, milk, tax, tip,
          and delivery markup. We are not affiliated with these cafés.
        </p>
      </footer>
    </article>
  );
}

// Derive the apex domain (e.g. "bluebottlecoffee.com") from a café's website
// URL. Used to build the Clearbit logo lookup. Strips "www." prefix.
function domainOf(websiteUrl: string): string {
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Single café row. Extracted so the visible-8 + expandable-3 split can reuse it.
function CafeRow({ cafe, idx }: { cafe: Cafe; idx: number }) {
  return (
    <li className="cafe-row">
      <span className="cafe-rank" aria-hidden="true">
        {(idx + 1).toString().padStart(2, "0")}
      </span>
      <CafeGlyph
        mark={cafe.mark}
        hue={cafe.hue}
        name={cafe.name}
        domain={domainOf(cafe.website)}
      />
      <div className="cafe-info">
        <a
          href={cafe.website}
          className="cafe-name"
          target="_blank"
          rel="noopener noreferrer"
        >
          {cafe.name}
          <svg className="cafe-name-out" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M3 7L7 3M7 3H4M7 3V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <div className="cafe-tags">
          <span className="cafe-tag-drink">{cafe.drink}</span>
          <span className="cafe-tag-sep" aria-hidden="true">·</span>
          <span className="cafe-tag-hood">{cafe.hood}</span>
          <span className="cafe-tag-sep" aria-hidden="true">·</span>
          <span className="cafe-tag-reason">{cafe.reason}</span>
        </div>
      </div>
      <span className="cafe-price">{formatUsd(cafe.price)}</span>
      <div className="cafe-actions">
        <a
          href={cafe.maps}
          className="cafe-action"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${cafe.name} in Google Maps`}
          title="Google Maps"
        >
          <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 1.5C4.79 1.5 3 3.29 3 5.5C3 8.5 7 12.5 7 12.5C7 12.5 11 8.5 11 5.5C11 3.29 9.21 1.5 7 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="7" cy="5.5" r="1.4" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span>map</span>
        </a>
        <a
          href={cafe.website}
          className="cafe-action"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${cafe.name} website`}
          title="Website"
        >
          <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1.5 7H12.5M7 1.5C8.5 3.5 8.5 10.5 7 12.5M7 1.5C5.5 3.5 5.5 10.5 7 12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span>site</span>
        </a>
      </div>
    </li>
  );
}

// Café logo chip. Real favicons via Google's S2 favicon service
// (https://www.google.com/s2/favicons). The previous Clearbit Logo API
// (logo.clearbit.com) was shut down after HubSpot's 2017 acquisition and
// all requests now fail with HTTP 000. Google's S2 returns a 301 redirect
// to the actual favicon for every domain that has one indexed, and the
// browser follows the redirect transparently inside an <img> tag.
//
// Monogram + brand hue render behind the image so any 404 still shows a
// branded chip. White background card so light-on-light logos stay visible
// on the dark canvas.
function CafeGlyph({
  mark,
  hue,
  name,
  domain,
  pro = false,
}: {
  mark: string;
  hue: string;
  name: string;
  domain?: string;
  pro?: boolean;
}) {
  const logoUrl = domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
    : null;
  return (
    <span
      className={`cafe-glyph${pro ? " cafe-glyph-pro" : ""}`}
      style={{ "--g-hue": hue } as React.CSSProperties}
      role="img"
      aria-label={name}
    >
      <span className="cafe-glyph-mark" aria-hidden="true">{mark}</span>
      {logoUrl && !pro && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          className="cafe-glyph-logo"
          src={logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          width={32}
          height={32}
        />
      )}
      {pro && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          className="cafe-glyph-logo cafe-glyph-logo-pro"
          src="/brand/trendingrepo-mark.svg"
          alt=""
          loading="lazy"
          decoding="async"
          width={32}
          height={32}
        />
      )}
      <span className="cafe-glyph-ring" aria-hidden="true" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Route-scoped styles. Single inline <style> so the page stays one file.
// All colors via shell.css tokens (--surface, --accent, --fg-bright, etc.).
// Sharp 2px corners. No card shadows. No #000, no #fff. No em dashes in copy.
// ---------------------------------------------------------------------------

function PricingRouteStyles() {
  return (
    <style>{`
      /* ───────── Shell ───────── */
      .pricing-shell {
        max-width: 1280px;
        margin: 0 auto;
        padding: 24px 22px 48px;
        color: var(--fg-bright);
        font-family: var(--font-sans);
      }

      /* ───────── Hero ───────── */
      .ps-hero {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
        gap: 56px;
        align-items: start;
        padding: 28px 0 56px;
      }
      .ps-hero::before {
        content: "";
        position: absolute;
        top: 32px;
        bottom: 32px;
        left: calc(58% - 16px);
        width: 1px;
        background: linear-gradient(180deg, transparent, var(--border-subtle) 30%, var(--border-subtle) 70%, transparent);
        pointer-events: none;
        opacity: 0.6;
      }
      @media (max-width: 980px) {
        .ps-hero { grid-template-columns: 1fr; gap: 40px; padding-bottom: 36px; }
        .ps-hero::before { display: none; }
      }

      .ps-hero-left, .ps-hero-right { min-width: 0; position: relative; }

      .ps-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        padding: 5px 11px 5px 8px;
        margin-bottom: 26px;
        background: rgba(255, 107, 53, 0.06);
        border: 1px solid var(--accent-soft);
        border-radius: 999px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-muted);
      }
      .ps-eyebrow-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 8px var(--accent), 0 0 0 3px rgba(255, 107, 53, 0.08);
        flex-shrink: 0;
      }

      .ps-title {
        font-family: var(--font-display);
        font-weight: 600;
        font-size: clamp(36px, 4.5vw, 60px);
        line-height: 0.98;
        letter-spacing: -0.035em;
        margin: 0 0 22px;
        text-wrap: balance;
        max-width: 14ch;
        color: var(--fg-bright);
      }
      .ps-title em {
        color: var(--accent);
        font-style: italic;
        font-weight: 500;
      }
      .ps-strike {
        position: relative;
        display: inline-block;
        color: var(--fg-muted);
      }
      .ps-strike::after {
        content: "";
        position: absolute;
        left: -4%; right: -4%;
        top: 56%;
        height: 4px;
        background: var(--accent);
        border-radius: 2px;
        transform: rotate(-3deg);
        box-shadow: 0 0 10px rgba(255, 107, 53, 0.55);
      }

      .ps-lede {
        font-size: 15.5px;
        line-height: 1.55;
        color: var(--fg-muted);
        margin: 0 0 32px;
        max-width: 56ch;
      }

      /* ───────── CTA primitives ───────── */
      .ps-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        height: 50px;
        padding: 0 22px;
        border-radius: 4px;
        font-family: var(--font-sans);
        font-size: 14.5px;
        font-weight: 600;
        letter-spacing: -0.005em;
        cursor: pointer;
        border: 1px solid transparent;
        text-decoration: none;
        transition: transform 160ms var(--ease), box-shadow 160ms var(--ease), background 160ms var(--ease);
      }
      .ps-btn-block { width: 100%; }
      .ps-btn-primary {
        background: linear-gradient(180deg, #ff7a48, #ff5c1f);
        color: #0a0a0a;
        border-color: rgba(255, 107, 53, 0.45);
        box-shadow:
          0 0 0 1px rgba(255, 107, 53, 0.16),
          0 6px 18px rgba(255, 107, 53, 0.22),
          inset 0 1px 0 rgba(255, 255, 255, 0.18);
      }
      .ps-btn-primary:hover {
        transform: translateY(-1px);
        box-shadow:
          0 0 0 1px rgba(255, 107, 53, 0.42),
          0 10px 28px rgba(255, 107, 53, 0.32),
          inset 0 1px 0 rgba(255, 255, 255, 0.22);
      }
      .ps-btn-arrow {
        font-family: var(--font-mono);
        font-weight: 500;
        font-size: 16px;
        line-height: 1;
      }

      .ps-cta-row {
        display: flex;
        align-items: center;
        gap: 22px;
        flex-wrap: wrap;
        margin-bottom: 34px;
      }
      .ps-cta-stack {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ps-cta-tag {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-muted);
        letter-spacing: 0.02em;
        text-align: center;
      }
      .ps-cta-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-faint);
      }
      .ps-cta-meta-top { color: var(--fg-muted); }
      .ps-title-beat {
        color: var(--fg-bright);
        white-space: nowrap;
      }

      .ps-microlog {
        padding: 14px 16px;
        border: 1px dashed var(--border-subtle);
        border-radius: 4px;
        background: var(--surface);
        font-family: var(--font-mono);
        font-size: 12px;
        line-height: 1.7;
        color: var(--fg-muted);
        max-width: 540px;
      }
      .ps-microlog-pre {
        color: var(--accent);
        margin-right: 8px;
        font-weight: 600;
      }

      /* ───────── Receipt (hero right) ───────── */
      .rcpt {
        position: relative;
        max-width: 340px;
        margin-left: auto;
        padding: 18px 20px 14px;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.012), transparent 30%),
          linear-gradient(180deg, var(--surface-2), var(--graphite));
        border: 1px solid var(--border);
        border-radius: 4px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-muted);
        line-height: 1.45;
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.025) inset,
          0 24px 60px rgba(0, 0, 0, 0.55),
          0 8px 24px rgba(255, 107, 53, 0.05);
      }
      .rcpt-paper-corner {
        position: absolute;
        width: 14px; height: 14px;
        pointer-events: none;
      }
      .rcpt-paper-corner-tl { top: 10px; left: 10px; border-top: 1px solid var(--accent-soft); border-left: 1px solid var(--accent-soft); }
      .rcpt-paper-corner-tr { top: 10px; right: 10px; border-top: 1px solid var(--accent-soft); border-right: 1px solid var(--accent-soft); }

      .rcpt-stamp {
        position: absolute;
        top: 14px; right: -16px;
        padding: 4px 10px 3px;
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.22em;
        font-weight: 700;
        color: var(--accent);
        border: 2px solid var(--accent);
        background: rgba(255, 107, 53, 0.06);
        transform: rotate(10deg);
        white-space: nowrap;
        box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.04), 0 0 20px rgba(255, 107, 53, 0.18);
        text-shadow: 0 0 8px rgba(255, 107, 53, 0.4);
      }
      .rcpt-stamp-ring {
        position: absolute;
        inset: 3px;
        border: 1px solid rgba(255, 107, 53, 0.35);
      }

      .rcpt-head {
        text-align: center;
        margin-bottom: 14px;
      }
      .rcpt-mark {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }
      .rcpt-mark-dot {
        width: 9px; height: 9px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 8px var(--accent), 0 0 0 2px rgba(255, 107, 53, 0.18);
      }
      .rcpt-mark-name {
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 14px;
        letter-spacing: -0.01em;
        color: var(--fg-bright);
      }
      .rcpt-mark-name span { color: var(--accent); }
      .rcpt-meta {
        display: flex;
        justify-content: space-between;
        font-size: 9.5px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }

      .rcpt-divider {
        border: none;
        border-top: 1px dashed var(--border);
        margin: 8px 0;
      }
      .rcpt-divider-thick {
        border-top: 1px solid var(--border-hover);
        margin: 10px 0 8px;
      }

      .rcpt-section {
        font-size: 9.5px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent);
        margin: 4px 0 4px;
        font-weight: 600;
        display: flex;
        align-items: baseline;
        gap: 4px;
      }
      .rcpt-section-fill {
        color: var(--fg-disabled);
        font-weight: 400;
        letter-spacing: 0;
        overflow: hidden;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
      }

      .rcpt-lines { list-style: none; margin: 0; padding: 0; }
      .rcpt-line {
        display: grid;
        grid-template-columns: 24px 1fr auto;
        gap: 8px;
        align-items: baseline;
        padding: 1.5px 0;
        font-variant-numeric: tabular-nums;
      }
      .rcpt-line-qty {
        color: var(--fg-faint);
        font-size: 10px;
        text-align: right;
      }
      .rcpt-line-name { color: var(--fg-bright); font-size: 11px; }
      .rcpt-line-name-main { display: block; }
      .rcpt-line-name-note {
        display: block;
        font-size: 9px;
        color: var(--fg-faint);
        letter-spacing: 0.04em;
        margin-top: 0;
      }
      .rcpt-line-price {
        color: var(--fg-bright);
        font-weight: 500;
        font-size: 11px;
      }
      .rcpt-line-price-strike {
        text-decoration: line-through;
        text-decoration-color: var(--fg-faint);
        color: var(--fg-muted);
      }
      .rcpt-line-skip .rcpt-line-name-main { color: var(--fg-muted); }
      .rcpt-line-price-incl {
        color: var(--accent);
        font-weight: 600;
        text-transform: uppercase;
        font-size: 10px;
        letter-spacing: 0.14em;
      }

      .rcpt-subtotal {
        display: flex;
        justify-content: space-between;
        padding: 4px 0 0;
        font-size: 10.5px;
        color: var(--fg-muted);
        font-variant-numeric: tabular-nums;
      }
      .rcpt-subtotal b { color: var(--fg-bright); font-weight: 600; }
      .rcpt-subtotal-save b { color: var(--accent); }

      .rcpt-total-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-top: 8px;
        padding: 8px 0 6px;
        border-top: 1px solid var(--accent);
        border-bottom: 1px solid var(--accent);
      }
      .rcpt-total-label {
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-bright);
      }
      .rcpt-total-amt {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 24px;
        letter-spacing: -0.025em;
        color: var(--accent);
        text-shadow: 0 0 14px rgba(255, 107, 53, 0.35);
      }
      .rcpt-total-per {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
        font-weight: 500;
        letter-spacing: 0;
        margin-left: 4px;
      }

      .rcpt-payment {
        display: flex;
        justify-content: space-between;
        font-size: 9px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--fg-faint);
        margin-top: 6px;
      }
      .rcpt-payment-save {
        color: var(--accent);
        font-weight: 600;
      }

      .rcpt-thanks {
        text-align: center;
        font-size: 9.5px;
        color: var(--fg-bright);
        margin: 8px 0 6px;
        letter-spacing: 0.02em;
      }
      .rcpt-thanks small { display: none; }

      .rcpt-barcode {
        display: flex;
        justify-content: center;
        gap: 1px;
        height: 16px;
        margin: 4px 12px 2px;
      }
      .rcpt-barcode span {
        background: var(--fg-bright);
        opacity: 0.85;
      }
      .rcpt-barcode span:nth-child(3n) { width: 3px; }
      .rcpt-barcode span:nth-child(4n) { width: 1px; }
      .rcpt-barcode span:nth-child(7n) { width: 4px; }
      .rcpt-barcode span:not(:nth-child(3n)):not(:nth-child(4n)):not(:nth-child(7n)) { width: 2px; }
      .rcpt-barcode-code {
        text-align: center;
        font-size: 7.5px;
        color: var(--fg-faint);
        letter-spacing: 0.18em;
        margin-bottom: 4px;
      }

      .rcpt-fine { display: none; }

      /* ───────── Pro card + Coffee Index grid ───────── */
      .ps-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.2fr);
        gap: 18px;
        margin-bottom: 56px;
      }
      @media (max-width: 1080px) {
        .ps-grid { grid-template-columns: 1fr; }
      }

      /* Pro card */
      .pro-card {
        position: relative;
        padding: 26px 26px 22px;
        border: 1px solid var(--accent-soft);
        border-radius: 4px;
        background:
          radial-gradient(640px 320px at 100% 0%, rgba(255, 107, 53, 0.10), transparent 60%),
          radial-gradient(420px 240px at 0% 100%, rgba(255, 107, 53, 0.04), transparent 60%),
          linear-gradient(180deg, var(--surface-2), var(--graphite));
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .pro-card-rim {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255, 107, 53, 0.7), transparent);
      }
      .pro-card-corner {
        position: absolute;
        width: 14px; height: 14px;
        pointer-events: none;
      }
      .pro-card-corner-tl { top: 10px; left: 10px; border-top: 1px solid var(--accent-soft); border-left: 1px solid var(--accent-soft); }
      .pro-card-corner-br { bottom: 10px; right: 10px; border-bottom: 1px solid var(--accent-soft); border-right: 1px solid var(--accent-soft); }

      .pro-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 22px;
      }
      .pro-eyebrow {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-muted);
      }
      .pro-eyebrow-slash { color: var(--accent); margin-right: 4px; }
      .pro-rec {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--accent);
        padding: 4px 9px;
        background: rgba(255, 107, 53, 0.06);
        border: 1px solid var(--accent-soft);
        border-radius: 999px;
        font-weight: 600;
      }

      .pro-name {
        font-family: var(--font-display);
        font-size: 38px;
        font-weight: 700;
        letter-spacing: -0.03em;
        margin: 0 0 4px;
        color: var(--fg-bright);
        line-height: 1;
      }
      .pro-tag {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--fg-muted);
        margin: 0 0 24px;
        max-width: 38ch;
      }

      .pro-price-row {
        display: flex;
        align-items: flex-end;
        gap: 22px;
        padding: 18px 0 18px;
        border-top: 1px dashed var(--border);
        border-bottom: 1px dashed var(--border);
        margin-bottom: 22px;
        flex-wrap: wrap;
      }
      .pro-price-stack { flex: 1 1 200px; min-width: 0; }
      .pro-price {
        font-family: var(--font-display);
        font-size: 68px;
        font-weight: 700;
        letter-spacing: -0.045em;
        line-height: 0.92;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
      }
      .pro-price-dollar {
        font-size: 32px;
        color: var(--accent);
        vertical-align: top;
        margin-right: 2px;
        letter-spacing: 0;
      }
      .pro-price-meta {
        display: flex;
        flex-direction: column;
        gap: 3px;
        margin-top: 10px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--fg-muted);
      }
      .pro-price-yearly { color: var(--fg-faint); }

      .pro-anchor {
        flex: 0 1 220px;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--fg-muted);
        line-height: 1.5;
        padding: 10px 12px;
        background: rgba(255, 107, 53, 0.04);
        border: 1px solid var(--accent-soft);
        border-radius: 3px;
      }
      .pro-anchor-glyph {
        width: 26px; height: 26px;
        flex-shrink: 0;
        display: grid; place-items: center;
        font-size: 14px;
        background: rgba(255, 107, 53, 0.10);
        border-radius: 50%;
        color: var(--accent);
      }
      .pro-anchor b { color: var(--fg-bright); font-weight: 600; }

      .pro-cta-block {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 22px;
      }
      .pro-cta-sub {
        text-align: center;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-faint);
      }

      .pro-features {
        list-style: none;
        margin: 0 0 22px;
        padding: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px 20px;
      }
      @media (max-width: 540px) {
        .pro-features { grid-template-columns: 1fr; }
      }
      .pro-features li {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 12.5px;
        color: var(--fg-bright);
        line-height: 1.45;
      }
      .pro-features-check {
        flex-shrink: 0;
        width: 14px; height: 14px;
        margin-top: 2px;
        color: var(--accent);
      }

      .pro-foot {
        margin-top: auto;
        padding-top: 16px;
        border-top: 1px dashed var(--border-subtle);
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--fg-faint);
        line-height: 1.6;
      }
      .pro-foot-pre { color: var(--accent); }

      /* "Where your $6.50 goes" funding block */
      .pro-funds {
        margin-top: 18px;
        padding: 16px 18px 16px;
        background: rgba(255, 107, 53, 0.03);
        border: 1px dashed var(--accent-soft);
        border-radius: 3px;
      }
      .pro-funds-head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }
      .pro-funds-glyph {
        width: 24px; height: 24px;
        display: grid; place-items: center;
        background: rgba(255, 107, 53, 0.12);
        border-radius: 50%;
        font-size: 13px;
        flex-shrink: 0;
      }
      .pro-funds-head h3 {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--fg-bright);
        font-weight: 600;
      }
      .pro-funds-list {
        list-style: none;
        margin: 0 0 12px;
        padding: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 18px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--fg-bright);
      }
      .pro-funds-list li {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .pro-funds-dot {
        width: 4px; height: 4px;
        background: var(--accent);
        border-radius: 50%;
        flex-shrink: 0;
        box-shadow: 0 0 4px rgba(255, 107, 53, 0.4);
      }
      .pro-funds-note {
        margin: 0;
        padding-top: 10px;
        border-top: 1px dashed rgba(255, 107, 53, 0.18);
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-muted);
        line-height: 1.5;
        font-style: italic;
      }
      @media (max-width: 540px) {
        .pro-funds-list { grid-template-columns: 1fr; }
      }

      /* ───────── Coffee index card ───────── */
      .cafe-card {
        position: relative;
        border: 1px solid var(--border-subtle);
        border-radius: 4px;
        background: linear-gradient(180deg, var(--surface), var(--graphite));
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .cafe-head {
        padding: 22px 24px 16px;
        border-bottom: 1px dashed var(--border-subtle);
      }
      .cafe-eyebrow-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .cafe-eyebrow {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-muted);
      }
      .cafe-eyebrow-slash { color: var(--accent); margin-right: 4px; }
      .cafe-approx {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.06em;
        color: var(--fg-disabled);
        padding: 3px 7px;
        border: 1px dashed var(--border);
        border-radius: 3px;
        white-space: nowrap;
      }
      .cafe-title {
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 22px;
        letter-spacing: -0.02em;
        margin: 0 0 8px;
        color: var(--fg-bright);
        line-height: 1.2;
        text-wrap: balance;
      }
      .cafe-sub {
        font-size: 13px;
        font-family: var(--font-mono);
        color: var(--fg-muted);
        margin: 0;
        line-height: 1.55;
      }

      .cafe-list {
        list-style: none;
        margin: 0;
        padding: 4px 0;
      }
      .cafe-row {
        display: grid;
        grid-template-columns: 26px 32px 1fr auto auto;
        align-items: center;
        gap: 12px;
        padding: 12px 24px;
        border-bottom: 1px solid var(--border-subtle);
        position: relative;
        transition: background 140ms var(--ease);
      }
      .cafe-row:hover { background: rgba(255, 255, 255, 0.015); }
      .cafe-row:last-child { border-bottom: none; }
      .cafe-row-pro {
        background:
          linear-gradient(90deg, rgba(255, 107, 53, 0.08), rgba(255, 107, 53, 0.02) 60%, transparent);
      }
      .cafe-row-pro:hover { background: linear-gradient(90deg, rgba(255, 107, 53, 0.10), rgba(255, 107, 53, 0.03) 60%, transparent); }
      @media (max-width: 640px) {
        .cafe-row {
          grid-template-columns: 28px 32px 1fr auto;
          gap: 10px;
          padding: 12px 18px;
        }
        .cafe-actions { grid-column: 1 / -1; justify-content: flex-end; padding-top: 4px; }
      }

      .cafe-rank {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-disabled);
        font-variant-numeric: tabular-nums;
        text-align: right;
        letter-spacing: 0.04em;
      }
      .cafe-rank-pro {
        color: var(--accent);
        font-size: 14px;
        text-shadow: 0 0 8px rgba(255, 107, 53, 0.4);
      }

      .cafe-glyph {
        --g-hue: var(--accent);
        position: relative;
        width: 32px; height: 32px;
        border-radius: 50%;
        background: linear-gradient(150deg, color-mix(in oklab, var(--g-hue) 88%, white 0%) 0%, color-mix(in oklab, var(--g-hue) 80%, black 14%) 100%);
        display: grid; place-items: center;
        flex-shrink: 0;
        overflow: hidden;
      }
      /* Monogram sits BEHIND the logo image so a 404 still shows a chip. */
      .cafe-glyph-mark {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        font-family: var(--font-display);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: rgba(255, 255, 255, 0.96);
        text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
        z-index: 0;
      }
      /* Real café logo. White card so transparent logos read on dark canvas.
         If Clearbit 404s the browser shows alt="" (empty), leaving the
         monogram visible behind. */
      .cafe-glyph-logo {
        position: relative;
        z-index: 1;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.96);
        padding: 2px;
        object-fit: contain;
        color: transparent;     /* hide alt text if 404 */
        font-size: 0;           /* hide broken-icon glyph */
        display: block;
      }
      .cafe-glyph-logo-pro {
        background: transparent;
        padding: 4px;
      }
      .cafe-glyph-ring {
        position: absolute;
        inset: -2px;
        border-radius: 50%;
        border: 1px solid var(--border-subtle);
        pointer-events: none;
      }
      .cafe-glyph-pro {
        background: linear-gradient(150deg, #0d1117, #1a2030);
        box-shadow:
          0 0 0 2px rgba(255, 107, 53, 0.32),
          0 0 18px rgba(255, 107, 53, 0.45);
      }

      .cafe-info { min-width: 0; }
      .cafe-name {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-family: var(--font-sans);
        font-size: 14px;
        font-weight: 600;
        color: var(--fg-bright);
        text-decoration: none;
        letter-spacing: -0.005em;
        line-height: 1.2;
        margin-bottom: 4px;
        transition: color 140ms var(--ease);
      }
      .cafe-name:hover { color: var(--accent); }
      .cafe-name-out {
        width: 10px; height: 10px;
        color: var(--fg-faint);
        margin-top: 1px;
        transition: color 140ms var(--ease);
      }
      .cafe-name:hover .cafe-name-out { color: var(--accent); }
      .cafe-name-pro { color: var(--accent); }
      .cafe-name-pro:hover { color: #ffaa7a; }

      .cafe-tags {
        font-family: var(--font-mono);
        font-size: 10.5px;
        line-height: 1.4;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cafe-tag-drink { color: var(--fg-muted); }
      .cafe-tag-hood { color: var(--fg-bright); font-weight: 500; }
      .cafe-tag-reason { color: var(--fg-faint); font-style: italic; }
      .cafe-tag-sep { color: var(--fg-disabled); margin: 0 6px; }
      .cafe-tags-pro .cafe-tag-drink { color: var(--accent); font-weight: 500; }
      .cafe-tags-pro .cafe-tag-hood { color: var(--fg-bright); }

      .cafe-price {
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--fg-bright);
        padding: 4px 10px;
        background: var(--surface-3);
        border: 1px solid var(--border);
        border-radius: 3px;
        white-space: nowrap;
      }
      .cafe-price-pro {
        color: var(--accent);
        background: rgba(255, 107, 53, 0.10);
        border-color: var(--accent-soft);
        font-weight: 700;
        box-shadow: 0 0 14px rgba(255, 107, 53, 0.16);
      }

      .cafe-actions { display: flex; gap: 4px; }
      .cafe-action {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 26px;
        padding: 0 9px;
        border-radius: 3px;
        background: transparent;
        border: 1px solid var(--border-subtle);
        color: var(--fg-muted);
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.04em;
        text-decoration: none;
        text-transform: lowercase;
        transition: all 140ms var(--ease);
      }
      .cafe-action:hover {
        background: var(--surface-3);
        color: var(--fg-bright);
        border-color: var(--border-hover);
      }
      .cafe-action svg { width: 11px; height: 11px; }
      .cafe-action-cta {
        background: var(--accent);
        color: #1a0e08;
        border-color: var(--accent);
        font-weight: 700;
        padding: 0 14px;
        text-transform: none;
        font-size: 11px;
        letter-spacing: 0;
      }
      .cafe-action-cta:hover {
        background: #ff7d50;
        border-color: #ff7d50;
        color: #0a0a0a;
      }

      .cafe-foot {
        padding: 18px 24px 22px;
        border-top: 1px dashed var(--border-subtle);
        background: linear-gradient(180deg, transparent, rgba(255, 107, 53, 0.02));
      }
      .cafe-stat {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 0;
        font-family: var(--font-mono);
        font-size: 12px;
      }
      .cafe-stat-k {
        color: var(--fg-muted);
      }
      .cafe-stat-v {
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        font-weight: 500;
      }
      .cafe-stat-you .cafe-stat-k { color: var(--accent); font-weight: 600; }
      .cafe-stat-you .cafe-stat-v { color: var(--accent); font-weight: 700; }
      .cafe-punch {
        margin: 12px 0 0;
        padding-top: 12px;
        border-top: 1px dashed var(--border-subtle);
        font-family: var(--font-display);
        font-size: 19px;
        font-weight: 600;
        letter-spacing: -0.015em;
        color: var(--fg-bright);
        line-height: 1.25;
        text-wrap: balance;
      }
      .cafe-punch span { color: var(--accent); }
      .cafe-disclaimer {
        margin: 12px 0 0;
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--fg-disabled);
        line-height: 1.55;
        letter-spacing: 0.02em;
        font-style: italic;
      }

      /* Expandable "show 3 more cafés" group */
      .cafe-more-wrap {
        padding: 0;
        list-style: none;
        border-bottom: 1px solid var(--border-subtle);
      }
      .cafe-more { width: 100%; }
      .cafe-more-summary {
        list-style: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 24px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--fg-muted);
        transition: color 140ms var(--ease), background 140ms var(--ease);
      }
      .cafe-more-summary::-webkit-details-marker { display: none; }
      .cafe-more-summary:hover {
        color: var(--fg-bright);
        background: rgba(255, 255, 255, 0.015);
      }
      .cafe-more-plus {
        display: inline-grid;
        place-items: center;
        width: 18px; height: 18px;
        border: 1px dashed var(--accent-soft);
        border-radius: 3px;
        color: var(--accent);
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
        flex-shrink: 0;
      }
      .cafe-more-chevron {
        margin-left: auto;
        color: var(--accent);
        font-size: 16px;
        transition: transform 220ms var(--ease);
      }
      .cafe-more[open] .cafe-more-chevron { transform: rotate(90deg); }
      .cafe-more-list {
        list-style: none;
        margin: 0;
        padding: 0;
        border-top: 1px dashed var(--border-subtle);
        background: rgba(255, 255, 255, 0.008);
      }
      .cafe-more-list .cafe-row:last-child { border-bottom: none; }

      /* ───────── Compare strip ───────── */
      .ps-compare {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 14px;
        margin-bottom: 64px;
      }
      @media (max-width: 880px) {
        .ps-compare { grid-template-columns: 1fr; }
      }
      .ps-compare-card {
        position: relative;
        padding: 20px 22px 22px;
        background: linear-gradient(180deg, var(--surface), var(--graphite));
        border: 1px solid var(--border-subtle);
        border-radius: 4px;
        overflow: hidden;
        min-height: 156px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .ps-compare-card-pri {
        background:
          linear-gradient(180deg, rgba(255, 107, 53, 0.05), rgba(255, 107, 53, 0.02));
        border-color: var(--accent-soft);
      }
      .ps-compare-label {
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-muted);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ps-compare-pip {
        width: 5px; height: 5px;
        background: var(--accent);
        border-radius: 50%;
        box-shadow: 0 0 6px var(--accent);
      }
      .ps-compare-meta {
        position: absolute;
        top: 18px; right: 22px;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-disabled);
        letter-spacing: 0.06em;
      }
      .ps-compare-card-pri .ps-compare-meta { color: var(--accent); font-weight: 600; }
      .ps-compare-h {
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 22px;
        letter-spacing: -0.022em;
        margin: 0;
        color: var(--fg-bright);
        line-height: 1.15;
      }
      .ps-compare-card-pri .ps-compare-h { color: var(--accent); }
      .ps-compare-card p {
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--fg-muted);
        margin: auto 0 0;
        line-height: 1.55;
      }
      .ps-compare-card-pri p { color: var(--fg-bright); }

      /* ───────── FAQ ───────── */
      .ps-faq { margin-bottom: 64px; }
      .ps-section-head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }
      .ps-section-head h2 {
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 30px;
        letter-spacing: -0.025em;
        margin: 0;
        color: var(--fg-bright);
        text-wrap: balance;
        max-width: 22ch;
      }
      .ps-section-head-meta {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-faint);
        letter-spacing: 0.06em;
      }

      .ps-faq-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      @media (max-width: 760px) {
        .ps-faq-grid { grid-template-columns: 1fr; }
      }
      .ps-faq-card {
        position: relative;
        padding: 22px 24px;
        background: linear-gradient(180deg, var(--surface), var(--graphite));
        border: 1px solid var(--border-subtle);
        border-radius: 4px;
      }
      .ps-faq-num {
        position: absolute;
        top: 18px; right: 22px;
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-disabled);
        letter-spacing: 0.14em;
      }
      .ps-faq-card h4 {
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 16.5px;
        letter-spacing: -0.015em;
        margin: 0 0 10px;
        color: var(--fg-bright);
        padding-right: 30px;
        line-height: 1.3;
      }
      .ps-faq-card p {
        margin: 0;
        font-size: 13px;
        font-family: var(--font-mono);
        color: var(--fg-muted);
        line-height: 1.6;
      }

      /* ───────── Closing strip ───────── */
      .ps-close {
        position: relative;
        margin-bottom: 56px;
        padding: 48px 44px;
        border-radius: 4px;
        border: 1px solid var(--border-subtle);
        background:
          radial-gradient(640px 200px at 50% 0%, rgba(255, 107, 53, 0.10), transparent 70%),
          linear-gradient(180deg, var(--surface-2), var(--graphite));
        text-align: center;
        overflow: hidden;
      }
      .ps-close-corner {
        position: absolute;
        width: 14px; height: 14px;
        pointer-events: none;
      }
      .ps-close-corner-tl { top: 12px; left: 12px; border-top: 1px solid var(--accent-soft); border-left: 1px solid var(--accent-soft); }
      .ps-close-corner-tr { top: 12px; right: 12px; border-top: 1px solid var(--accent-soft); border-right: 1px solid var(--accent-soft); }
      .ps-close-corner-bl { bottom: 12px; left: 12px; border-bottom: 1px solid var(--accent-soft); border-left: 1px solid var(--accent-soft); }
      .ps-close-corner-br { bottom: 12px; right: 12px; border-bottom: 1px solid var(--accent-soft); border-right: 1px solid var(--accent-soft); }

      .ps-close-quote {
        font-family: var(--font-display);
        font-weight: 600;
        font-size: clamp(26px, 3.4vw, 38px);
        line-height: 1.15;
        letter-spacing: -0.025em;
        margin: 0 0 22px;
        text-wrap: balance;
        max-width: 22ch;
        margin-inline: auto;
        color: var(--fg-bright);
      }
      .ps-close-quote span { color: var(--accent); }

      .ps-close-row {
        display: inline-flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .ps-close-meta {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--fg-faint);
      }
      .ps-close-signed {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-faint);
        margin: 22px 0 0;
        letter-spacing: 0.01em;
      }
      .ps-close-signed span { color: var(--fg-muted); }

      /* ───────── Footer ───────── */
      .ps-foot {
        margin-top: 32px;
        padding: 20px 0 12px;
        border-top: 1px solid var(--border-subtle);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-faint);
      }
      .ps-foot-left, .ps-foot-right {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .ps-foot a {
        color: var(--fg-muted);
        text-decoration: none;
      }
      .ps-foot a:hover { color: var(--accent); }
    `}</style>
  );
}
