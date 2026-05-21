import { Tag } from "lucide-react";

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
  if (!iso) return "tracked";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "tracked";
  const ms = Math.max(0, nowMs - ts);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes || 1}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fallbackRows(repo: Repo, nowMs: number): ReleaseRow[] {
  const rows: ReleaseRow[] = [];
  rows.push({
    tag: repo.lastReleaseTag ?? `${repo.name}-latest`,
    notes: repo.lastReleaseTag
      ? "last release seen by trending pipeline"
      : "latest repo state from metadata refresh",
    age: ageLabel(repo.lastReleaseAt ?? repo.lastCommitAt, nowMs),
    variant: "a",
  });
  rows.push({
    tag: "star-velocity",
    notes: `${repo.starsDelta7d.toLocaleString()} stars added over 7d`,
    age: "7d",
    variant: "b",
  });
  rows.push({
    tag: "source-rollup",
    notes: `${repo.channelsFiring ?? 0}/6 channels firing in cross-source score`,
    age: "live",
    variant: "b",
  });
  rows.push({
    tag: "maintainer-pulse",
    notes: `${repo.contributors.toLocaleString()} contributors tracked in repo metadata`,
    age: "30d",
    variant: "a",
  });
  return rows;
}

export function ReleasesCard({ repo, events }: ReleasesCardProps) {
  const nowMs = Date.now();
  const releaseEvents = events.filter((event) => event.type === "ReleaseEvent").slice(0, 4);

  const rows: ReleaseRow[] = releaseEvents.map((event, index) => {
    const release = (event.payload as {
      release?: { tag_name?: string; name?: string; body?: string };
    }).release;
    const tag = release?.tag_name ?? release?.name ?? `release-${index + 1}`;
    const body = (release?.body ?? "").replace(/\s+/g, " ").trim();
    const notes = body.length > 0 ? body.slice(0, 96) : "release";
    return {
      tag,
      notes: notes.length === 96 ? `${notes}...` : notes,
      age: ageLabel(event.createdAt, nowMs),
      variant: index === 0 ? "a" : "b",
    };
  });

  const displayRows = rows.length > 0 ? rows : fallbackRows(repo, nowMs);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Releases</b> · last {displayRows.length}
        </h2>
      </div>
      <div className="related-list">
        {displayRows.map((row, index) => (
          <div
            key={`${row.tag}-${index}`}
            className="related-row"
            style={{ gridTemplateColumns: "28px 1fr 80px" }}
          >
            <div className={`event-mark ${row.variant}`}>
              <Tag size={11} strokeWidth={2} aria-hidden="true" />
            </div>
            <div>
              <div className="related-name">{row.tag}</div>
              <div className="related-desc">{row.notes}</div>
            </div>
            <div
              className="muted"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                textAlign: "right",
              }}
            >
              {row.age}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
