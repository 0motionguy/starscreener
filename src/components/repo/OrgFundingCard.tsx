// OrgFundingCard — org funding rows. The plan calls this
// `getFundingEventsForRepoOrg`, but the lib exports
// `getFundingEventsForRepo(fullName)`. The matcher works at the org level
// internally; we pass the full repo name and trust it to surface org-level
// rounds. Empty state if there are none.

import type { RepoFundingEvent } from "@/lib/funding/repo-events";

interface OrgFundingCardProps {
  owner: string;
  events: RepoFundingEvent[];
}

function monthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  return `${d.toLocaleString("en-US", { month: "short" })} ${d.getUTCFullYear()}`;
}

export function OrgFundingCard({ owner, events }: OrgFundingCardProps) {
  const rows = events.slice(0, 4);

  if (rows.length === 0) {
    return (
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">
            ▌ <b>Org · {owner}</b> · funding events
          </h2>
        </div>
        <div
          style={{
            padding: "16px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-faint)",
          }}
        >
          No funding events matched for this org.
        </div>
      </div>
    );
  }

  const totalRaised = rows
    .map((r) => r.signal.extracted?.amount ?? 0)
    .reduce((a, b) => a + b, 0);
  const totalDisplay =
    totalRaised > 1_000_000_000
      ? `$${(totalRaised / 1_000_000_000).toFixed(1)}B`
      : totalRaised > 1_000_000
        ? `$${(totalRaised / 1_000_000).toFixed(0)}M`
        : totalRaised > 0
          ? `$${totalRaised.toLocaleString()}`
          : "—";

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Org · {owner}</b> · funding events
        </h2>
      </div>
      {rows.map((r) => {
        const s = r.signal;
        const round = s.extracted?.roundType ?? "round";
        const amount = s.extracted?.amountDisplay ?? "undisclosed";
        const investors =
          s.extracted?.investors && s.extracted.investors.length > 0
            ? `led by ${s.extracted.investors.slice(0, 2).join(", ")}`
            : null;
        return (
          <div key={s.id} className="funding-row">
            <div className="funding-date">{monthYear(s.publishedAt)}</div>
            <div className="funding-event">
              <b>{round}</b>
              {investors ? ` · ${investors}` : ""}
            </div>
            <div className="funding-amt">{amount}</div>
          </div>
        );
      })}
      <div
        style={{
          padding: "10px 14px",
          background: "var(--graphite)",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span className="muted" style={{ fontSize: 11 }}>
          Total raised: <b className="accent-text mono">{totalDisplay}</b>
        </span>
      </div>
    </div>
  );
}
