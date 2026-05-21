import type { DropEvent } from "@/lib/drop-events";

interface AccountDropsQueueProps {
  drops: DropEvent[];
}

type DropRow = Pick<DropEvent, "id" | "fullName" | "kind" | "at"> & {
  status?: "queued" | "scanning" | "promoted" | "needs-review";
};

const SEEDED_DROPS: DropRow[] = [
  {
    id: "seed-drop-1",
    fullName: "openai/codex",
    kind: "created",
    at: "2026-05-20T06:30:00.000Z",
    status: "scanning",
  },
  {
    id: "seed-drop-2",
    fullName: "modelcontextprotocol/servers",
    kind: "already_tracked",
    at: "2026-05-19T18:10:00.000Z",
    status: "promoted",
  },
  {
    id: "seed-drop-3",
    fullName: "vercel/ai-sdk",
    kind: "duplicate",
    at: "2026-05-18T15:40:00.000Z",
    status: "needs-review",
  },
  {
    id: "seed-drop-4",
    fullName: "cline/cline",
    kind: "created",
    at: "2026-05-17T09:12:00.000Z",
    status: "queued",
  },
];

export function AccountDropsQueue({ drops }: AccountDropsQueueProps) {
  const rows: DropRow[] = drops.length ? drops : SEEDED_DROPS;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Drops queue</b> · recent submissions
        </h2>
        <span className="grow" />
        <span className="tag">{rows.length.toLocaleString()} / 7d</span>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 8 }}>
        {rows.slice(0, 12).map((drop) => {
          const at = typeof drop.at === "string" && drop.at.length >= 10 ? drop.at.slice(0, 10) : "—";
          return (
            <div key={drop.id} className="feed-item">
              <b style={{ fontFamily: "var(--font-mono)" }}>{drop.fullName}</b>
              <span>
                {drop.kind} &middot; {drop.status ?? "queued"} &middot; {at}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
