// AccountReferralsCard — shareable invite link + 3-cell metric strip.
// When no referral activity exists yet (invites/paid/credits all zero)
// we surface an empty-state badge so the panel doesn't look broken.

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
  const hasActivity =
    invites > 0 || paidConversions > 0 || creditBalance > 0;
  return (
    <section className="card" aria-labelledby="account-referrals-head">
      <div className="card-head">
        <h2 className="card-title" id="account-referrals-head">
          <b>Referrals</b> &middot; shareable invite link
        </h2>
        <span className="grow" />
        {hasActivity ? null : (
          <span
            className="tag"
            style={{ color: "var(--fg-muted)" }}
            title="Share the link below to start earning credits"
          >
            No referral activity yet
          </span>
        )}
      </div>
      <div style={{ padding: 14, display: "grid", gap: 12 }}>
        <code
          style={{
            padding: "10px 12px",
            border: "1px solid var(--border-subtle)",
            background: "var(--surface-2)",
            color: "var(--fg-bright)",
            overflowWrap: "anywhere",
          }}
        >
          {referralUrl}
        </code>
        <div className="g-3">
          <Metric label="invites" value={invites} />
          <Metric label="paid" value={paidConversions} />
          <Metric label="credits" value={creditBalance} />
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
