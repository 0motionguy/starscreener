"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon, SourceLogo } from "@/lib/icons";
import type {
  PublicRepoSubmission,
  RepoSubmissionStats,
  ScanChannelVerdict,
} from "@/lib/repo-submissions-types";

import styles from "./page.module.css";

interface DropClientProps {
  initialSubmissions: PublicRepoSubmission[];
  initialStats: RepoSubmissionStats;
  initialTotalCount: number;
}

interface FormState {
  status: "idle" | "submitting" | "success" | "duplicate" | "tracked" | "error";
  message: string | null;
  trackedPath: string | null;
}

const MAX_VISIBLE = 5;
const POLL_INTERVAL_MS = 4000;
const REFRESH_INTERVAL_MS = 15_000;

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "just now";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${Math.max(seconds, 1)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type ChipVariant = "queued" | "scanning" | "live" | "failed";
type ChipIcon = "check-circle" | "x-circle" | "pulse" | "dot";

interface ChipDescriptor {
  label: string;
  variant: ChipVariant;
  icon: ChipIcon;
}

function statusChipDescriptor(submission: PublicRepoSubmission): ChipDescriptor {
  if (submission.status === "listed" || submission.status === "matched") {
    return { label: "LIVE", variant: "live", icon: "check-circle" };
  }
  if (submission.status === "scan_failed") {
    return { label: "FAILED", variant: "failed", icon: "x-circle" };
  }
  if (submission.status === "scanning") {
    const total = submission.scanChannels.length;
    const done = submission.scanChannels.filter(
      (c: ScanChannelVerdict) => c.status !== "pending",
    ).length;
    if (total > 0 && done < total) {
      return { label: `${done}/${total}`, variant: "scanning", icon: "pulse" };
    }
    return { label: "SCANNING", variant: "scanning", icon: "pulse" };
  }
  if (submission.status === "ingested") {
    return { label: "INGESTED", variant: "scanning", icon: "pulse" };
  }
  return { label: "QUEUED", variant: "queued", icon: "dot" };
}

function initialFromName(fullName: string): string {
  const owner = fullName.split("/")[0] ?? "?";
  return owner.charAt(0).toUpperCase();
}

function ownerRepoFromFullName(
  fullName: string,
): { owner: string; name: string } {
  const [owner = "", name = ""] = fullName.split("/", 2);
  return { owner, name };
}

interface ApiResponse<T> {
  ok: true;
  result: T;
  enqueued?: boolean;
  queueDepth?: number | null;
}

interface ApiError {
  ok: false;
  error: string;
}

interface SubmissionsListResponse {
  ok: true;
  queue: unknown;
  queueDepth: number | null;
  stats: RepoSubmissionStats;
  submissions: PublicRepoSubmission[];
}


export function DropClient({
  initialSubmissions,
  initialStats,
  initialTotalCount,
}: DropClientProps) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [stats, setStats] = useState<RepoSubmissionStats>(initialStats);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const [repo, setRepo] = useState("");
  const [contact, setContact] = useState("");
  const [form, setForm] = useState<FormState>({
    status: "idle",
    message: null,
    trackedPath: null,
  });
  const [pollIds, setPollIds] = useState<string[]>([]);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Tick for "Xs ago" copy
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/repo-submissions", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!res.ok) return;
      const body = (await res.json()) as SubmissionsListResponse | ApiError;
      if (!("submissions" in body)) return;
      setSubmissions(body.submissions);
      setStats(body.stats);
      setRefreshedAt(new Date());
    } catch {
      // Silent; next interval retries.
    }
  }, []);

  // Periodic full-list refresh so the queue stays alive even without polling.
  useEffect(() => {
    refreshTimerRef.current = setInterval(refreshList, REFRESH_INTERVAL_MS);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [refreshList]);

  // Faster polling for in-flight submissions until they reach a terminal state.
  useEffect(() => {
    if (pollIds.length === 0) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const poll = async () => {
      const fetchedRows: PublicRepoSubmission[] = [];
      for (const id of pollIds) {
        try {
          const res = await fetch(`/api/repo-submissions/${id}`, {
            cache: "no-store",
            headers: { accept: "application/json" },
          });
          if (!res.ok) continue;
          const body = (await res.json()) as
            | { ok: true; submission: PublicRepoSubmission }
            | ApiError;
          if ("submission" in body) fetchedRows.push(body.submission);
        } catch {
          /* ignore */
        }
      }
      if (cancelled || fetchedRows.length === 0) return;

      setSubmissions((prev) => {
        const map = new Map(prev.map((s) => [s.id, s] as const));
        for (const row of fetchedRows) {
          map.set(row.id, row);
        }
        return Array.from(map.values()).sort(
          (a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
        );
      });
      setRefreshedAt(new Date());

      const stillPending = fetchedRows
        .filter(
          (row) =>
            row.status === "queued" ||
            row.status === "scanning" ||
            row.status === "ingested",
        )
        .map((row) => row.id);
      setPollIds(stillPending);
    };

    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    void poll();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };
  }, [pollIds]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!repo.trim()) {
        setForm({
          status: "error",
          message: "Paste a GitHub repo URL or owner/name.",
          trackedPath: null,
        });
        return;
      }

      setForm({ status: "submitting", message: null, trackedPath: null });
      try {
        const res = await fetch("/api/repo-submissions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repo: repo.trim(),
            contact: contact.trim() || null,
          }),
        });
        const body = (await res.json()) as
          | ApiResponse<{
              kind: "created";
              submission: PublicRepoSubmission;
            }>
          | ApiResponse<{
              kind: "duplicate";
              submission: PublicRepoSubmission;
            }>
          | ApiResponse<{
              kind: "already_tracked";
              repo: { fullName: string; repoPath: string };
            }>
          | ApiError;

        if (!body.ok) {
          setForm({
            status: "error",
            message: body.error || `error ${res.status}`,
            trackedPath: null,
          });
          return;
        }

        if (body.result.kind === "created") {
          const created = body.result.submission;
          setSubmissions((prev) => {
            const next = [created, ...prev.filter((s) => s.id !== created.id)];
            return next.sort(
              (a, b) =>
                Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
            );
          });
          setTotalCount((c) => c + 1);
          setPollIds((prev) =>
            prev.includes(created.id) ? prev : [...prev, created.id],
          );
          setForm({
            status: "success",
            message: `Dropped — watch the queue.`,
            trackedPath: null,
          });
          setRepo("");
          setContact("");
        } else if (body.result.kind === "duplicate") {
          const dup = body.result.submission;
          setForm({
            status: "duplicate",
            message: `${dup.fullName} is already in the queue (${dup.status}).`,
            trackedPath: null,
          });
          setPollIds((prev) =>
            prev.includes(dup.id) ? prev : [...prev, dup.id],
          );
        } else {
          setForm({
            status: "tracked",
            message: `${body.result.repo.fullName} is already tracked.`,
            trackedPath: body.result.repo.repoPath,
          });
        }
      } catch (err) {
        setForm({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
          trackedPath: null,
        });
      }
    },
    [repo, contact],
  );

  const visible = submissions.slice(0, MAX_VISIBLE);
  const activeCount = submissions.filter(
    (s) =>
      s.status === "queued" ||
      s.status === "scanning" ||
      s.status === "ingested",
  ).length;

  const formattedRefreshed = formatRelativeTime(refreshedAt.toISOString());
  const medianTtl = stats.medianTtlHours;

  return (
    <>
      <section className={styles.formPanel} aria-labelledby="drop-form-heading">
        <span className={styles.bracketTL} aria-hidden="true" />
        <span className={styles.bracketTR} aria-hidden="true" />
        <span className={styles.bracketBL} aria-hidden="true" />
        <span className={styles.bracketBR} aria-hidden="true" />

        <header className={styles.formHeader}>
          <span className={styles.metaLabel} id="drop-form-heading">
            GITHUB REPO URL · REQUIRED
          </span>
          <span className={styles.metaLabelRight}>
            THAT&apos;S IT — WE HANDLE THE REST
          </span>
        </header>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.urlRow}>
            <span className={styles.urlPrefix} aria-hidden="true">
              <SourceLogo source="github" size="sm" className={styles.ghMark} />
              github.com/
            </span>
            <input
              className={styles.urlInput}
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="owner/repo"
              aria-label="GitHub repo URL or owner/name"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
          </div>
          <p className={styles.helperText}>
            e.g. <code>openai/codex</code>, <code>smol-ai/agent-os</code>, or full
            GitHub URL
          </p>

          <label
            className={styles.metaLabel}
            htmlFor="drop-contact"
            style={{ marginTop: 22 }}
          >
            YOU · OPTIONAL — SO WE PING YOU WHEN IT GOES LIVE
          </label>
          <input
            id="drop-contact"
            className={styles.contactInput}
            type="text"
            autoComplete="off"
            placeholder="@handle or email — we'll DM you the profile link"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />

          <div className={styles.submitRow}>
            <button
              className={styles.submitButton}
              type="submit"
              disabled={form.status === "submitting"}
              aria-busy={form.status === "submitting"}
            >
              <Icon name="rocket" size="lg" />
              {form.status === "submitting"
                ? "Queueing…"
                : "Drop it in the queue"}
            </button>
            <p className={styles.submitNote}>
              We fetch metadata, scan signals, and build the profile.
              {medianTtl !== null ? (
                <>
                  {" "}Median time-to-live: <b>~{medianTtl}h.</b>
                </>
              ) : null}
            </p>
          </div>

          {form.status !== "idle" && form.status !== "submitting" ? (
            <p
              role="status"
              aria-live="polite"
              className={[
                styles.formStatus,
                form.status === "error" ? styles.formStatusError : "",
                form.status === "tracked" ? styles.formStatusTracked : "",
                form.status === "success" ? styles.formStatusOk : "",
                form.status === "duplicate" ? styles.formStatusOk : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {form.message}
              {form.status === "tracked" && form.trackedPath ? (
                <>
                  {" "}
                  <a className={styles.trackedLink} href={form.trackedPath}>
                    View profile →
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </form>
      </section>

      <section className={styles.statsBar} aria-label="Drop intake stats">
        <div className={styles.stat}>
          <span className={styles.statValue}>{stats.droppedThisWeek}</span>
          <span className={styles.statLabel}>DROPPED THIS WEEK</span>
        </div>
        <span className={styles.statDot} aria-hidden="true">
          ·
        </span>
        <div className={styles.stat}>
          <span className={styles.statValue}>{stats.percentListedUnder24h}%</span>
          <span className={styles.statLabel}>LISTED &lt; 24H</span>
        </div>
        <span className={styles.statDot} aria-hidden="true">
          ·
        </span>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {medianTtl !== null ? `${medianTtl}h` : "—"}
          </span>
          <span className={styles.statLabel}>MEDIAN TIME-TO-LIVE</span>
        </div>
        <span className={styles.statDot} aria-hidden="true">
          ·
        </span>
        <div className={styles.stat}>
          <span className={styles.statValue}>0</span>
          <span className={styles.statLabel}>FORMS TO FILL</span>
        </div>
      </section>

      <section
        className={styles.queuePanel}
        aria-labelledby="drop-queue-heading"
      >
        <span className={styles.bracketTL} aria-hidden="true" />
        <span className={styles.bracketTR} aria-hidden="true" />
        <span className={styles.bracketBL} aria-hidden="true" />
        <span className={styles.bracketBR} aria-hidden="true" />

        <header className={styles.queueHeader}>
          <span className={styles.metaLabel} id="drop-queue-heading">
            {"// IN THE QUEUE NOW"}
          </span>
          <span className={styles.metaLabelRight}>
            <b>{activeCount || visible.length}</b>{" "}
            {activeCount === 1 ? "ACTIVE" : "ACTIVE"} · REFRESHED{" "}
            {formattedRefreshed}
          </span>
        </header>

        {visible.length === 0 ? (
          <p className={styles.queueEmpty}>
            Queue is clear — drop a repo above to be the first.
          </p>
        ) : (
          <ul
            className={styles.queueList}
            aria-live="polite"
            aria-busy={pollIds.length > 0}
          >
            {visible.map((row) => {
              const { owner, name } = ownerRepoFromFullName(row.fullName);
              const chip = statusChipDescriptor(row);
              const handle = row.publicContact;
              return (
                <li key={row.id} className={styles.queueRow}>
                  <span
                    className={styles.queueAvatar}
                    aria-hidden="true"
                  >
                    {initialFromName(row.fullName)}
                  </span>
                  <span className={styles.queueRepo}>
                    <span className={styles.queueOwner}>{owner}/</span>
                    <a
                      className={styles.queueName}
                      href={row.repoPath ?? `/repo/${owner}/${name}`}
                    >
                      {name}
                    </a>
                  </span>
                  <span className={styles.queueMeta}>
                    {handle ? (
                      <>
                        <span className={styles.queueHandle}>{handle}</span>
                        <span aria-hidden="true"> · </span>
                      </>
                    ) : null}
                    {formatRelativeTime(row.submittedAt)}
                  </span>
                  <span
                    className={`${styles.queueChip} ${styles[`chip_${chip.variant}`]}`}
                  >
                    <Icon name={chip.icon} size="sm" />
                    {chip.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className={styles.maintainerCallout}>
        <strong>Maintainer?</strong> Drop your own repo here and add{" "}
        <Link
          href="/account/verify-author"
          prefetch={false}
          className={styles.calloutLink}
        >
          verified-author proof
        </Link>{" "}
        in profile settings later — verified drops jump the queue on release
        day and unlock the founder-channel signal boost.
      </aside>

      <p className={styles.totalLine}>
        Tracked corpus: <b>{totalCount.toLocaleString()}</b> submissions
        recorded · queue is a live Redis FIFO; pickup latency ~60s.
      </p>
    </>
  );
}
