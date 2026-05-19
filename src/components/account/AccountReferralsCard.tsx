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
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Referrals</b> · shareable invite link
        </h2>
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
