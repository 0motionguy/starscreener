import { SectionEyebrow } from "./ToolCard";

interface ActivityRow {
  repo: string;
  ago: string;
  label?: string;
  hover?: string;
}

interface ActivityGroup {
  eyebrow: string;
  rows: ActivityRow[];
  /** Total events in the 7-day window for this group's header meta. */
  count: number;
}

export interface ToolsActivityStripProps {
  /** Newly-published ideas in the last 7 days. */
  ideasPublished: ActivityRow[];
  ideasPublishedCount: number;
  /** Revenue overlays added/refreshed in the last 7 days. */
  overlaysAdded: ActivityRow[];
  overlaysAddedCount: number;
  /** Revenue submissions approved in the last 7 days. */
  submissionsApproved: ActivityRow[];
  submissionsApprovedCount: number;
}

export function ToolsActivityStrip({
  ideasPublished,
  ideasPublishedCount,
  overlaysAdded,
  overlaysAddedCount,
  submissionsApproved,
  submissionsApprovedCount,
}: ToolsActivityStripProps) {
  const groups: ActivityGroup[] = [
    {
      eyebrow: "Ideas - published",
      rows: ideasPublished,
      count: ideasPublishedCount,
    },
    {
      eyebrow: "Overlays - added",
      rows: overlaysAdded,
      count: overlaysAddedCount,
    },
    {
      eyebrow: "Submissions - approved",
      rows: submissionsApproved,
      count: submissionsApprovedCount,
    },
  ];

  const totalEvents =
    ideasPublishedCount + overlaysAddedCount + submissionsApprovedCount;

  return (
    <section>
      <SectionEyebrow
        num="04"
        title="Recent activity - 7 days"
        meta={<>Last 7d - <b>{totalEvents}</b> events</>}
      />
      <div className="activity fade-up">
        {groups.map((group) => (
          <div className="act-card" key={group.eyebrow}>
            <div className="ac-eyebrow">| {group.eyebrow}</div>
            <div className="ac-list">
              {group.rows.length === 0 ? (
                <div
                  className="ac-row"
                  style={{ color: "var(--fg-faint)", fontStyle: "italic" }}
                >
                  <span>No activity in the last 7 days.</span>
                </div>
              ) : (
                group.rows.map((row, index) => (
                  <div
                    className="ac-row"
                    key={`${group.eyebrow}-${row.repo}-${index}`}
                  >
                    <span
                      className="repo"
                      {...(row.hover
                        ? { "data-repo-hover": true, "data-repo": row.hover }
                        : {})}
                    >
                      {row.repo}
                    </span>
                    {row.label ? <span className="lbl">{row.label}</span> : null}
                    <span className="ago">{row.ago}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
