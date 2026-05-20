import Link from "next/link";

import type { PublicRepoSubmission } from "@/lib/repo-submissions";

interface DropYourQueueProps {
  signedIn: boolean;
  submissions: PublicRepoSubmission[];
  totalCount: number;
  liveCount: number;
}

interface QueueRow {
  id: string;
  fullName: string;
  status: string;
  submittedAt: string;
  detail: string;
}

const SEEDED_ROWS: QueueRow[] = [
  {
    id: "seed-1",
    fullName: "openai/codex",
    status: "scanning",
    submittedAt: new Date(Date.now() - 18 * 60_000).toISOString(),
    detail: "metadata fetched",
  },
  {
    id: "seed-2",
    fullName: "modelcontextprotocol/servers",
    status: "ingested",
    submittedAt: new Date(Date.now() - 42 * 60_000).toISOString(),
    detail: "source marks attached",
  },
  {
    id: "seed-3",
    fullName: "browserbase/stagehand",
    status: "queued",
    submittedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    detail: "review queue",
  },
  {
    id: "seed-4",
    fullName: "anthropics/claude-code-action",
    status: "listed",
    submittedAt: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
    detail: "listed after review",
  },
];

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  listed: { label: "LIVE", cls: "live" },
  matched: { label: "LIVE", cls: "live" },
  ingested: { label: "REVIEW", cls: "review" },
  scanning: { label: "SCAN", cls: "review" },
  queued: { label: "QUEUED", cls: "queued" },
  pending: { label: "PENDING", cls: "queued" },
  scan_failed: { label: "FAILED", cls: "queued" },
};

function shortRelativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "-";
  const diffMs = Date.now() - t;
  const diffMin = Math.max(1, Math.floor(diffMs / 60_000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function statusChip(status: string): { label: string; cls: string } {
  return STATUS_CHIP[status] ?? { label: "DRAFT", cls: "review" };
}

function toQueueRow(s: PublicRepoSubmission): QueueRow {
  return {
    id: s.id,
    fullName: s.fullName,
    status: s.status,
    submittedAt: s.submittedAt,
    detail: s.repoPath ? s.status : "review queue",
  };
}

export function DropYourQueue({
  signedIn,
  submissions,
  totalCount,
  liveCount,
}: DropYourQueueProps) {
  const rows =
    submissions.length > 0 ? submissions.slice(0, 4).map(toQueueRow) : SEEDED_ROWS;
  const listedRate = totalCount > 0 ? Math.round((liveCount / totalCount) * 100) : 0;

  return (
    <div
      className="card"
      data-component="drop-queue"
      data-state={signedIn ? "signed-in" : "sample"}
    >
      <div className="card-head">
        <h2 className="card-title">
          | <b>Your queue</b> - {rows.length} active drops
        </h2>
      </div>
      {rows.map((row) => {
        const seed = row.fullName.replace("/", "").slice(0, 2).toUpperCase() || ".";
        const chip = statusChip(row.status);
        return (
          <div className="queue-row" key={row.id}>
            <div
              className="repo-avatar"
              style={{
                background: "var(--surface-3)",
                color: "var(--accent)",
                width: 28,
                height: 28,
                fontSize: 10,
              }}
            >
              {seed}
            </div>
            <div>
              <div className="q-name">{row.fullName}</div>
              <div className="muted mono" style={{ fontSize: 10.5 }}>
                {shortRelativeTime(row.submittedAt)} - {row.detail}
              </div>
            </div>
            <div className={`q-status ${chip.cls}`}>{chip.label}</div>
          </div>
        );
      })}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--border-subtle)",
          fontSize: 11,
          color: "var(--fg-faint)",
        }}
      >
        {signedIn ? (
          <>
            Listed rate: <b className="up-text">{listedRate}%</b> ({totalCount} drops,{" "}
            {liveCount} live)
          </>
        ) : (
          <>
            <Link href="/sign-in?redirectUrl=/drop" className="accent-text">
              Sign in
            </Link>{" "}
            to attach this draft to your queue.
          </>
        )}
      </div>
    </div>
  );
}
