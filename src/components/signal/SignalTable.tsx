// Universal dense table for the Signal Terminal. Replaces the per-tab
// RepoMentionsTab + NewsTab pair with one columns-prop-driven component.
// Caller normalizes its source-specific data into SignalRow[] and
// declares which columns it wants visible.

import Link from "next/link";

import { SignalBadge, type SignalBadgeKind } from "./SignalBadge";
import { SourceMonogram, type MonoSource } from "./SourceMonogram";

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

  /** Optional vendor product logo (16-20px, leading the title). */
  logoUrl?: string | null;
  /** Brand color hex (no #) used as the logo's background tile. */
  brandColor?: string | null;
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
      <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/30 px-4 py-10 text-center">
        <p className="font-mono text-sm text-text-tertiary">{emptyTitle}</p>
        {emptySubtitle ? (
          <p className="mt-1 text-[11px] text-text-tertiary">{emptySubtitle}</p>
        ) : null}
      </div>
    );
  }

  const cols = columns && columns.length > 0 ? columns : DEFAULT_COLUMNS;
  const engagementLabel = rows[0]?.engagementLabel ?? "Engagement";

  return (
    <div className="overflow-x-auto rounded-card border border-border-primary bg-bg-card">
      <table className="w-full text-xs">
        <thead className="text-left text-text-tertiary">
          <tr className="border-b border-border-primary bg-bg-muted/40">
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
                  className={`px-2 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${widthCls}`}
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
            return (
              <tr
                key={row.id}
                className={
                  "border-b border-border-primary/40 last:border-b-0 hover:bg-bg-muted/20 " +
                  (old ? "opacity-60" : "")
                }
              >
                {cols.map((c) => {
                  if (c === "rank") {
                    return (
                      <td
                        key={c}
                        className="px-2 py-2 align-top font-mono text-text-tertiary tabular-nums"
                      >
                        {idx + 1}
                      </td>
                    );
                  }
                  if (c === "title") {
                    const titleNode = row.href ? (
                      row.external ? (
                        <a
                          href={row.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-2 font-medium text-text-primary hover:underline"
                        >
                          {row.title}
                        </a>
                      ) : (
                        <Link
                          href={row.href}
                          className="line-clamp-2 font-medium text-text-primary hover:underline"
                        >
                          {row.title}
                        </Link>
                      )
                    ) : (
                      <span className="line-clamp-2 font-medium text-text-primary">
                        {row.title}
                      </span>
                    );
                    return (
                      <td key={c} className="px-2 py-2 align-top">
                        <div className="flex items-start gap-2">
                          {row.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.logoUrl}
                              alt=""
                              loading="lazy"
                              width={20}
                              height={20}
                              className="mt-0.5 h-5 w-5 flex-none rounded-sm object-contain"
                              style={
                                row.brandColor
                                  ? { backgroundColor: `#${row.brandColor}1A` }
                                  : undefined
                              }
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            {titleNode}
                            {row.attribution || (row.badges && row.badges.length) ? (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-text-tertiary">
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
                      <td key={c} className="px-2 py-2 align-top">
                        {row.source ? <SourceMonogram source={row.source} /> : null}
                      </td>
                    );
                  }
                  if (c === "topic") {
                    return (
                      <td key={c} className="px-2 py-2 align-top hidden md:table-cell">
                        {row.topic ? (
                          <span className="rounded-full border border-border-primary bg-bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary">
                            {row.topic}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                    );
                  }
                  if (c === "linkedRepo") {
                    return (
                      <td key={c} className="px-2 py-2 align-top hidden lg:table-cell">
                        {row.linkedRepo ? (
                          <Link
                            href={`/repo/${row.linkedRepo}`}
                            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-functional hover:underline"
                          >
                            <SignalBadge kind="linked-repo" override="↳" />
                            <span className="truncate">{row.linkedRepo}</span>
                          </Link>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                    );
                  }
                  if (c === "engagement") {
                    return (
                      <td
                        key={c}
                        className="px-2 py-2 align-top text-text-secondary tabular-nums hidden md:table-cell"
                      >
                        {fmtNum(row.engagement)}
                      </td>
                    );
                  }
                  if (c === "comments") {
                    return (
                      <td
                        key={c}
                        className="px-2 py-2 align-top text-text-secondary tabular-nums hidden md:table-cell"
                      >
                        {fmtNum(row.comments)}
                      </td>
                    );
                  }
                  if (c === "velocity") {
                    return (
                      <td key={c} className="px-2 py-2 align-top">
                        {velocityBadge(row.velocity)}
                      </td>
                    );
                  }
                  if (c === "age") {
                    return (
                      <td
                        key={c}
                        className="px-2 py-2 align-top font-mono text-text-tertiary tabular-nums"
                      >
                        {fmtAge(row.postedAt)}
                      </td>
                    );
                  }
                  if (c === "signal") {
                    return (
                      <td
                        key={c}
                        className="px-2 py-2 align-top font-mono font-semibold tabular-nums"
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
