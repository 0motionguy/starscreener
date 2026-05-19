// PricingFAQ — static FAQ section rendered below the tier cards.
//
// Server component. Accordion-free by design — one-line Q, two-line A, no
// JS needed. Keeps the page accessible without hydration.

interface FaqEntry {
  q: string;
  a: string;
}

const FAQ: FaqEntry[] = [
  {
    q: "How does billing work?",
    a: "Pro and Team are billed monthly or annually in USD. Annual plans are prepaid and discounted (~20%). Seats on Team are per-user, minimum 3.",
  },
  {
    q: "Can I downgrade or cancel?",
    a: "Yes. Downgrades take effect at the end of the current billing period. You keep Pro features until that date. No retroactive refunds.",
  },
  {
    q: "What counts as a seat on Team?",
    a: "One person, one seat. Seats share webhooks, watchlists, and usage reports. You can add or remove seats from the team workspace at any time; prorated billing applies.",
  },
  {
    q: "Is there a Free plan forever?",
    a: "Yes. Free is rate-limited but has no time limit. You get 3 alerts, a 5-repo watchlist, and the public read API. No credit card, no nudge emails.",
  },
  {
    q: "How do I export my data?",
    a: "Pro and above get CSV export on watchlists, breakouts, and collections. Free-tier callers can still read the public API (JSON) within the shared rate-limit budget.",
  },
  {
    q: "Do you offer SLAs?",
    a: "Team gets priority support during business hours. Enterprise gets a signed SLA with uptime targets and a named support contact. Reach out to sales for specifics.",
  },
  {
    q: "Can I bring my own infrastructure?",
    a: "Enterprise supports on-prem feed mirrors and bulk repo tracking beyond the shared catalog. Contact sales with your deployment and volume and we'll scope a contract.",
  },
  {
    q: "Is there a student or open-source tier?",
    a: "Reach out — we approve credits case-by-case for verifiable open-source maintainers and student researchers. Keep the email short: project, GitHub handle, use case.",
  },
];

export function PricingFAQ() {
  return (
    <section
      aria-labelledby="pricing-faq-heading"
      className="mt-12 border border-border-primary rounded-md bg-bg-secondary/40 font-mono"
    >
      <header className="border-b border-border-primary px-4 py-3 md:px-6">
        <h2
          id="pricing-faq-heading"
          className="text-sm uppercase tracking-wider text-text-tertiary"
        >
          {"// Frequently asked"}
        </h2>
      </header>
      <dl className="divide-y divide-border-primary/60 px-4 py-4 md:px-6">
        {FAQ.map((entry) => (
          <div key={entry.q} className="grid gap-2 py-4 md:grid-cols-[280px_1fr] md:gap-6">
            <dt className="text-sm font-semibold text-text-primary">{entry.q}</dt>
            <dd className="text-sm text-text-secondary">{entry.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
