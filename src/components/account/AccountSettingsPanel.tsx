interface AccountSettingsPanelProps {
  email: string | null;
  emailDigestEnabled: boolean;
}

export function AccountSettingsPanel({
  email,
  emailDigestEnabled,
}: AccountSettingsPanelProps) {
  return (
    <section className="card" aria-labelledby="account-settings-head">
      <div className="card-head">
        <h2 className="card-title" id="account-settings-head">
          <b>Settings</b> &middot; account preferences
        </h2>
        <span className="grow" />
        <span className="tag">private</span>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 8 }}>
        <SettingRow
          label="Email"
          value={email ?? "not connected"}
          status={email ? "ok" : "warn"}
        />
        <SettingRow
          label="Weekly digest"
          value={emailDigestEnabled ? "enabled" : "disabled"}
          status={emailDigestEnabled ? "ok" : "muted"}
        />
        <SettingRow label="Timezone" value="UTC (auto)" status="muted" />
        <SettingRow
          label="Public profile"
          value="visible on /u/<handle>"
          status="ok"
        />
        <SettingRow label="API access" value="enabled" status="ok" />
      </div>
    </section>
  );
}

type SettingStatus = "ok" | "warn" | "muted";

function SettingRow({
  label,
  value,
  status = "muted",
}: {
  label: string;
  value: string;
  status?: SettingStatus;
}) {
  const tone =
    status === "ok"
      ? "var(--fg-bright)"
      : status === "warn"
        ? "var(--accent-warn, #d97706)"
        : "var(--fg)";
  return (
    <div className="feed-item">
      <b>{label}</b>
      <span style={{ color: tone }}>{value}</span>
    </div>
  );
}
