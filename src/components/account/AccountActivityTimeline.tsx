import type { DropEvent } from "@/lib/drop-events";
import type { PublicIdea } from "@/lib/ideas";
import type { ProfileReactionGiven } from "@/lib/profile";

interface AccountActivityTimelineProps {
  ideas: PublicIdea[];
  recentReactions: ProfileReactionGiven[];
  drops: DropEvent[];
}

const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

const SEEDED_TIMELINE = [
  ["alert", "vercel/ai-sdk release alert opened", "2026-05-20T07:10:00.000Z"],
  ["watch", "Added modelcontextprotocol/servers to watchlist", "2026-05-20T05:30:00.000Z"],
  ["drop", "Submitted openai/codex for review", "2026-05-19T22:05:00.000Z"],
  ["reaction", "Reacted build on Better onboarding analytics", "2026-05-19T16:20:00.000Z"],
  ["api", "Watchlist Reader key used by digest job", "2026-05-18T13:00:00.000Z"],
  ["compare", "Ran compare: next.js vs remix", "2026-05-17T20:45:00.000Z"],
  ["referral", "Referral invite converted to trial", "2026-05-16T11:25:00.000Z"],
  ["settings", "Weekly digest cadence updated", "2026-05-14T09:15:00.000Z"],
] as const;

function isFresh(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return false;
  return now - ts <= FRESH_WINDOW_MS;
}

function formatMetaDate(meta: string | null | undefined): string {
  if (typeof meta !== "string" || meta.length === 0) return "—";
  return meta.slice(0, 10);
}

export function AccountActivityTimeline({
  ideas,
  recentReactions,
  drops,
}: AccountActivityTimelineProps) {
  const now = Date.now();
  const items = [
    ...ideas.slice(0, 4).map((idea) => ({
      id: `idea-${idea.id}`,
      label: "idea",
      title: idea.title,
      meta: idea.publishedAt ?? idea.createdAt,
    })),
    ...recentReactions.slice(0, 4).map((reaction, index) => ({
      id: `reaction-${index}-${reaction.objectId}`,
      label: reaction.reactionType,
      title: `${reaction.objectType}:${reaction.objectId}`,
      meta: reaction.createdAt,
    })),
    ...drops.slice(0, 4).map((drop) => ({
      id: `drop-${drop.id}`,
      label: drop.kind,
      title: drop.fullName,
      meta: drop.at,
    })),
  ].slice(0, 10);
  const rows = items.length
    ? items
    : SEEDED_TIMELINE.map(([label, title, meta], index) => ({
        id: `seed-${index}`,
        label,
        title,
        meta,
      }));

  return (
    <section className="card" aria-labelledby="account-activity-head">
      <div className="card-head">
        <h2 className="card-title" id="account-activity-head">
          <b>Activity timeline</b> &middot; ideas, reactions, drops
        </h2>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 10 }}>
        {rows.map((item) => {
            const fresh = isFresh(item.meta, now);
            return (
              <div
                key={item.id}
                className={`feed-item${fresh ? " is-fresh" : ""}`}
                data-fresh={fresh ? "true" : "false"}
              >
                <b>{item.title}</b>
                <span>
                  {item.label} &middot; {formatMetaDate(item.meta)}
                </span>
              </div>
            );
          })}
      </div>
    </section>
  );
}
