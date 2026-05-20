// AccountAlertInbox — `.card` + `.alert-row` block from 05-account.html.
// Renders the live per-user inbox when alert events are passed in; falls
// back to a 5-row SAMPLE feed with a disclosure pill until the alerts
// dispatcher exposes a per-user reader. The 3-of-5 `.unread` proportion
// + 4 icon kinds (release / breakout / mention / digest) mirror the mockup.

interface AlertEvent {
  id?: string;
  title?: string;
  meta?: string;
  time?: string;
  kind?: "release" | "breakout" | "mention" | "digest" | "threshold";
  unread?: boolean;
}

interface AccountAlertInboxProps {
  events: AlertEvent[];
}

const SAMPLE_EVENTS: AlertEvent[] = [
  {
    id: "sample-1",
    kind: "release",
    title: "v6.0.0-rc.4 shipped on vercel/ai-sdk",
    meta: "RELEASE · github · 412 ★ in 24h",
    time: "12h",
    unread: true,
  },
  {
    id: "sample-2",
    kind: "breakout",
    title:
      "exo-explore/exo just hit your watchlist breakout threshold (+24%)",
    meta: "BREAKOUT · mention spike across 5 sources · Karpathy retweet",
    time: "18h",
    unread: true,
  },
  {
    id: "sample-3",
    kind: "mention",
    title:
      "Your dropped repo kermit457/star-screener got a HN front-page mention",
    meta: "MENTION · 184 pts · 62 comments",
    time: "22h",
    unread: true,
  },
  {
    id: "sample-4",
    kind: "digest",
    title:
      "Your weekly digest is ready — 18 watched repos, 3 breakouts, 8 cross-source mentions",
    meta: "DIGEST · weekly",
    time: "1d",
    unread: false,
  },
  {
    id: "sample-5",
    kind: "mention",
    title: "cline/cline hit a new milestone: 30K stars",
    meta: "THRESHOLD · 30000 stars · watching",
    time: "2d",
    unread: false,
  },
];

const KIND_GLYPH: Record<NonNullable<AlertEvent["kind"]>, string> = {
  release: "▲",
  breakout: "▲",
  mention: "★",
  digest: "D",
  threshold: "★",
};

export function AccountAlertInbox({ events }: AccountAlertInboxProps) {
  const usingSample = events.length === 0;
  const rows: AlertEvent[] = usingSample ? SAMPLE_EVENTS : events;
  const unread = rows.filter((r) => r.unread).length;
  const headLabel = usingSample
    ? `${rows.length} sample · ${unread} unread`
    : `${rows.length} today · ${unread} unread`;

  return (
    <section className="card" aria-labelledby="account-alert-inbox-head">
      <div className="card-head">
        <h2 className="card-title" id="account-alert-inbox-head">
          <b>Alert inbox</b> &middot; {headLabel}
        </h2>
        <span className="grow" />
        <span className="tag">{rows.length.toLocaleString()} events</span>
      </div>
      {usingSample ? (
        <div
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span className="muted" style={{ fontSize: 11 }}>
            Sample alerts &mdash; connect Slack/email to start receiving real ones
          </span>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div style={{ padding: 14 }}>
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12 }}>
            No alert events in this account view yet.
          </p>
        </div>
      ) : (
        rows.map((event, index) => {
          const kind = event.kind ?? "mention";
          const glyph = KIND_GLYPH[kind];
          return (
            <div
              key={event.id ?? index}
              className={`alert-row${event.unread ? " unread" : ""}`}
              data-alert-kind={kind}
            >
              <div className={`alert-mark ${kind}`} aria-hidden="true">
                {glyph}
              </div>
              <div>
                <div className="alert-title">
                  <b>{event.title ?? "Alert fired"}</b>
                </div>
                {event.meta ? (
                  <div className="alert-meta">{event.meta}</div>
                ) : null}
              </div>
              <div className="alert-time">{event.time ?? "recent"}</div>
            </div>
          );
        })
      )}
    </section>
  );
}
