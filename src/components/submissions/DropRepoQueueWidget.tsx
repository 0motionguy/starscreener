"use client";

import { Megaphone, Sparkles } from "lucide-react";

export type DropRepoSubmissionStatus =
  | "pending"
  | "queued"
  | "scanning"
  | "ingested"
  | "matched"
  | "listed"
  | "scan_failed";

export interface DropRepoQueueSummary {
  pending: number;
  queued: number;
  scanning: number;
  listed: number;
  failed: number;
  boosted: number;
  latestSubmittedAt: string | null;
}

export interface DropRepoPublicSubmission {
  id: string;
  fullName: string;
  repoUrl: string;
  whyNow: string | null;
  shareUrl: string | null;
  boostedByShare: boolean;
  status: DropRepoSubmissionStatus;
  submittedAt: string;
  intakeTriggeredAt: string | null;
  lastScanAt: string | null;
  lastScanError: string | null;
  matchesFound: number;
  repoPath: string | null;
}

export interface DropRepoQueueWidgetProps {
  queue: DropRepoQueueSummary;
  submissions: DropRepoPublicSubmission[];
  loading: boolean;
}

function statusLabel(status: DropRepoSubmissionStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "queued":
      return "Queued";
    case "scanning":
      return "Scanning";
    case "ingested":
      return "Ingested";
    case "matched":
      return "Matched";
    case "listed":
      return "Listed";
    case "scan_failed":
      return "Failed";
  }
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-card border border-border-primary bg-bg-secondary px-4 py-3">
      <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

export function DropRepoQueueWidget({
  queue,
  submissions,
  loading,
}: DropRepoQueueWidgetProps) {
  return (
    <>
      <section className="v2-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-text-primary">
          <Sparkles className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Queue signals
          </h2>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:flex-col">
          <MetricCard
            label="Active"
            value={loading ? "..." : String(queue.pending)}
          />
          <MetricCard
            label="Scanning"
            value={loading ? "..." : String(queue.scanning)}
          />
          <MetricCard
            label="Listed"
            value={loading ? "..." : String(queue.listed)}
          />
          <MetricCard
            label="Failed"
            value={loading ? "..." : String(queue.failed)}
          />
          <MetricCard
            label="Boosted by share"
            value={loading ? "..." : String(queue.boosted)}
          />
        </div>
        <p className="mt-4 text-sm leading-6 text-text-secondary">
          Social share can boost priority. It should not be a hard listing
          gate because the primary decision should still be repo quality and
          real trend signal.
        </p>
      </section>

      <section className="v2-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-text-primary">
          <Megaphone className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Recent submissions
          </h2>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {submissions.length === 0 && !loading && (
            <p className="text-sm text-text-secondary">
              No queued submissions yet.
            </p>
          )}

          {submissions.slice(0, 6).map((submission) => (
            <div
              key={submission.id}
              className="rounded-card border border-border-primary bg-bg-secondary px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <a
                  href={submission.repoPath ?? submission.repoUrl}
                  target={submission.repoPath ? undefined : "_blank"}
                  rel={submission.repoPath ? undefined : "noreferrer"}
                  className="text-sm font-medium text-text-primary hover:text-brand"
                >
                  {submission.fullName}
                </a>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-bg-card px-2 py-1 text-[11px] font-mono uppercase tracking-[0.12em] text-text-tertiary">
                    {statusLabel(submission.status)}
                  </span>
                  {submission.boostedByShare && (
                    <span className="rounded-full bg-brand/10 px-2 py-1 text-[11px] font-mono uppercase tracking-[0.12em] text-brand">
                      boosted
                    </span>
                  )}
                </div>
              </div>
              {submission.whyNow && (
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {submission.whyNow}
                </p>
              )}
              {submission.matchesFound > 0 && (
                <p className="mt-2 text-xs font-mono uppercase tracking-[0.12em] text-text-tertiary">
                  {submission.matchesFound} source matches found
                </p>
              )}
              {submission.lastScanError && (
                <p className="mt-2 text-xs leading-5 text-[var(--v4-red)]">
                  {submission.lastScanError}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
