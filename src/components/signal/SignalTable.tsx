// Universal dense table for the Signal Terminal. Replaces the per-tab
// RepoMentionsTab + NewsTab pair with one columns-prop-driven component.
// Caller normalizes its source-specific data into SignalRow[] and
// declares which columns it wants visible.

import Link from "next/link";

import { SignalBadge, type SignalBadgeKind } from "./SignalBadge";
import { SourceMonogram, type MonoSource } from "./SourceMonogram";
import { EntityLogo } from "@/components/ui/EntityLogo";

export type SignalColumn =
  | "rank"
  | "title"
  | "source"
  | "topic"
  | "linkedRepo"
  | "engagement"
  | "comments"
  | "velocity"
  | "age"
  | "signal";

export interface SignalRow {
  /** Stable key for React. Source-prefixed (e.g. "reddit:abc123"). */
  id: string;

  /** Primary line — repo full name OR post title. */
  title: string;
  /** External link (post URL) or internal href (`/repo/...`). */
  href?: string | null;
  /** External target — opens in new tab when true. */
  external?: boolean;

  /** Secondary line under the title — author / subreddit / handle. */
  attribution?: string | null;
  /** Hover excerpt — short post body / top reply. */
  excerpt?: string | null;

  /** Source monogram (only renders when `source` column is requested). */
  source?: MonoSource;

  /** Single topic chip text (Agents · MCP · …). */
  topic?: string | null;

  /** Linked repo full name (`owner/name`) — when present, renders a
   * green LINKED badge + clickable repo path. */
  linkedRepo?: string | null;

  /** Engagement number (likes / score / reactions). */
  engagement?: number;
  /** Display label for the engagement column header — defaults "Engagement". */
  engagementLabel?: string;

  comments?: number;

  /** Pre-categorized velocity from the page's compute step. */
  velocity?: "hot" | "rising" | "steady" | null;

  /** ISO timestamp — converted to "5h" by the row. */
  postedAt?: string | null;

  /** 0–100 signal score. */
  signalScore?: number | null;

  /** Optional inline badges (max 3 enforced visually). */
  badges?: SignalBadgeKind[];

  /** Optional avatar / logo URL for the row (renders next to the title).
   *  Falls back to a deterministic monogram tile when missing. */
  logoUrl?: string | null;
}

interface SignalTableProps {
  rows: SignalRow[];
  /** Columns to render, in order. Use [] to fall back to default set. */
  columns?: SignalColumn[];
  /** Empty-state copy when rows is empty. */
  emptyTitle?: string;
  emptySubtitle?: string;
}

const DEFAULT_COLUMNS: SignalColumn[] = [
  "rank",
  "title",
  "linkedRepo",
  "engagement",
  "velocity",
  "age",
  "signal",
];

function fmtAge(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 60_000) return "now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d > 3) return ">3d";
  return `${d}d`;
}

