import type { DropEvent } from "@/lib/drop-events";
import type { PublicIdea } from "@/lib/ideas";
import type { ProfileReactionGiven } from "@/lib/profile";

interface AccountActivityTimelineProps {
  ideas: PublicIdea[];
  recentReactions: ProfileReactionGiven[];
  drops: DropEvent[];
}

export function AccountActivityTimeline({
  ideas,
  recentReactions,
  drops,
}: AccountActivityTimelineProps) {
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
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Activity timeline</b> · ideas, reactions, drops
        </h2>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 10 }}>
        {items.length === 0 ? (
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12 }}>
            No public activity attached to this account yet.
          </p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="feed-item">
              <b>{item.title}</b>
              <span>
                {item.label} · {item.meta.slice(0, 10)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
