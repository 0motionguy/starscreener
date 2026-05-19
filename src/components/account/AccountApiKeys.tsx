interface AccountApiKeysProps {
  keys: Array<{ id?: string; label?: string; lastUsedAt?: string | null }>;
}

export function AccountApiKeys({ keys }: AccountApiKeysProps) {
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>API keys</b> · account credentials
        </h2>
        <span className="grow" />
        <span className="tag">{keys.length.toLocaleString()} active</span>
      </div>
      <div style={{ padding: 14 }}>
        {keys.length === 0 ? (
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12 }}>
            No API keys are attached to this account yet.
          </p>
        ) : (
          keys.map((key, index) => (
            <div key={key.id ?? index} className="feed-item">
              <b>{key.label ?? "API key"}</b>
              <span>{key.lastUsedAt ?? "not used yet"}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
