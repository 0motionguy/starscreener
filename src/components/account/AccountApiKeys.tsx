// AccountApiKeys — `.card` block listing per-user API credentials. POST
// `/api/me/api-keys` is deferred to backlog; the Generate CTA is rendered
// disabled with `title="Coming soon"` so the surface doesn't look stuck.

interface ApiKey {
  id?: string;
  label?: string;
  lastUsedAt?: string | null;
  prefix?: string;
}

interface AccountApiKeysProps {
  keys: ApiKey[];
}

export function AccountApiKeys({ keys }: AccountApiKeysProps) {
  const isEmpty = keys.length === 0;
  return (
    <section className="card" aria-labelledby="account-api-keys-head">
      <div className="card-head">
        <h2 className="card-title" id="account-api-keys-head">
          <b>API keys</b> &middot; account credentials
        </h2>
        <span className="grow" />
        <span className="tag">{keys.length.toLocaleString()} active</span>
      </div>
      <div style={{ padding: 14 }}>
        {isEmpty ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12 }}>
              No API keys are attached to this account yet. Generate one to
              programmatically read your watchlist, alerts, and drops queue.
            </p>
            <button
              type="button"
              className="btn ghost sm"
              disabled
              title="Coming soon"
              aria-disabled="true"
            >
              Generate API key
            </button>
          </div>
        ) : (
          keys.map((key, index) => (
            <div key={key.id ?? index} className="feed-item">
              <b>{key.label ?? "API key"}</b>
              <span>
                {key.prefix ? `${key.prefix} · ` : ""}
                {key.lastUsedAt ?? "not used yet"}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
