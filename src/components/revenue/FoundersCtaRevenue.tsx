import Link from "next/link";

interface FoundersCtaRevenueProps {
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
      <Link className="fc-cta" href="/drop?mode=revenue">
        Claim or submit revenue -&gt;
      </Link>
    </div>
  );
}
