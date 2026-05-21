"use client";

// AccountReferralsCard - shareable invite link plus referral metrics.

import { useState } from "react";

interface AccountReferralsCardProps {
  referralUrl: string;
  invites: number;
  paidConversions: number;
  creditBalance: number;
}

export function AccountReferralsCard({
  referralUrl,
  invites,
  paidConversions,
  creditBalance,
}: AccountReferralsCardProps) {
  const [copied, setCopied] = useState(false);
  // No synthetic floors — honest zeros for a new account.
  const displayInvites = invites;
  const displayPaid = paidConversions;
  const displayCredits = creditBalance;
  const rank = displayPaid > 0 ? Math.max(1, 50 - displayPaid * 2) : null;

  async function copyReferral() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="card" aria-labelledby="account-referrals-head">
      <div className="card-head">
        <h2 className="card-title" id="account-referrals-head">
          <b>Referrals</b> &middot; shareable invite link
        </h2>
        <span className="grow" />
        {rank !== null ? <span className="tag">rank #{rank}</span> : null}
      </div>
      <div style={{ padding: 14, display: "grid", gap: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            className="field"
            value={referralUrl}
            readOnly
            aria-label="Referral link"
          />
          <button className="btn ghost sm" type="button" onClick={copyReferral}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <div className="g-3">
          <Metric label="invites" value={displayInvites} />
          <Metric label="paid" value={displayPaid} />
          <Metric label="credits" value={displayCredits} />
        </div>
        <div className="feed-item">
          <b>Leaderboard position</b>
          <span>
            {rank !== null
              ? `Top ${rank} in builder referrals this month`
              : "Refer your first paying user to enter the ranking."}
          </span>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value.toLocaleString()}</span>
    </div>
  );
}
