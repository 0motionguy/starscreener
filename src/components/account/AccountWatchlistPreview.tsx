// AccountWatchlistPreview — `.card` + `.wlist-row` block from 05-account.html.
// Each row renders a `<RepoSparkline>` (unified Recharts primitive) so the
// per-row mini-chart shares one language with the rest of the site. Alert
// state is shown via `.wlist-alert.on` when the page knows an alert rule
// fired for that repo; otherwise the badge collapses to a muted "silent"
// label so the row still parses as a 5-cell grid.

import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/lib/icons";
import { RepoSparkline } from "@/components/trending/RepoSparkline";

export interface AccountWatchlistRow {
  fullName: string;
  owner: string;
  name: string;
  /** Display category (ai-framework / coding-agent / local-llm / …). */
  category?: string | null;
  /** Primary language (TypeScript / Python / Go / …). */
  language?: string | null;
  /** Star count snapshot. */
  stars?: number | null;
  /** 24h star delta. Used for the up/down chevron meta cell + spark direction. */
  starsDelta24h?: number | null;
  /** Daily star history (≤14 used for the spark; longer arrays get trimmed). */
  sparklineData?: number[] | null;
  /** Optional human-readable alert hint when the user's rule fired. */
  alertLabel?: string | null;
}

interface AccountWatchlistPreviewProps {
  repos: AccountWatchlistRow[] | string[];
  expanded?: boolean;
}

const AVATAR_BG: Record<string, string> = {
  TypeScript: "#16093a",
  JavaScript: "#3a2e09",
  Python: "#0b3a0e",
  Go: "#091f3a",
  Rust: "#3a1a09",
};

function avatarSeed(name: string): string {
  return (
    name
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function formatStars(stars: number | null | undefined): ReactNode {
  if (stars === null || stars === undefined || !Number.isFinite(stars)) {
    return "—";
  }
  const label = stars >= 1_000 ? `${(stars / 1_000).toFixed(1)}K` : String(stars);
  return (
    <>
      {label} <Icon name="star-fill" size={10} style={{ display: "inline", verticalAlign: "-1px" }} />
    </>
  );
}

function formatDelta(delta: number | null | undefined): ReactNode {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) {
    return "— stable";
  }
  if (delta === 0) return "— stable";
  const abs = Math.abs(delta);
  const suffix = abs >= 1_000 ? `${(abs / 1_000).toFixed(1)}K` : String(abs);
  const chevron = delta > 0 ? "chevron-up" : "chevron-down";
  return (
    <>
      <Icon name={chevron} size={10} style={{ display: "inline", verticalAlign: "-1px" }} /> {delta > 0 ? `+${suffix}` : `-${suffix}`}
    </>
  );
}

function sparkClass(delta: number | null | undefined): "up" | "down" | "muted" {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) {
    return "muted";
  }
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "muted";
}

function sparkPoints(history: number[] | null | undefined): number[] {
  if (!Array.isArray(history) || history.length === 0) return [];
  return history.slice(-30);
}

function coerceRow(input: AccountWatchlistRow | string): AccountWatchlistRow {
  if (typeof input === "string") {
    const [owner = "", name = ""] = input.split("/");
    return { fullName: input, owner, name };
  }
  return input;
}

export function AccountWatchlistPreview({
  repos,
  expanded = false,
}: AccountWatchlistPreviewProps) {
  const rows = (repos as Array<AccountWatchlistRow | string>).map(coerceRow);
  const visible = expanded ? rows : rows.slice(0, 6);

  return (
    <section className="card" aria-labelledby="account-watchlist-head">
      <div className="card-head">
        <h2 className="card-title" id="account-watchlist-head">
          <b>Watchlist</b> &middot; {rows.length.toLocaleString()} repo
          {rows.length === 1 ? "" : "s"} &middot; ordered by 24h velocity
        </h2>
        <span className="grow" />
        <Link
          href="/account"
          className="muted"
          prefetch={false}
          style={{ fontSize: 11, textDecoration: "underline" }}
        >
          Manage all &rarr;
        </Link>
      </div>
      {visible.length === 0 ? (
        <div style={{ padding: 14 }}>
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12 }}>
            No private watchlist repos yet.
          </p>
        </div>
      ) : (
        visible.map((row) => {
          const href =
            row.owner && row.name
              ? `/repo/${encodeURIComponent(row.owner)}/${encodeURIComponent(row.name)}`
              : "/account";
          const seed = avatarSeed(row.name || row.fullName);
          const bg =
            AVATAR_BG[row.language ?? ""] ?? "var(--surface-2)";
          const klass = sparkClass(row.starsDelta24h);
          const points = sparkPoints(row.sparklineData);
          const alertOn = Boolean(row.alertLabel);
          return (
            <div
              className="wlist-row"
              key={row.fullName}
              data-fullname={row.fullName}
            >
              <div
                className="repo-avatar"
                style={{ background: bg, color: "#fff", fontSize: 9 }}
                aria-hidden="true"
              >
                {seed}
              </div>
              <div>
                <Link
                  href={href}
                  prefetch={false}
                  className="wlist-name"
                  style={{ color: "var(--fg-bright)" }}
                >
                  <span className="muted">{row.owner}/</span>
                  {row.name}
                </Link>
                <span className="muted" style={{ fontSize: 10.5 }}>
                  {row.category ?? "—"} &middot; {row.language ?? "—"}
                </span>
              </div>
              <div className={`wlist-alert${alertOn ? " on" : ""}`}>
                {alertOn ? (
                  <>
                    <Icon name="chevron-up" size={10} style={{ display: "inline", verticalAlign: "-1px" }} /> ALERT ON &middot; {row.alertLabel}
                  </>
                ) : (
                  "— silent"
                )}
              </div>
              <div className="wlist-spark">
                {points.length > 1 ? (
                  <RepoSparkline data={points} variant={klass} />
                ) : (
                  <div className="spark muted" aria-hidden="true" />
                )}
              </div>
              <div className="wlist-meta">
                <span className="star">{formatStars(row.stars)}</span>
                <span className="delta">{formatDelta(row.starsDelta24h)}</span>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
