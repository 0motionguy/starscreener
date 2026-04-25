// Secondary tab on every per-source news page: top trending posts /
// stories on this source, regardless of whether they link to a tracked
// repo. The page passes already-normalized NewsItem rows so this
// component is source-agnostic.

import Link from "next/link";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  /** Author / subreddit / handle. */
  attribution?: string | null;
  /** Source-specific score (likes, score, votes, reactions). */
  score?: number;
  scoreLabel?: string;
  /** Comment count where applicable. */
  comments?: number;
  postedAt?: string | null;
  /** If the post links to a tracked repo, surface a clickable pill. */
  linkedRepo?: string | null;
  /** Tag / topic family. */
  tag?: string | null;
}

interface NewsTabProps {
  items: NewsItem[];
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

export function NewsTab({ items, sourceLabel }: NewsTabProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/40 px-4 py-8 text-center">
        <p className="text-sm text-text-tertiary">
          No trending posts on {sourceLabel} right now.
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
            <th className="px-2 py-2 font-mono uppercase tracking-wider">Title</th>
            <th className="px-2 py-2 font-mono uppercase tracking-wider w-24 hidden md:table-cell">
              {items[0]?.scoreLabel ?? "Score"}
            </th>
            <th className="px-2 py-2 font-mono uppercase tracking-wider w-16 hidden md:table-cell">
              Comments
            </th>
            <th className="px-2 py-2 font-mono uppercase tracking-wider w-16">Age</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={item.id}
              className="border-b border-border-primary/40 last:border-b-0 hover:bg-bg-muted/30"
            >
              <td className="px-2 py-2 text-text-tertiary tabular-nums">
                {idx + 1}
              </td>
              <td className="px-2 py-2">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="line-clamp-2 text-text-primary hover:underline"
                >
                  {item.title}
                </a>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-text-tertiary">
                  {item.attribution ? <span>{item.attribution}</span> : null}
                  {item.tag ? (
                    <span className="rounded-full border border-border-primary bg-bg-muted px-1.5 py-0.5">
                      {item.tag}
                    </span>
                  ) : null}
                  {item.linkedRepo ? (
                    <Link
                      href={`/repo/${item.linkedRepo}`}
                      className="rounded-full border border-brand/60 bg-brand/10 px-1.5 py-0.5 text-text-primary hover:bg-brand/20"
                    >
                      → {item.linkedRepo}
                    </Link>
                  ) : null}
                </div>
              </td>
              <td className="px-2 py-2 tabular-nums text-text-secondary hidden md:table-cell">
                {fmtNum(item.score)}
              </td>
              <td className="px-2 py-2 tabular-nums text-text-tertiary hidden md:table-cell">
                {fmtNum(item.comments)}
              </td>
              <td className="px-2 py-2 text-text-tertiary tabular-nums">
                {fmtAge(item.postedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default NewsTab;
