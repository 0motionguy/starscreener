"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, LoaderCircle, Send } from "lucide-react";

import { ROUTES } from "@/lib/routes";
import { captureFunnelStep } from "@/lib/analytics/funnel";
import { TransientHttpError } from "@/lib/errors";
import { DropRepoStepStrip } from "./DropRepoStepStrip";
import {
  DropRepoCategoryPicker,
  type DropRepoCategory,
} from "./DropRepoCategoryPicker";
import { DropRepoTagChips, type DropRepoTag } from "./DropRepoTagChips";
import { DropRepoSubmissionFunnel } from "./DropRepoSubmissionFunnel";
import {
  DropRepoQueueWidget,
  type DropRepoPublicSubmission,
  type DropRepoQueueSummary,
  type DropRepoSubmissionStatus,
} from "./DropRepoQueueWidget";

const WHY_NOW_MAX_CHARS = 280;

type QueueSummary = DropRepoQueueSummary;
type SubmissionStatus = DropRepoSubmissionStatus;
type PublicRepoSubmission = DropRepoPublicSubmission;

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

export function DropRepoPage() {
  const [repo, setRepo] = useState("");
  const [whyNow, setWhyNow] = useState("");
  const [contact, setContact] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  // A7 mockup fields — category/tags/releaseUrl/demoUrl are sent in the
  // POST body below and persisted by /api/repo-submissions via the
  // RepoSubmissionInput contract in src/lib/repo-submissions.ts.
  const [category, setCategory] = useState<DropRepoCategory | null>(null);
  const [tags, setTags] = useState<Set<DropRepoTag>>(new Set());
  const [releaseUrl, setReleaseUrl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [queue, setQueue] = useState<QueueSummary>(EMPTY_QUEUE);
  const [submissions, setSubmissions] = useState<PublicRepoSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  // AGN-848 — funnel step "submit_fill" fires only the first time the
  // operator types into the repo input on this mount. Without the latch
  // every keystroke would inflate the metric.
  const [fillFired, setFillFired] = useState(false);

  async function loadQueue(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch("/api/repo-submissions", { cache: "no-store" });
      const data = (await res.json()) as
        | RepoSubmissionsListResponse
        | RepoSubmissionsErrorResponse;
      if (!res.ok || !data.ok) {
        throw new TransientHttpError(data.ok ? `status ${res.status}` : data.error, res.status);
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
    // AGN-848 — funnel step "submit_open". Once on mount.
    captureFunnelStep({ step: "submit_open", flow: "submit-repo" });
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

    // AGN-848 — funnel step "submit_validated". Fires once per submit
    // attempt, distinguishing form-fill from form-send. Flat props let
    // the dashboard split on category presence + share URL completeness.
    captureFunnelStep({
      step: "submit_validated",
      flow: "submit-repo",
      hasCategory: category !== null,
      hasShareUrl: shareUrl.trim().length > 0,
    });

    try {
      const res = await fetch("/api/repo-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo,
          whyNow,
          contact,
          shareUrl,
          category,
          tags: Array.from(tags),
          releaseUrl,
          demoUrl,
        }),
      });
      const data = (await res.json()) as
        | RepoSubmissionsCreateResponse
        | RepoSubmissionsErrorResponse;
      if (!res.ok || !data.ok) {
        throw new TransientHttpError(data.ok ? `status ${res.status}` : data.error, res.status);
      }

      setResult(data.result);
      setQueue(data.result.queue);
      await loadQueue();

      // AGN-848 — funnel step "submit_success". Tag with `kind` so the
      // dashboard can split created vs duplicate vs already_tracked
      // without requiring per-call event names.
      captureFunnelStep({
        step: "submit_success",
        flow: "submit-repo",
        kind: data.result.kind,
      });

      if (data.result.kind === "created") {
        setRepo("");
        setWhyNow("");
        setContact("");
        setShareUrl("");
        setCategory(null);
        setTags(new Set());
        setReleaseUrl("");
        setDemoUrl("");
        // Allow `submit_fill` to fire again on the cleared form.
        setFillFired(false);
      }
    } catch (err) {
      const reason = (err instanceof Error ? err.message : String(err)).slice(
        0,
        80,
      );
      // AGN-848 — funnel step "submit_error". Tag with truncated reason
      // so the dashboard can group failures without leaking long stacks.
      captureFunnelStep({
        step: "submit_error",
        flow: "submit-repo",
        reason,
      });
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <section className="v2-card min-w-0 p-5 sm:p-6 lg:flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em]"
              style={{
                borderColor: "var(--v4-line-200)",
                background: "var(--v4-bg-025)",
                color: "var(--v4-ink-300)",
              }}
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              Drop your repo
            </span>
            <span className="font-mono text-sm text-text-tertiary">
              {queueLabel}
            </span>
          </div>

          <h1 className="mt-4 font-display text-3xl font-bold leading-tight text-text-primary sm:text-4xl">
            Drop a repo. Get it ranked.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
            Anyone can submit. We dedupe against tracked repos, keep a pending
            queue, and review boosted submissions first when they include a real
            X share link.
          </p>

          <DropRepoStepStrip />

          <div className="mt-5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-up/30 bg-up/5 px-4 py-3 text-sm">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--v4-money)]">
              Founders
            </span>
            <span className="min-w-0 flex-1 break-words text-text-secondary">
              Making money on this repo? Add a verified revenue signal to your
              repo page.
            </span>
            <Link
              href="/submit/revenue"
              className="inline-flex shrink-0 items-center gap-1 font-mono text-xs font-semibold text-text-primary hover:underline sm:ml-auto"
            >
              Claim or submit revenue
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-primary">
                GitHub repo
              </span>
              <input
                value={repo}
                onChange={(event) => {
                  const next = event.target.value;
                  setRepo(next);
                  // AGN-848 — funnel step "submit_fill" once per mount.
                  if (!fillFired && next.trim().length > 0) {
                    setFillFired(true);
                    captureFunnelStep({
                      step: "submit_fill",
                      flow: "submit-repo",
                    });
                  }
                }}
                placeholder="openai/openai-agents-python or https://github.com/openai/openai-agents-python"
                className="h-11 rounded-card border border-border-primary bg-bg-secondary px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand/50"
                autoComplete="off"
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-primary">
                Category
              </span>
              <DropRepoCategoryPicker
                value={category}
                onChange={setCategory}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="flex items-center justify-between text-sm font-medium text-text-primary">
                <span>Tags</span>
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums"
                  style={{
                    color:
                      tags.size >= 4
                        ? "var(--v4-amber)"
                        : "var(--v4-ink-400)",
                  }}
                >
                  {tags.size} / 4 max
                </span>
              </span>
              <DropRepoTagChips value={tags} onChange={setTags} />
            </div>

            <label className="flex flex-col gap-2">
              <span className="flex items-center justify-between text-sm font-medium text-text-primary">
                <span>Why now</span>
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums"
                  style={{
                    color:
                      whyNow.length > WHY_NOW_MAX_CHARS
                        ? "var(--v4-red)"
                        : whyNow.length > WHY_NOW_MAX_CHARS * 0.85
                          ? "var(--v4-amber)"
                          : "var(--v4-ink-400)",
                  }}
                >
                  {whyNow.length} / {WHY_NOW_MAX_CHARS}
                </span>
              </span>
              <textarea
                value={whyNow}
                onChange={(event) =>
                  setWhyNow(event.target.value.slice(0, WHY_NOW_MAX_CHARS))
                }
                placeholder="Short reason this repo should be reviewed now."
                rows={5}
                maxLength={WHY_NOW_MAX_CHARS}
                className="min-h-32 rounded-card border border-border-primary bg-bg-secondary px-3 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand/50"
              />
            </label>

            <div className="flex flex-col gap-4 md:flex-row">
              <label className="flex flex-1 flex-col gap-2">
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

              <label className="flex flex-1 flex-col gap-2">
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

            <div className="flex flex-col gap-4 md:flex-row">
              <label className="flex flex-1 flex-col gap-2">
                <span className="text-sm font-medium text-text-primary">
                  Release / launch URL{" "}
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.12em]"
                    style={{ color: "var(--v4-ink-400)" }}
                  >
                    optional
                  </span>
                </span>
                <input
                  value={releaseUrl}
                  onChange={(event) => setReleaseUrl(event.target.value)}
                  placeholder="https://github.com/.../releases/tag/v1.0.0"
                  className="h-11 rounded-card border border-border-primary bg-bg-secondary px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand/50"
                  autoComplete="off"
                />
              </label>

              <label className="flex flex-1 flex-col gap-2">
                <span className="text-sm font-medium text-text-primary">
                  Demo / video URL{" "}
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.12em]"
                    style={{ color: "var(--v4-ink-400)" }}
                  >
                    optional
                  </span>
                </span>
                <input
                  value={demoUrl}
                  onChange={(event) => setDemoUrl(event.target.value)}
                  placeholder="https://youtu.be/... or https://demo.example.com"
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
                <div className="flex flex-col gap-2">
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
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-text-primary">
                    Already in queue: {result.submission.fullName}
                  </p>
                  <p className="text-sm text-text-secondary">
                    We already have this repo queued for review.
                  </p>
                </div>
              )}

              {result.kind === "already_tracked" && result.repo && (
                <div className="flex flex-col gap-2">
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

        <aside className="flex min-w-0 flex-col gap-6 lg:w-[360px] lg:max-w-[38%] lg:shrink-0">
          <DropRepoSubmissionFunnel queue={queue} loading={loading} />

          <DropRepoQueueWidget
            queue={queue}
            submissions={submissions}
            loading={loading}
          />
        </aside>
      </div>
    </div>
  );
}
