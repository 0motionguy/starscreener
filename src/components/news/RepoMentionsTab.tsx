// Default tab on every per-source news page: a sortable list of repos
// most-discussed on this source in the last 7 days. Each source's page
// normalizes its data into RepoMentionRow[] before passing it in, so
// this component stays source-agnostic.

import Link from "next/link";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl } from "@/lib/logos";

export interface RepoMentionRow {
  fullName: string;
  /** Mentions in the source's window (typically 7d). */
  count: number;
  /** Source-specific engagement number (likes for Bluesky, score for HN, comments for Reddit). */
  engagement?: number;
  /** Short label for the engagement metric — e.g. "likes", "score". */
  engagementLabel?: string;
  /** Excerpt of the top post / story. */
  topExcerpt?: string | null;
  /** Author / subreddit / community attribution. */
  attribution?: string | null;
  /** External URL for the top post. */
  topUrl?: string | null;
  /** ISO timestamp of the top post / most recent activity. */
  topAt?: string | null;
}

interface RepoMentionsTabProps {
  rows: RepoMentionRow[];
  /** Window label shown in the empty state — e.g. "7d". */
  windowLabel?: string;
  /** Source name shown in the empty state. */
  sourceLabel: string;
}

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
  return `${d}d`;
}

function fmtNum(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function RepoMentionsTab({
  rows,
  windowLabel = "7d",
  sourceLabel,
}: RepoMentionsTabProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/40 px-4 py-8 text-center">
        <p className="text-sm text-text-tertiary">
          No repo mentions on {sourceLabel} in the last {windowLabel}.
        </p>
        <p className="mt-1 text-[11px] text-text-tertiary">
          {"// scraper is healthy, just no GitHub links matched tracked repos in this window"}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-text-tertiary">
          <tr className="border-b border-border-primary">
            <th className="px-2 py-2 font-mono uppercase tracking-wider w-8">#</th>
            <th className="px-2 py-2 font-mono uppercase tracking-wider">Repo</th>
            <th className="px-2 py-2 font-mono uppercase tracking-wider w-20">Mentions</th>
            <th className="px-2 py-2 font-mono uppercase tracking-wider w-24 hidden md:table-cell">
              {rows[0]?.engagementLabel ?? "Engagement"}
            </th>
            <th className="px-2 py-2 font-mono uppercase tracking-wider hidden lg:table-cell">
              Top post
            </th>
            <th className="px-2 py-2 font-mono uppercase tracking-wider w-16">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={`${row.fullName}-${idx}`}
              className="border-b border-border-primary/40 last:border-b-0 hover:bg-bg-muted/30"
            >
              <td className="px-2 py-2 text-text-tertiary tabular-nums">
                {idx + 1}
              </td>
              <td className="px-2 py-2 font-semibold">
                <Link
                  href={`/repo/${row.fullName}`}
                  className="inline-flex min-w-0 items-center gap-2 text-text-primary hover:underline"
                >
                  <EntityLogo
                    src={repoLogoUrl(row.fullName, 20)}
                    name={row.fullName}
                    size={20}
                    shape="square"
                    alt=""
                  />
                  {row.fullName}
                </Link>
              </td>
              <td className="px-2 py-2 tabular-nums text-text-primary">
                {fmtNum(row.count)}
              </td>
              <td className="px-2 py-2 tabular-nums text-text-secondary hidden md:table-cell">
                {fmtNum(row.engagement)}
              </td>
              <td className="px-2 py-2 hidden lg:table-cell">
                {row.topUrl && row.topExcerpt ? (
                  <a
                    href={row.topUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-1 max-w-[40ch] text-text-secondary hover:text-text-primary hover:underline"
                  >
                    {row.topExcerpt}
                  </a>
                ) : row.topExcerpt ? (
                  <span className="line-clamp-1 max-w-[40ch] text-text-secondary">
                    {row.topExcerpt}
                  </span>
                ) : (
                  <span className="text-text-tertiary">—</span>
                )}
                {row.attribution ? (
                  <div className="text-[10px] text-text-tertiary">
                    {row.attribution}
                  </div>
                ) : null}
              </td>
              <td className="px-2 py-2 text-text-tertiary tabular-nums">
                {fmtAge(row.topAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default RepoMentionsTab;
