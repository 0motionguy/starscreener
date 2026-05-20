import type { RepoFundingEvent } from "@/lib/funding/repo-events";
import type { Repo } from "@/lib/types";

interface OrgFundingCardProps {
  repo: Repo;
  events: RepoFundingEvent[];
}

interface FundingContextRow {
  date: string;
  event: React.ReactNode;
  amount: string;
}

function monthYear(iso: string | null | undefined): string {
  if (!iso) return "tracked";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "tracked";
  const date = new Date(ts);
  return `${date.toLocaleString("en-US", { month: "short" })} ${date.getUTCFullYear()}`;
}

function formatMoney(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
  if (amount > 0) return `$${amount.toLocaleString()}`;
  return "signal";
}

function fallbackRows(repo: Repo): FundingContextRow[] {
  return [
    {
      date: "live",
      event: (
        <>
          <b>OSS traction</b> · {repo.stars.toLocaleString()} stars
        </>
      ),
      amount: `m${Math.round(repo.momentumScore)}`,
    },
    {
      date: "7d",
      event: (
        <>
          <b>Demand signal</b> · {(repo.mentions?.total7d ?? 0).toLocaleString()} mentions
        </>
      ),
      amount: `${repo.channelsFiring ?? 0}/6`,
    },
    {
      date: "30d",
      event: (
        <>
          <b>Contributor pace</b> · {repo.contributors.toLocaleString()} total
        </>
      ),
      amount: repo.contributorsDelta30d > 0 ? `+${repo.contributorsDelta30d}` : "tracked",
    },
  ];
}

export function OrgFundingCard({ repo, events }: OrgFundingCardProps) {
  const fundingRows = events.slice(0, 4).map((event): FundingContextRow => {
    const signal = event.signal;
    const round = signal.extracted?.roundType ?? "round";
    const investors =
      signal.extracted?.investors && signal.extracted.investors.length > 0
        ? `led by ${signal.extracted.investors.slice(0, 2).join(", ")}`
        : "matched by funding source";

    return {
      date: monthYear(signal.publishedAt),
      event: (
        <>
          <b>{round}</b> · {investors}
        </>
      ),
      amount: signal.extracted?.amountDisplay ?? "undisclosed",
    };
  });

  const rows = fundingRows.length > 0 ? fundingRows : fallbackRows(repo);
  const totalRaised = events
    .map((event) => event.signal.extracted?.amount ?? 0)
    .reduce((sum, amount) => sum + amount, 0);
  const totalDisplay = totalRaised > 0 ? formatMoney(totalRaised) : `m${Math.round(repo.momentumScore)}`;

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Org · {repo.owner}</b> · funding context
        </h2>
      </div>
      {rows.map((row, index) => (
        <div key={`${row.date}-${index}`} className="funding-row">
          <div className="funding-date">{row.date}</div>
          <div className="funding-event">{row.event}</div>
          <div className="funding-amt">{row.amount}</div>
        </div>
      ))}
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
          Total signal: <b className="accent-text mono">{totalDisplay}</b>
        </span>
      </div>
    </div>
  );
}
