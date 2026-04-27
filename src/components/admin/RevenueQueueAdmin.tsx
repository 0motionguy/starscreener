"use client";

// Admin moderation UI for revenue submissions. Auth is handled by the
// ss_admin cookie (server-gated in src/app/admin/revenue-queue/page.tsx and
// re-checked by verifyAdminAuth on every API call). No token paste.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { trustmrrProfileUrl } from "@/lib/trustmrr-url";

type Mode = "trustmrr_link" | "self_report";
type Status = "pending_moderation" | "approved" | "rejected";

interface AdminSubmission {
  id: string;
  fullName: string;
  repoUrl: string;
  mode: Mode;
  status: Status;
  submittedAt: string;
  moderatedAt: string | null;
  moderationNote: string | null;
  contact: string | null;
  notes: string | null;
  trustmrrSlug?: string;
  mrrCents?: number;
  customers?: number | null;
  paymentProvider?: string;
  proofUrl?: string | null;
}

type Filter = "pending" | "approved" | "rejected" | "all";

function fmtUsd(cents: number | null | undefined): string {
  if (typeof cents !== "number") return "-";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

export function RevenueQueueAdmin() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return submissions;
    if (filter === "pending") {
      return submissions.filter((s) => s.status === "pending_moderation");
    }
    return submissions.filter((s) => s.status === filter);
  }, [submissions, filter]);

  const pendingCount = useMemo(
    () =>
      submissions.filter((s) => s.status === "pending_moderation").length,
    [submissions],
  );

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/revenue-queue", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        router.push("/admin/login?next=/admin/revenue-queue");
        return;
      }
      const payload = (await res.json()) as
        | { ok: true; submissions: AdminSubmission[] }
        | { ok: false; error: string; reason?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "request failed");
      }
      setSubmissions(payload.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [router]);

  async function moderate(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/revenue-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, action }),
      });
      if (res.status === 401) {
        router.push("/admin/login?next=/admin/revenue-queue");
        return;
      }
      const payload = (await res.json()) as
        | { ok: true; submission: AdminSubmission }
        | { ok: false; error: string };
      if (!payload.ok) throw new Error(payload.error ?? "request failed");
      setSubmissions((prev) =>
        prev.map((row) => (row.id === id ? payload.submission : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1100px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border-primary pb-6">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2">
              <ShieldAlert className="size-5 text-warning" aria-hidden />
              Revenue Moderation Queue
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Private admin tool. Approved submissions surface on repo detail
              pages (self-reported card, distinct from verified TrustMRR card).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadQueue()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-text-primary hover:bg-bg-card-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            Reload
          </button>
        </header>

        {error ? (
          <div className="mb-4 rounded-md border border-down/60 bg-down/5 px-3 py-2 text-sm text-down">
            {error}
          </div>
        ) : null}

        <section className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          {(["pending", "approved", "rejected", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                "rounded-md border px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition " +
                (f === filter
                  ? "border-brand bg-brand/10 text-text-primary"
                  : "border-border-primary bg-bg-muted text-text-secondary hover:text-text-primary")
              }
            >
              {f}
              {f === "pending" ? ` (${pendingCount})` : ""}
            </button>
          ))}
        </section>

        <section className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/40 px-4 py-6 text-sm text-text-tertiary">
              Nothing to show in this filter.
            </div>
          ) : (
            filtered.map((row) => (
              <ModerationRow
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onAction={(action) => moderate(row.id, action)}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function ModerationRow({
  row,
  busy,
  onAction,
}: {
  row: AdminSubmission;
  busy: boolean;
  onAction: (action: "approve" | "reject") => void;
}) {
  const isPending = row.status === "pending_moderation";
  return (
    <article
      className="v2-card p-4"
      style={{
        background:
          row.status === "approved"
            ? "rgba(34, 197, 94, 0.06)"
            : row.status === "rejected"
              ? "rgba(255, 77, 77, 0.06)"
              : "var(--v2-bg-050)",
        borderColor:
          row.status === "approved"
            ? "var(--v2-sig-green)"
            : row.status === "rejected"
              ? "var(--v2-sig-red)"
              : "var(--v2-line-std)",
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/repo/${row.fullName}`}
            className="font-mono text-base font-semibold text-text-primary hover:underline"
          >
            {row.fullName}
          </Link>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            Submitted {new Date(row.submittedAt).toISOString().slice(0, 16).replace("T", " ")}
            {row.moderatedAt
              ? ` · moderated ${new Date(row.moderatedAt).toISOString().slice(0, 16).replace("T", " ")}`
              : ""}
          </p>
        </div>
        <span
          className={
            "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider " +
            (row.status === "approved"
              ? "border-up/60 bg-up/10 text-up"
              : row.status === "rejected"
                ? "border-down/60 bg-down/10 text-down"
                : "border-border-primary bg-bg-muted text-text-secondary")
          }
        >
          {row.status.replace("_", " ")}
        </span>
      </header>

      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Field label="Mode">
          {row.mode === "trustmrr_link" ? (
            <span className="inline-flex items-center gap-1">
              <BadgeCheck className="size-3.5 text-up" aria-hidden />
              TrustMRR link
            </span>
          ) : (
            "Self-report"
          )}
        </Field>
        {row.mode === "trustmrr_link" ? (
          <Field label="TrustMRR slug">
            {row.trustmrrSlug ? (
              <a
                href={trustmrrProfileUrl(row.trustmrrSlug)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-text-primary hover:underline"
              >
                {row.trustmrrSlug}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : (
              <span className="text-text-tertiary">-</span>
            )}
          </Field>
        ) : (
          <>
            <Field label="MRR">
              <span className="font-mono tabular-nums">
                {fmtUsd(row.mrrCents)}
              </span>
            </Field>
            <Field label="Customers">
              {typeof row.customers === "number" ? row.customers.toLocaleString("en-US") : "-"}
            </Field>
            <Field label="Provider">{row.paymentProvider ?? "-"}</Field>
            {row.proofUrl ? (
              <Field label="Proof URL">
                <a
                  href={row.proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-text-primary hover:underline"
                >
                  {row.proofUrl}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </Field>
            ) : null}
          </>
        )}
        {row.contact ? (
          <Field label="Contact">
            <span className="break-all">{row.contact}</span>
          </Field>
        ) : null}
        {row.notes ? <Field label="Notes">{row.notes}</Field> : null}
      </dl>

      {isPending ? (
        <footer className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onAction("approve")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-up/60 bg-up/10 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-up hover:bg-up/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="size-3.5" aria-hidden />
            )}
            Approve
          </button>
          <button
            type="button"
            onClick={() => onAction("reject")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-down/60 bg-down/10 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-down hover:bg-down/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <XCircle className="size-3.5" aria-hidden />
            )}
            Reject
          </button>
        </footer>
      ) : null}
    </article>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-text-secondary">{children}</dd>
    </div>
  );
}
