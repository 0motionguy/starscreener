// FoundersCta — bottom-of-page founders CTA strip.
// Links to /drop?type=funding when the drop surface accepts it.

import Link from "next/link";

export function FoundersCta() {
  return (
    <div className="founders-cta fade-up" style={{ marginTop: 20 }}>
      <span className="fc-tag">Founders</span>
      <span className="fc-msg">
        Just raised? Drop your round below — verified rounds get a green
        checkmark and a dedicated row on the tape.
      </span>
      <Link className="fc-cta" href="/drop?type=funding" prefetch={false}>
        Submit a round →
      </Link>
    </div>
  );
}
