"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  LoaderCircle,
  Megaphone,
  Send,
  Sparkles,
} from "lucide-react";

import { ROUTES } from "@/lib/constants";

interface QueueSummary {
  pending: number;
  queued: number;
  scanning: number;
  listed: number;
  failed: number;
  boosted: number;
  latestSubmittedAt: string | null;
}

type SubmissionStatus =
  | "pending"
  | "queued"
  | "scanning"
  | "ingested"
  | "matched"
  | "listed"
  | "scan_failed";

interface PublicRepoSubmission {
  id: string;
  fullName: string;
  repoUrl: string;
  whyNow: string | null;
  shareUrl: string | null;
  boostedByShare: boolean;
  status: SubmissionStatus;
  submittedAt: string;
  intakeTriggeredAt: string | null;
  lastScanAt: string | null;
  lastScanError: string | null;
  matchesFound: number;
  repoPath: string | null;
}

interface SubmissionResult {
  kind: "created" | "duplicate" | "already_tracked";
  queue: QueueSummary;
  submission?: PublicRepoSubmission;
  repo?: {
    fullName: string;
    repoPath: string;
  };
}

interface RepoSubmissionsListResponse {
  ok: true;
  queue: QueueSummary;
  submissions: PublicRepoSubmission[];
}

interface RepoSubmissionsCreateResponse {
  ok: true;
  result: SubmissionResult;
  intakeTriggered: boolean;
}

interface RepoSubmissionsErrorResponse {
  ok: false;
  error: string;
}

const EMPTY_QUEUE: QueueSummary = {
  pending: 0,
  queued: 0,
  scanning: 0,
  listed: 0,
  failed: 0,
  boosted: 0,
  latestSubmittedAt: null,
};

const ACTIVE_STATUSES = new Set<SubmissionStatus>([
  "pending",
  "queued",
  "scanning",
  "ingested",
  "matched",
]);

function statusLabel(status: SubmissionStatus): string {
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

export function DropRepoPage() {
  const [repo, setRepo] = useState("");
  const [whyNow, setWhyNow] = useState("");
  const [contact, setContact] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [queue, setQueue] = useState<QueueSummary>(EMPTY_QUEUE);
  const [submissions, setSubmissions] = useState<PublicRepoSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  async function loadQueue(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch("/api/repo-submissions", { cache: "no-store" });
      const data = (await res.json()) as
        | RepoSubmissionsListResponse
        | RepoSubmissionsErrorResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.ok ? `status ${res.status}` : data.error);
      }
      setError(null);
      setQueue(data.queue);
      setSubmissions(data.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  useEffect(() => {
    if (!submissions.some((submission) => ACTIVE_STATUSES.has(submission.status))) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadQueue();
    }, 3500);
    return () => window.clearInterval(timer);
  }, [submissions]);

  const queueLabel = useMemo(() => {
    if (loading) return "Loading queue";
    return `${queue.pending} pending`;
  }, [loading, queue.pending]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/repo-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo,
          whyNow,
          contact,
          shareUrl,
        }),
      });
      const data = (await res.json()) as
        | RepoSubmissionsCreateResponse
        | RepoSubmissionsErrorResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.ok ? `status ${res.status}` : data.error);
      }

      setResult(data.result);
      setQueue(data.result.queue);
      await loadQueue();

      if (data.result.kind === "created") {
        setRepo("");
        setWhyNow("");
        setContact("");
        setShareUrl("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="v2-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-border-primary bg-bg-secondary px-3 py-1 text-[11px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
              <Send className="h-3.5 w-3.5" />
              Drop your repo
            </span>
            <span className="text-sm font-mono text-text-tertiary">
              {queueLabel}
            </span>
          </div>

          <h1 className="mt-4 font-display text-3xl font-bold text-text-primary sm:text-4xl">
            Submit a repo to the trend queue
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
            Anyone can submit. We dedupe against tracked repos, keep a pending
            queue, and review boosted submissions first when they include a real
            X share link.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-up/30 bg-up/5 px-4 py-3 text-sm">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-up">
              Founders
            </span>
            <span className="text-text-secondary">
              Making money on this repo? Add a verified revenue signal to your
              repo page.
            </span>
            <Link
              href="/submit/revenue"
              className="ml-auto inline-flex items-center gap-1 font-mono text-xs font-semibold text-text-primary hover:underline"
            >
              Claim or submit revenue
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-text-primary">
                GitHub repo
              </span>
              <input
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
                placeholder="openai/openai-agents-python or https://github.com/openai/openai-agents-python"
                className="h-11 rounded-card border border-border-primary bg-bg-secondary px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand/50"
                autoComplete="off"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-text-primary">
                Why now
              </span>
              <textarea
                value={whyNow}
                onChange={(event) => setWhyNow(event.target.value)}
                placeholder="Short reason this repo should be reviewed now."
                rows={5}
                className="min-h-32 rounded-card border border-border-primary bg-bg-secondary px-3 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand/50"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-text-primary">
                  Contact
                </span>
                <input
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  placeholder="Email or X handle"
                  className="h-11 rounded-card border border-border-primary bg-bg-secondary px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand/50"
                  autoComplete="off"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-text-primary">
                  X share link
                </span>
                <input
                  value={shareUrl}
                  onChange={(event) => setShareUrl(event.target.value)}
                  placeholder="https://x.com/.../status/..."
                  className="h-11 rounded-card border border-border-primary bg-bg-secondary px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand/50"
                  autoComplete="off"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="v2-btn v2-btn-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Submit repo
              </button>

              <Link
                href={ROUTES.HOME}
                className="inline-flex h-11 items-center gap-2 rounded-card border border-border-primary bg-bg-secondary px-4 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
              >
                Back to trending
              </Link>
            </div>
          </form>

          {error && (
            <div className="mt-4 rounded-card border border-down/40 bg-down/10 px-4 py-3 text-sm text-text-primary">
              {error}
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-card border border-border-primary bg-bg-secondary px-4 py-4">
              {result.kind === "created" && result.submission && (
                <div className="grid gap-2">
                  <p className="text-sm font-medium text-text-primary">
                    Added to queue: {result.submission.fullName}
                  </p>
                  <p className="text-sm text-text-secondary">
                    Intake is triggered automatically in dev/admin mode. Queue
                    now has {result.queue.pending} active submissions.
                  </p>
                </div>
              )}

              {result.kind === "duplicate" && result.submission && (
                <div className="grid gap-2">
                  <p className="text-sm font-medium text-text-primary">
                    Already in queue: {result.submission.fullName}
                  </p>
                  <p className="text-sm text-text-secondary">
                    We already have this repo queued for review.
                  </p>
                </div>
              )}

              {result.kind === "already_tracked" && result.repo && (
                <div className="grid gap-2">
                  <p className="text-sm font-medium text-text-primary">
                    Already tracked: {result.repo.fullName}
                  </p>
                  <Link
                    href={result.repo.repoPath}
                    className="inline-flex items-center gap-1 text-sm text-brand hover:text-brand-hover"
                  >
                    Open repo page
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="grid gap-6">
          <section className="v2-card p-5 sm:p-6">
            <div className="flex items-center gap-2 text-text-primary">
              <Sparkles className="h-4 w-4 text-brand" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-secondary">
                Queue signals
              </h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
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

            <div className="mt-4 grid gap-3">
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
                    <p className="mt-2 text-xs leading-5 text-down">
                      {submission.lastScanError}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
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
