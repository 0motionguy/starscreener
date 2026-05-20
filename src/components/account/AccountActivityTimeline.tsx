import type { DropEvent } from "@/lib/drop-events";
import type { PublicIdea } from "@/lib/ideas";
import type { ProfileReactionGiven } from "@/lib/profile";

interface AccountActivityTimelineProps {
  ideas: PublicIdea[];
  recentReactions: ProfileReactionGiven[];
  drops: DropEvent[];
}

const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

function isFresh(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return false;
  return now - ts <= FRESH_WINDOW_MS;
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

  return (
    <section className="card" aria-labelledby="account-activity-head">
      <div className="card-head">
        <h2 className="card-title" id="account-activity-head">
          <b>Activity timeline</b> &middot; ideas, reactions, drops
        </h2>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 10 }}>
        {items.length === 0 ? (
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12 }}>
            No public activity attached to this account yet.
          </p>
        ) : (
          items.map((item) => {
            const fresh = isFresh(item.meta, now);
            return (
              <div
                key={item.id}
                className={`feed-item${fresh ? " is-fresh" : ""}`}
                data-fresh={fresh ? "true" : "false"}
              >
                <b>{item.title}</b>
                <span>
                  {item.label} &middot; {item.meta.slice(0, 10)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
