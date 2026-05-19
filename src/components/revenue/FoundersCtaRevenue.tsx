// FoundersCtaRevenue — green "Claim or submit revenue" CTA strip.
// Links to the revenue-submissions form. Falls back to /account?tab=billing
// where that route doesn't exist yet.

import Link from "next/link";

interface FoundersCtaRevenueProps {
  /** Number of verified-this-week submissions, if available. */
  verifiedThisWeek?: number;
}

export function FoundersCtaRevenue({
  verifiedThisWeek,
}: FoundersCtaRevenueProps) {
  return (
    <div className="founders-cta fade-up">
      <span className="fc-tag">Founders</span>
      <span className="fc-msg">
        Don&rsquo;t see your project? Connect a verified-revenue profile (Stripe
        / Lemon / Paddle read-only) or self-report your MRR.
        {typeof verifiedThisWeek === "number" && verifiedThisWeek > 0 ? (
          <>
            {" "}
            <b>{verifiedThisWeek} verified this week.</b>
          </>
        ) : null}
      </span>
      <Link className="fc-cta" href="/submissions/revenue">
        Claim or submit revenue →
      </Link>
    </div>
  );
}
