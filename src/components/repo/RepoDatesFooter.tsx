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

/** Renders a machine-readable <time datetime> when the iso is valid, else a
 *  plain span with the fallback text. Gives answer engines structured
 *  temporal data without faking a timestamp we don't have. */
function DateValue({ iso, text }: { iso: string | null | undefined; text: string }) {
  const ts = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ts)) return <span className="val">{text}</span>;
  return (
    <time className="val" dateTime={new Date(ts).toISOString()}>
      {text}
    </time>
  );
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
        <DateValue iso={repo.createdAt} text={formatDate(repo.createdAt)} />
      </div>
      <div className="item">
        <span className="lbl">Updated</span>
        <DateValue iso={updatedIso} text={ageLabel(updatedIso)} />
      </div>
      <div className="item">
        <span className="lbl">Last commit</span>
        <DateValue iso={latestPushIso} text={ageLabel(latestPushIso)} />
      </div>
    </section>
  );
}
