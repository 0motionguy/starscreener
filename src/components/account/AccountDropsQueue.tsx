import type { DropEvent } from "@/lib/drop-events";

interface AccountDropsQueueProps {
  drops: DropEvent[];
}

export function AccountDropsQueue({ drops }: AccountDropsQueueProps) {
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Drops queue</b> · recent submissions
        </h2>
        <span className="grow" />
        <span className="tag">{drops.length.toLocaleString()} / 7d</span>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 8 }}>
        {drops.length === 0 ? (
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12 }}>
            No drop events recorded in the last seven days.
          </p>
        ) : (
          drops.slice(0, 12).map((drop) => (
            <div
              key={drop.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--fg)",
              }}
            >
              <span>{drop.fullName}</span>
              <span style={{ color: "var(--fg-faint)" }}>
                {drop.kind} · {drop.at.slice(0, 10)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