function fmtNum(n: number | undefined | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function velocityBadge(v: SignalRow["velocity"]) {
  if (v === "hot") return <SignalBadge kind="hot" />;
  if (v === "rising") return <SignalBadge kind="rising" />;
  return null;
}

const COLUMN_HEADERS: Record<SignalColumn, string> = {
  rank: "#",
  title: "Signal",
  source: "Src",
  topic: "Topic",
  linkedRepo: "Linked Repo",
  engagement: "Engagement",
  comments: "Comments",
  velocity: "Velocity",
  age: "Age",
  signal: "Signal",
};

export function SignalTable({
  rows,
  columns,
  emptyTitle = "No signals in this window.",
  emptySubtitle,
}: SignalTableProps) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-[2px] border border-dashed px-4 py-10 text-center"
        style={{
          borderColor: "var(--v4-line-100)",
          background: "var(--v4-bg-025)",
        }}
      >
        <p
          className="v2-mono text-[11px] tracking-[0.18em] uppercase"
          style={{ color: "var(--v4-ink-300)" }}
        >
          {emptyTitle}
        </p>
        {emptySubtitle ? (
          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--v4-ink-400)" }}
          >
            {emptySubtitle}
          </p>
        ) : null}
      </div>
    );
  }

  const cols = columns && columns.length > 0 ? columns : DEFAULT_COLUMNS;
  const engagementLabel = rows[0]?.engagementLabel ?? "Engagement";

  return (
    <div
      className="overflow-x-auto"
      style={{
        background: "var(--v4-bg-050)",
        border: "1px solid var(--v4-line-200)",
        borderRadius: 2,
      }}
    >
      <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
        <thead className="text-left">
          <tr
            style={{
              borderBottom: "1px solid var(--v4-line-100)",
              background: "var(--v4-bg-025)",
            }}
          >
            {cols.map((c) => {
              const header = c === "engagement" ? engagementLabel : COLUMN_HEADERS[c];
              const widthCls =
                c === "rank"
                  ? "w-10"
                  : c === "source"
                    ? "w-12"
                    : c === "age"
                      ? "w-14"
                      : c === "signal"
                        ? "w-14"
                        : c === "engagement" || c === "comments"
                          ? "w-20 hidden md:table-cell"
                          : c === "velocity"
                            ? "w-20"
                            : c === "topic"
                              ? "w-24 hidden md:table-cell"
                              : c === "linkedRepo"
                                ? "w-44 hidden lg:table-cell"
                                : "";
              return (
                <th
                  key={c}
                  scope="col"
                  className={`v2-mono px-3 py-2 text-[10px] uppercase tracking-[0.18em] ${widthCls}`}
                  style={{ color: "var(--v4-ink-400)", fontWeight: 500 }}
                >
                  {header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const old = row.postedAt ? Date.now() - Date.parse(row.postedAt) > 3 * 86_400_000 : false;
            const stagger = Math.min(idx, 6) * 50;
            return (
              <tr
                key={row.id}
                className={"v2-row group " + (old ? "opacity-60" : "")}
                style={{
                  borderBottom: "1px dashed var(--v4-line-100)",
                  animation: "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                  animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
                }}
              >
                {cols.map((c) => {
                  if (c === "rank") {
                    return (
                      <td
                        key={c}
                        className="px-3 py-2.5 align-top font-mono tabular-nums"
                        style={{ color: "var(--v4-ink-300)" }}
                      >
                        {idx + 1}
                      </td>
                    );
                  }
                  if (c === "title") {
                    const titleClass =
                      "line-clamp-2 font-medium transition-colors hover:text-[color:var(--v4-acc)]";
                    const titleStyle = { color: "var(--v4-ink-100)" };
                    const titleNode = row.href ? (
                      row.external ? (
                        <a
                          href={row.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={titleClass}
                          style={titleStyle}
                        >
                          {row.title}
                        </a>
                      ) : (
                        <Link
                          href={row.href}
                          className={titleClass}
                          style={titleStyle}
                        >
                          {row.title}
                        </Link>
                      )
                    ) : (
                      <span
                        className="line-clamp-2 font-medium"
                        style={{ color: "var(--v4-ink-100)" }}
                      >
                        {row.title}
                      </span>
                    );
                    return (
                      <td key={c} className="px-3 py-2.5 align-top">
                        <div className="flex min-w-0 items-start gap-2">
                          <EntityLogo
                            src={row.logoUrl ?? null}
                            name={row.linkedRepo ?? row.attribution ?? row.title}
                            size={20}
                            shape="square"
                            alt=""
                          />
                          <div className="min-w-0">
                            {titleNode}
                            {row.attribution || (row.badges && row.badges.length) ? (
                              <div
                                className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]"
                                style={{ color: "var(--v4-ink-400)" }}
                              >
                                {row.attribution ? <span>{row.attribution}</span> : null}
                                {row.badges?.slice(0, 3).map((b) => (
                                  <SignalBadge key={b} kind={b} />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    );
                  }
                  if (c === "source") {
                    return (
                      <td key={c} className="px-3 py-2.5 align-top">
                        {row.source ? <SourceMonogram source={row.source} /> : null}
                      </td>
                    );
                  }
                  if (c === "topic") {
                    return (
                      <td key={c} className="px-3 py-2.5 align-top hidden md:table-cell">
                        {row.topic ? (
                          <span
                            className="v2-mono inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]"
                            style={{
                              border: "1px solid var(--v4-line-200)",
                              background: "var(--v4-bg-100)",
                              color: "var(--v4-ink-200)",
                              borderRadius: 2,
                            }}
                          >
                            {row.topic}
                          </span>
                        ) : (
                          <span style={{ color: "var(--v4-ink-500)" }}>—</span>
                        )}
                      </td>
                    );
                  }
                  if (c === "linkedRepo") {
                    return (
                      <td key={c} className="px-3 py-2.5 align-top hidden lg:table-cell">
                        {row.linkedRepo ? (
                          <Link
                            href={`/repo/${row.linkedRepo}`}
                            className="inline-flex items-center gap-1.5 font-mono text-[11px] hover:underline"
                            style={{ color: "var(--v4-money)" }}
                          >
                            <SignalBadge kind="linked-repo" override="↳" />
                            <span className="truncate">{row.linkedRepo}</span>
                          </Link>
                        ) : (
                          <span style={{ color: "var(--v4-ink-500)" }}>—</span>
                        )}
                      </td>
                    );
                  }
                  if (c === "engagement") {
                    return (
                      <td
                        key={c}
                        className="px-3 py-2.5 align-top tabular-nums hidden md:table-cell"
                        style={{ color: "var(--v4-ink-200)" }}
                      >
                        {fmtNum(row.engagement)}
                      </td>
                    );
                  }
                  if (c === "comments") {
                    return (
                      <td
                        key={c}
                        className="px-3 py-2.5 align-top tabular-nums hidden md:table-cell"
                        style={{ color: "var(--v4-ink-200)" }}
                      >
                        {fmtNum(row.comments)}
                      </td>
                    );
                  }
                  if (c === "velocity") {
                    return (
                      <td key={c} className="px-3 py-2.5 align-top">
                        {velocityBadge(row.velocity)}
                      </td>
                    );
                  }
                  if (c === "age") {
                    return (
                      <td
                        key={c}
                        className="px-3 py-2.5 align-top font-mono tabular-nums"
                        style={{ color: "var(--v4-ink-300)" }}
                      >
                        {fmtAge(row.postedAt)}
                      </td>
                    );
                  }
                  if (c === "signal") {
                    return (
                      <td
                        key={c}
                        className="px-3 py-2.5 align-top font-mono font-semibold tabular-nums"
                        style={{ color: "var(--v4-ink-000)" }}
                      >
                        {row.signalScore !== null && row.signalScore !== undefined
                          ? Math.round(row.signalScore)
                          : "—"}
                      </td>
                    );
                  }
                  return null;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default SignalTable;
