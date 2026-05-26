// RepoDatesFooter — closing card on the /repo/[owner]/[name] page.
//
// Three honest timestamps:
//   - Created      → repo.createdAt    (rendered as a calendar date)
//   - Updated      → repo.updatedAt or createdAt fallback (relative)
//   - Last commit  → freshest PushEvent.createdAt, falling back to
//                    repo.lastCommitAt (relative)
//
// Pure server component, no client state. Returns the section unconditionally
// so the page footer has a consistent end-of-content anchor — but renders
// individual cells with "—" when their source is missing.

import { ageLabel } from "@/lib/format-age";

import type { NormalizedGithubEvent } from "@/lib/github-events";
import type { Repo } from "@/lib/types";

interface RepoDatesFooterProps {
  repo: Repo;
  events?: NormalizedGithubEvent[];
}

/** YYYY-MM-DD in UTC. Returns em-dash for missing / unparseable input. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = d.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function RepoDatesFooter({ repo, events }: RepoDatesFooterProps) {
  const latestPushIso =
    events?.find((e) => e.type === "PushEvent")?.createdAt ??
    repo.lastCommitAt ??
    null;

  // Repo.updatedAt is not on the typed interface — fall back to lastCommitAt
  // when the field is absent so the cell never shows undefined.
  const updatedIso =
    (repo as unknown as { updatedAt?: string | null }).updatedAt ??
    repo.lastCommitAt ??
    null;

  return (
    <section className="pf-card pf-dates">
      <div className="item">
        <span className="lbl">Created</span>
        <span className="val">{formatDate(repo.createdAt)}</span>
      </div>
      <div className="item">
        <span className="lbl">Updated</span>
        <span className="val">{ageLabel(updatedIso)}</span>
      </div>
      <div className="item">
        <span className="lbl">Last commit</span>
        <span className="val">{ageLabel(latestPushIso)}</span>
      </div>
    </section>
  );
}
