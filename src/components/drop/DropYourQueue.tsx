// DropYourQueue — sidebar card listing the operator's recent submissions.
// Anonymous users see a sign-in CTA. The submissions list is sourced
// from listRepoSubmissions() (admin-wide today; per-user filtering is
// a future enhancement since DropEvent has no userId field).

import Link from "next/link";

import type { PublicRepoSubmission } from "@/lib/repo-submissions";

interface DropYourQueueProps {
  signedIn: boolean;
  submissions: PublicRepoSubmission[];
  totalCount: number;
  liveCount: number;
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  listed: { label: "● LIVE", cls: "live" },
  matched: { label: "● LIVE", cls: "live" },
  ingested: { label: "◐ REVIEW", cls: "review" },
  scanning: { label: "◐ SCAN", cls: "review" },
  queued: { label: "◐ Q'D", cls: "queued" },
  pending: { label: "◐ PENDING", cls: "queued" },
  scan_failed: { label: "✕ FAILED", cls: "queued" },
};

function avatarBg(seed: string): { background: string; color: string } {
  // Deterministic 5-tone palette so the same submission always paints
  // the same colour and the side panel feels stable across renders.
  const palette = [
    { background: "#ff6b35", color: "#1a0e08" },
    { background: "#0a4d4a", color: "#3ad6c5" },
    { background: "#16093a", color: "#a78bfa" },
    { background: "#212529", color: "#fff" },
    { background: "#3b0a0a", color: "#fca5a5" },
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function shortRelativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffD = Math.floor(diffHr / 24);
  return `${diffD}d ago`;
}

function statusChip(status: string): { label: string; cls: string } {
  return STATUS_CHIP[status] ?? { label: "◐ DRAFT", cls: "review" };
}

export function DropYourQueue({
  signedIn,
  submissions,
  totalCount,
  liveCount,
}: DropYourQueueProps) {
  if (!signedIn) {
    return (
      <div className="card" data-component="drop-queue" data-state="signed-out">
        <div className="card-head">
          <h2 className="card-title">
            ▌ <b>Your queue</b>
          </h2>
        </div>
        <div style={{ padding: 16, fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.55 }}>
          <p style={{ margin: "0 0 12px" }}>
            Sign in to see your submissions, track their review status, and unlock
            higher rate limits.
          </p>
          <Link className="btn primary" href="/sign-in?redirectUrl=/drop">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const promoteRate =
    totalCount > 0 ? Math.round((liveCount / totalCount) * 100) : 0;
  const rows = submissions.slice(0, 6);

  return (
    <div className="card" data-component="drop-queue" data-state="signed-in">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Your queue</b> · {totalCount} total · {liveCount} live
        </h2>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 14, fontSize: 12, color: "var(--fg-faint)" }}>
          No submissions yet. Paste a URL above to get started.
        </div>
      ) : (
        rows.map((s) => {
          const seed = s.fullName.replace("/", "").slice(0, 2).toUpperCase() || "·";
          const avatar = avatarBg(s.fullName);
          const chip = statusChip(s.status);
          return (
            <div className="queue-row" key={s.id}>
              <div
                className="repo-avatar"
                style={{
                  ...avatar,
                  width: 28,
                  height: 28,
                  fontSize: 10,
                }}
              >
                {seed}
              </div>
              <div>
                <div className="q-name">{s.fullName}</div>
                <div className="muted mono" style={{ fontSize: 10.5 }}>
                  {shortRelativeTime(s.submittedAt)}
                  {s.repoPath ? ` · ${s.status}` : null}
                </div>
              </div>
              <div className={`q-status ${chip.cls}`}>{chip.label}</div>
            </div>
          );
        })
      )}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--border-subtle)",
          fontSize: 11,
          color: "var(--fg-faint)",
        }}
      >
        Promote rate: <b className="up-text">{promoteRate}%</b> ({totalCount}{" "}
        drops, {liveCount} live)
      </div>
    </div>
  );
}
