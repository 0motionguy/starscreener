// FoundersCta renders the bottom funding submission strip.

import Link from "next/link";

export function FoundersCta() {
  return (
    <div className="founders-cta fade-up" style={{ marginTop: 20 }}>
      <span className="fc-tag">Founders</span>
      <span className="fc-msg">
        Just raised? Drop your round below. Verified rounds get a green checkmark
        and a dedicated row on the tape.
      </span>
      <Link className="fc-cta" href="/drop?type=funding" prefetch={false}>
        Submit a round -&gt;
      </Link>
    </div>
  );
}
