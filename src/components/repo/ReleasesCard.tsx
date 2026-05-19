// ReleasesCard — last 4 release events. Pulled from the github-events feed
// filtered to ReleaseEvent. Falls back to a single-row stub built from
// Repo.lastReleaseTag when github-events is empty.

import type { NormalizedGithubEvent } from "@/lib/github-events";
import type { Repo } from "@/lib/types";

interface ReleasesCardProps {
  repo: Repo;
  events: NormalizedGithubEvent[];
}

interface ReleaseRow {
  tag: string;
  notes: string;
  age: string;
  variant: "a" | "b";
}

function ageLabel(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const ms = Math.max(0, nowMs - ts);
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m || 1}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function ReleasesCard({ repo, events }: ReleasesCardProps) {
  const nowMs = Date.now();
  const releaseEvents = events.filter((e) => e.type === "ReleaseEvent").slice(0, 4);

  const rows: ReleaseRow[] = releaseEvents.map((e, i) => {
    const release = (e.payload as {
      release?: { tag_name?: string; name?: string; body?: string };
    }).release;
    const tag = release?.tag_name ?? release?.name ?? `release-${i + 1}`;
    const body = (release?.body ?? "").replace(/\s+/g, " ").trim();
    const notes = body.length > 0 ? body.slice(0, 96) : "release";
    return {
      tag,
      notes: notes.length === 96 ? `${notes}…` : notes,
      age: ageLabel(e.createdAt, nowMs),
      variant: i === 0 ? "a" : "b",
    };
  });

  if (rows.length === 0 && repo.lastReleaseTag) {
    rows.push({
      tag: repo.lastReleaseTag,
      notes: "last release seen by trending pipeline",
      age: ageLabel(repo.lastReleaseAt, nowMs),
      variant: "a",
    });
  }

  if (rows.length === 0) {
    return (
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">
            ▌ <b>Releases</b>
          </h2>
        </div>
        <div
          style={{
            padding: "16px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-faint)",
          }}
        >
          No releases captured yet.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Releases</b> · last {rows.length}
        </h2>
      </div>
      <div className="related-list">
        {rows.map((r, idx) => (
          <div
            key={`${r.tag}-${idx}`}
            className="related-row"
            style={{ gridTemplateColumns: "28px 1fr 80px" }}
          >
            <div className={`event-mark ${r.variant}`}>▲</div>
            <div>
              <div className="related-name">{r.tag}</div>
              <div className="related-desc">{r.notes}</div>
            </div>
            <div
              className="muted"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                textAlign: "right",
              }}
            >
              {r.age}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
