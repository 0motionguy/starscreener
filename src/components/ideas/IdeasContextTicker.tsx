// IdeasContextTicker — top marquee with last-N idea titles. Reuses the
// global .lane CSS marquee from shell.css. Render items twice so the loop
// is seamless (same trick as FundingTape).

import type { IdeaRecord } from "@/lib/ideas";

interface IdeasContextTickerProps {
  ideas: IdeaRecord[];
  limit?: number;
}

function relAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const STATUS_LABEL: Record<string, string> = {
  pending_moderation: "PENDING",
  published: "LIVE",
  shipped: "SHIPPED",
  archived: "ARCHIVED",
  rejected: "REJECTED",
};

export function IdeasContextTicker({
  ideas,
  limit = 12,
}: IdeasContextTickerProps) {
  if (ideas.length === 0) return null;

  const items = ideas.slice(0, limit).map((i) => ({
    id: i.id,
    title: i.title,
    status: STATUS_LABEL[i.status] ?? i.status.toUpperCase(),
    ago: relAge(i.createdAt),
    repo: i.targetRepos[0] ?? null,
  }));
  const doubled = [...items, ...items];

  return (
    <div className="ideas-tape" aria-label="Recent ideas">
      <div className="lane">
        {doubled.map((it, i) => (
          <span className="it-item" key={`${it.id}-${i}`}>
            <span className="ttl">{it.title}</span>
            {it.repo ? <span className="rp">{it.repo}</span> : null}
            <span className="st">{it.status}</span>
            <span className="ago">{it.ago}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
