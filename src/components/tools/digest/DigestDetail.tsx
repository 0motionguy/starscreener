// DigestDetail — right-column detail view of a single digest. Renders the
// digest's date header, summary line, and ranked repo list. Used by the
// /tools/digest page after the selected date has been resolved.
//
// Server component. Data fetching stays in the page, which is responsible for
// loading the DigestData (or null) via getDigestForDate() and handing the
// already-resolved object in. Keeps the component pure + testable.

import Link from "next/link";

import type { DigestData } from "@/lib/digest/queries";

interface DigestDetailProps {
  digest: DigestData | null;
  /** Number of top entries to render. The digest itself may have more. */
  topN?: number;
}

function formatLongDate(date: string): string {
  const ts = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ts)) return date;
  const d = new Date(ts);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const weekdays = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
  ];
  return `${weekdays[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatStarsDelta(n: number): string {
  if (n <= 0) return "—";
  if (n >= 1000) return `+${(n / 1000).toFixed(1)}k`;
  return `+${n}`;
}

function formatStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function DigestDetail({ digest, topN = 10 }: DigestDetailProps) {
  if (!digest) {
    return (
      <div className="digest-detail not-found">
        <div className="dd-head">
          <div className="dd-eyebrow">DIGEST</div>
          <h2 className="dd-title">Digest refresh queued for this date</h2>
        </div>
        <div className="dd-empty-card">
          <div className="dd-empty-title">This issue is not in the archive.</div>
          <p className="dd-empty-sub">
            Pick a date from the left-column archive, or jump back to the
            latest digest.
          </p>
          <Link href="/tools/digest" prefetch={false} className="dd-back">
            ← Back to latest
          </Link>
        </div>
      </div>
    );
  }

  const top = digest.entries.slice(0, topN);
  const top1 = top[0] ?? null;
  const moverCount = digest.entries.filter((e) => e.starsDelta24h > 0).length;
  const langTally = new Map<string, number>();
  for (const entry of digest.entries) {
    if (entry.language) {
      langTally.set(entry.language, (langTally.get(entry.language) ?? 0) + 1);
    }
  }
  const topLang = [...langTally.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  return (
    <div className="digest-detail">
      <div className="dd-head">
        <div className="dd-eyebrow">
          DIGEST · {digest.date} · ISSUE {digest.totalRepos > 0 ? "LIVE" : "DRAFT"}
        </div>
        <h2 className="dd-title">{formatLongDate(digest.date)}</h2>
        {top1 ? (
          <p className="dd-summary">
            <span className="hl">{top1.fullName}</span> leads with{" "}
            <span className="mono">{formatStarsDelta(top1.starsDelta24h)}</span>{" "}
            in 24h. {moverCount} movers tracked
            {topLang ? <> · top language <span className="mono">{topLang[0]}</span></> : null}.
          </p>
        ) : (
          <p className="dd-summary">
            Snapshot of the {digest.totalRepos} repos in the trend pipeline.
          </p>
        )}
      </div>

      <div className="dd-kpis" role="list">
        <div className="dd-kpi" role="listitem">
          <span className="kpi-l">REPOS</span>
          <span className="kpi-v">{digest.totalRepos.toLocaleString()}</span>
        </div>
        <div className="dd-kpi" role="listitem">
          <span className="kpi-l">MOVERS</span>
          <span className="kpi-v">{moverCount.toLocaleString()}</span>
        </div>
        <div className="dd-kpi" role="listitem">
          <span className="kpi-l">TOP LANG</span>
          <span className="kpi-v">{topLang?.[0] ?? "—"}</span>
        </div>
        <div className="dd-kpi" role="listitem">
          <span className="kpi-l">SHOWING</span>
          <span className="kpi-v">{Math.min(top.length, topN).toLocaleString()}</span>
        </div>
      </div>

      <div className="dd-section">
        <div className="dd-section-head">
          <span className="ssh-num">01</span>
          <span className="ssh-title">Top movers · 24h</span>
          <span className="ssh-meta">
            <b>{top.length}</b> of {digest.totalRepos.toLocaleString()}
          </span>
        </div>
        {top.length === 0 ? (
          <div className="dd-empty-card mini">
            <div className="dd-empty-title">Movers refresh queued for this issue.</div>
          </div>
        ) : (
          <ol className="dd-list" role="list">
            {top.map((entry) => (
              <li key={entry.fullName} className="dd-row">
                <span className="r-rank">{String(entry.rank).padStart(2, "0")}</span>
                <span className="r-body">
                  <Link
                    href={`/repo/${entry.fullName}`}
                    prefetch={false}
                    className="r-name"
                  >
                    {entry.fullName}
                  </Link>
                  {entry.description ? (
                    <span className="r-desc">{entry.description}</span>
                  ) : null}
                  <span className="r-meta">
                    {entry.language ? (
                      <span className="m-tag">{entry.language}</span>
                    ) : null}
                    {entry.category ? (
                      <span className="m-tag soft">{entry.category}</span>
                    ) : null}
                    {entry.momentumScore !== null ? (
                      <span className="m-tag soft">
                        momentum {entry.momentumScore.toFixed(1)}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="r-stats">
                  <span className="r-delta">{formatStarsDelta(entry.starsDelta24h)}</span>
                  <span className="r-stars">{formatStars(entry.stars)} ★</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="dd-foot">
        <Link href="/" prefetch={false} className="dd-foot-link">
          ↗ View full trending board
        </Link>
        <span className="dd-foot-sep">·</span>
        <Link href={`/tools/digest?date=${digest.date}`} prefetch={false} className="dd-foot-link">
          ↗ Permalink
        </Link>
      </div>
    </div>
  );
}
