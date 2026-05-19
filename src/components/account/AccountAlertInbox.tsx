interface AccountAlertInboxProps {
  events: Array<{ id?: string; title?: string; createdAt?: string }>;
}

export function AccountAlertInbox({ events }: AccountAlertInboxProps) {
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Alert inbox</b> · latest triggers
        </h2>
        <span className="grow" />
        <span className="tag">{events.length.toLocaleString()} events</span>
      </div>
      <div style={{ padding: 14 }}>
        {events.length === 0 ? (
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12 }}>
            No alert events in this account view yet.
          </p>
        ) : (
          events.map((event, index) => (
            <div key={event.id ?? index} className="feed-item">
              <b>{event.title ?? "Alert fired"}</b>
              <span>{event.createdAt ?? "recent"}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
