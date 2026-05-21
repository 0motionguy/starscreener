// AccountAlertInbox — `.card` + `.alert-row` block from 05-account.html.
// Renders the live per-user inbox when alert events are passed in; otherwise
// derives a six-row desk feed from the seeded account context.

import type { ReactNode } from "react";
import { ChevronUp, FileText, Star } from "lucide-react";

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

const SEEDED_EVENTS: AlertEvent[] = [
  {
    id: "sample-1",
    kind: "release",
    title: "v6.0.0-rc.4 shipped on vercel/ai-sdk",
    meta: "RELEASE · github · 412 stars in 24h",
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
  {
    id: "sample-6",
    kind: "threshold",
    title: "modelcontextprotocol/servers crossed your 25K star rule",
    meta: "THRESHOLD · 25K stars · MCP watchlist",
    time: "4d",
    unread: false,
  },
];

const KIND_GLYPH: Record<NonNullable<AlertEvent["kind"]>, ReactNode> = {
  release: <ChevronUp size={11} strokeWidth={2.5} aria-hidden="true" />,
  breakout: <ChevronUp size={11} strokeWidth={2.5} aria-hidden="true" />,
  mention: <Star size={11} strokeWidth={2} fill="currentColor" aria-hidden="true" />,
  digest: <FileText size={11} strokeWidth={2} aria-hidden="true" />,
  threshold: <Star size={11} strokeWidth={2} fill="currentColor" aria-hidden="true" />,
};

export function AccountAlertInbox({ events }: AccountAlertInboxProps) {
  const rows: AlertEvent[] = events.length === 0 ? SEEDED_EVENTS : events;
  const unread = rows.filter((r) => r.unread).length;
  const headLabel = `${rows.length} today · ${unread} unread`;

  return (
    <section className="card" aria-labelledby="account-alert-inbox-head">
      <div className="card-head">
        <h2 className="card-title" id="account-alert-inbox-head">
          <b>Alert inbox</b> &middot; {headLabel}
        </h2>
        <span className="grow" />
        <span className="tag">{rows.length.toLocaleString()} events</span>
      </div>
      {rows.map((event, index) => {
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
        })}
    </section>
  );
}
