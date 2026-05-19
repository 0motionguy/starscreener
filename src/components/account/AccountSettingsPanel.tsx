interface AccountSettingsPanelProps {
  email: string | null;
  emailDigestEnabled: boolean;
}

export function AccountSettingsPanel({
  email,
  emailDigestEnabled,
}: AccountSettingsPanelProps) {
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Settings</b> · account preferences
        </h2>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 10 }}>
        <SettingRow label="Email" value={email ?? "not connected"} />
        <SettingRow
          label="Weekly digest"
          value={emailDigestEnabled ? "enabled" : "disabled"}
        />
      </div>
    </section>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 12,
        color: "var(--fg)",
      }}
    >
      <span style={{ color: "var(--fg-muted)" }}>{label}</span>
      <b>{value}</b>
    </div>
  );
}
