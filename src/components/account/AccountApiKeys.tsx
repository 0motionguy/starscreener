// AccountApiKeys - `.card` block listing per-user API credentials.

interface ApiKey {
  id?: string;
  label?: string;
  lastUsedAt?: string | null;
  prefix?: string;
}

interface AccountApiKeysProps {
  keys: ApiKey[];
}

const SEEDED_KEYS: ApiKey[] = [
  {
    id: "seed-watchlist-reader",
    label: "Watchlist Reader",
    prefix: "tr_live_wlr_7f2a",
    lastUsedAt: "last used 18 minutes ago",
  },
  {
    id: "seed-alerts-webhook",
    label: "Alerts Webhook",
    prefix: "tr_live_alr_21d9",
    lastUsedAt: "last used 2 hours ago",
  },
  {
    id: "seed-drops-intake",
    label: "Drops Intake",
    prefix: "tr_live_drp_95ac",
    lastUsedAt: "not used yet",
  },
];

export function AccountApiKeys({ keys }: AccountApiKeysProps) {
  const rows = keys.length ? keys : SEEDED_KEYS;

  return (
    <section className="card" aria-labelledby="account-api-keys-head">
      <div className="card-head">
        <h2 className="card-title" id="account-api-keys-head">
          <b>API keys</b> &middot; account credentials
        </h2>
        <span className="grow" />
        <span className="tag">{rows.length.toLocaleString()} active</span>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 8 }}>
        {rows.map((key, index) => (
          <div key={key.id ?? index} className="feed-item">
            <b>{key.label ?? "API key"}</b>
            <span>
              {key.prefix ? `${key.prefix} - ` : ""}
              {key.lastUsedAt ?? "not used yet"}
            </span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            paddingTop: 8,
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <span className="muted" style={{ fontSize: 11 }}>
            Rate limit: 4,200 / 10,000 requests used this month
          </span>
          <button type="button" className="btn ghost sm" data-watch-toggle>
            Create scoped key
          </button>
        </div>
      </div>
    </section>
  );
}
