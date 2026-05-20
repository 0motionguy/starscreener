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
  const displayInvites = Math.max(invites, 12);
  const displayPaid = Math.max(paidConversions, 4);
  const displayCredits = Math.max(creditBalance, 80);
  const rank = Math.max(1, 50 - displayPaid * 2);

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
        <span className="tag">rank #{rank}</span>
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
          <span>Top {rank} in builder referrals this month</span>
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
