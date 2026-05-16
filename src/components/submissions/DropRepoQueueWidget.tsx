"use client";

import { Clock3, Megaphone, Sparkles } from "lucide-react";

import { RelativeTime } from "@/components/ui/RelativeTime";

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
    <div
      className="min-w-0 flex-1 rounded-card border px-4 py-3"
      style={{
        borderColor: "var(--v4-line-200)",
        background: "var(--v4-bg-025)",
      }}
    >
      <p
        className="text-[11px] font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--v4-ink-300)" }}
      >
        {label}
      </p>
      <p
        className="mt-2 truncate text-2xl font-semibold"
        style={{ color: "var(--v4-ink-100)" }}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Resolve the most recent submission timestamp. Prefer the queue summary
 * (server-authoritative) and fall back to the first item in `submissions`
 * for clients that never received the summary field.
 */
function resolveLatestSubmittedAt(
  queue: DropRepoQueueSummary,
  submissions: DropRepoPublicSubmission[],
): string | null {
  if (queue.latestSubmittedAt) return queue.latestSubmittedAt;
  const head = submissions[0];
  return head?.submittedAt ?? null;
}

export function DropRepoQueueWidget({
  queue,
  submissions,
  loading,
}: DropRepoQueueWidgetProps) {
  const latestSubmittedAt = resolveLatestSubmittedAt(queue, submissions);

  return (
    <>
      <section className="v2-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-text-primary">
          <Sparkles className="h-4 w-4 text-brand" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Queue signals
          </h2>
          {latestSubmittedAt && !loading && (
            <span
              className="ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{
                background: "var(--v4-bg-025)",
                border: "1px solid var(--v4-line-200)",
                color: "var(--v4-ink-300)",
              }}
              title={`Latest submission at ${latestSubmittedAt}`}
            >
              <Clock3 className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">
                Latest{" "}
                <RelativeTime
                  iso={latestSubmittedAt}
                  className="font-mono"
                  title={`Latest submission at ${latestSubmittedAt}`}
                />
              </span>
            </span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1">
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
        <p
          className="mt-4 text-sm leading-6"
          style={{ color: "var(--v4-ink-200)" }}
        >
          Social share can boost priority. It should not be a hard listing
          gate because the primary decision should still be repo quality and
          real trend signal.
        </p>
      </section>

      <section className="v2-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-text-primary">
          <Megaphone className="h-4 w-4 text-brand" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Recent submissions
          </h2>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {submissions.length === 0 && !loading && (
            <p
              className="text-sm"
              style={{ color: "var(--v4-ink-300)" }}
            >
              No queued submissions yet.
            </p>
          )}

          {submissions.slice(0, 6).map((submission) => (
            <div
              key={submission.id}
              className="min-w-0 rounded-card border px-4 py-3"
              style={{
                borderColor: "var(--v4-line-200)",
                background: "var(--v4-bg-025)",
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={submission.repoPath ?? submission.repoUrl}
                  target={submission.repoPath ? undefined : "_blank"}
                  rel={submission.repoPath ? undefined : "noreferrer"}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary transition-colors hover:text-brand"
                  title={submission.fullName}
                >
                  {submission.fullName}
                </a>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className="rounded-full px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em]"
                    style={{
                      background: "var(--v4-bg-050)",
                      color: "var(--v4-ink-300)",
                    }}
                  >
                    {statusLabel(submission.status)}
                  </span>
                  {submission.boostedByShare && (
                    <span className="rounded-full bg-brand/10 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-brand">
                      boosted
                    </span>
                  )}
                </div>
              </div>
              {submission.whyNow && (
                <p
                  className="mt-2 break-words text-sm leading-6"
                  style={{ color: "var(--v4-ink-200)" }}
                >
                  {submission.whyNow}
                </p>
              )}
              {submission.matchesFound > 0 && (
                <p
                  className="mt-2 font-mono text-xs uppercase tracking-[0.12em]"
                  style={{ color: "var(--v4-ink-300)" }}
                >
                  {submission.matchesFound} source matches found
                </p>
              )}
              {submission.lastScanError && (
                <p className="mt-2 break-words text-xs leading-5 text-[var(--v4-red)]">
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
