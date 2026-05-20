// DigestSubscribeCta — visual subscribe card.
//
// Per the brief: do NOT invent a fake subscribe endpoint. The card shows an
// email-input shape (purely visual — actual subscription wiring will land
// when the email vendor is picked) and the primary CTA routes to /account
// where the user can manage their notification preferences.
//
// Stateless server component; no client JS.

import Link from "next/link";

interface DigestSubscribeCtaProps {
  /** Optional headline subscriber count for social proof. */
  subscriberCount?: number;
  /** Tunes the copy when no archive exists yet. */
  isEmpty?: boolean;
}

export function DigestSubscribeCta({
  subscriberCount,
  isEmpty,
}: DigestSubscribeCtaProps) {
  return (
    <div className="digest-cta">
      <div className="cta-side">
        <div className="cta-eyebrow">SUBSCRIBE</div>
        <h3 className="cta-title">
          {isEmpty
            ? "Be first on the list."
            : "Get the digest before it hits the timeline."}
        </h3>
        <p className="cta-sub">
          One email each morning. Top movers, breakout repos, funding
          headlines, and the news the trend desk is reading. Zero filler.
          {typeof subscriberCount === "number" && subscriberCount > 0 ? (
            <>
              {" "}
              <span className="mono">{subscriberCount.toLocaleString()}</span>{" "}
              subscribers.
            </>
          ) : null}
        </p>
      </div>
      <div className="cta-form" role="group" aria-label="Subscribe to the daily digest">
        <div className="cta-input" aria-hidden>
          <span className="ph">you@company.com</span>
        </div>
        <Link
          href="/account?subscribe=digest"
          prefetch={false}
          className="cta-btn"
          aria-label="Open account to manage digest subscription"
        >
          Subscribe →
        </Link>
        <div className="cta-fine">
          Manage in <Link href="/account" prefetch={false} className="cta-fine-link">/account</Link> · unsubscribe anytime
        </div>
      </div>
    </div>
  );
}
