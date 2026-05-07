"use client";

// Admin moderation UI for the /admin/referrals queue. Mirrors
// IdeasQueueAdmin structure: cookie-gated server route, ConfirmDialog for
// Reject, busyId-per-row state, fetch with credentials: "include".
//
// Approve: clear fraud_flags + (if newly qualifying) increment the
// referrer's credit counter + insert any newly-reached milestone rows.
// Reject: append 'admin_rejected'; if qualify cron raced ahead and
// already rewarded, decrement credits + null timestamps.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdminReferralRow } from "@/app/api/admin/referrals/route";

export function ReferralsQueueAdmin() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Reject is destructive — it permanently locks the referrer out of
  // credit for this row (admin_rejected is a BLOCKING fraud flag). Gate
  // behind a confirmation modal; approve is non-destructive (one-click).
  const [pendingReject, setPendingReject] = useState<AdminReferralRow | null>(
    null,
  );

  const queueCount = useMemo(() => rows.length, [rows]);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/referrals", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        router.push("/admin/login?next=/admin/referrals");
        return;
      }
      const payload = (await res.json()) as
        | { ok: true; referrals: AdminReferralRow[] }
        | { ok: false; error: string; reason?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "request failed");
      }
      setRows(payload.referrals);
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
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, action }),
      });
      if (res.status === 401) {
        router.push("/admin/login?next=/admin/referrals");
        return;
      }
      const payload = (await res.json()) as
        | { ok: true; referral: AdminReferralRow }
        | { ok: false; error: string };
      if (!payload.ok) throw new Error(payload.error ?? "request failed");
      // Optimistic UI: post-action both states (cleared flags / admin_rejected)
      // remove the row from the queue selector, so drop it locally.
      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const handleAction = useCallback(
    (row: AdminReferralRow, action: "approve" | "reject") => {
      if (action === "reject") {
        setPendingReject(row);
        return;
      }
      void moderate(row.id, action);
    },
    [],
  );

  const confirmReject = useCallback(() => {
    if (!pendingReject) return;
    const target = pendingReject;
    setPendingReject(null);
    void moderate(target.id, "reject");
  }, [pendingReject]);

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1100px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border-primary pb-6">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2">
              <ShieldAlert
                className="size-5 text-[var(--v4-amber)]"
                aria-hidden
              />
              Referrals Review Queue
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Rows here carry one or more non-blocking fraud signals
              (same IP, same email domain, fast signup, etc.). Approve to
              clear flags and credit the referrer; reject to lock the
              attribution out of qualifying.
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
          <div className="mb-4 rounded-md border border-[var(--v4-red)]/60 bg-[var(--v4-red)]/5 px-3 py-2 text-sm text-[var(--v4-red)]">
            {error}
          </div>
        ) : null}

        <section className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span
            className="rounded-md border border-border-primary bg-bg-muted px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-text-secondary"
          >
            flagged ({queueCount})
          </span>
        </section>

        <section
          className="rounded-[2px]"
          style={{
            background: "var(--v3-bg-050)",
            border: "1px solid var(--v3-line-200)",
          }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
            style={{
              background: "var(--v3-bg-025)",
              borderBottom: "1px solid var(--v3-line-100)",
            }}
          >
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
              <span
                aria-hidden
                className="inline-block"
                style={{
                  width: 6,
                  height: 6,
                  background: "var(--v3-sig-amber)",
                  borderRadius: 1,
                }}
              />
              <span style={{ color: "var(--v3-ink-300)" }}>
                {"// FLAGGED REFERRALS · NEEDS REVIEW"}
              </span>
            </span>
            <span
              className="font-mono text-[10px] tabular-nums tracking-[0.14em]"
              style={{ color: "var(--v3-ink-400)" }}
            >
              {String(queueCount).padStart(2, "0")} OPEN
            </span>
          </div>

          <div className="p-4">
            {loading && rows.length === 0 ? (
              <ul className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="rounded-[2px] px-3 py-3 animate-pulse"
                    style={{
                      background: "var(--v3-bg-025)",
                      border: "1px solid var(--v3-line-100)",
                      height: 56,
                    }}
                    aria-hidden
                  />
                ))}
              </ul>
            ) : rows.length === 0 ? (
              <p
                className="font-mono text-[11px] uppercase tracking-[0.16em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                {"// NO FLAGGED REFERRALS PENDING REVIEW"}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--v3-line-200)" }}>
                      <Th>Created</Th>
                      <Th>Referrer</Th>
                      <Th>Referred</Th>
                      <Th>Email domain</Th>
                      <Th>IP hash</Th>
                      <Th>Fraud flags</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <ReviewRow
                        key={row.id}
                        row={row}
                        busy={busyId === row.id}
                        onAction={(action) => handleAction(row, action)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={pendingReject !== null}
        title="Reject referral?"
        description={
          pendingReject ? (
            <span>
              Reject the referral from{" "}
              <span className="font-mono">
                @{pendingReject.referrerHandle ?? "unknown"}
              </span>
              {pendingReject.referredHandle ? (
                <>
                  {" "}to{" "}
                  <span className="font-mono">
                    @{pendingReject.referredHandle}
                  </span>
                </>
              ) : null}
              ? The row will be locked out of qualifying. If credit was
              already issued by the qualify cron, it will be reversed.
            </span>
          ) : null
        }
        confirmLabel="Reject"
        cancelLabel="Cancel"
        tone="danger"
        busy={pendingReject ? busyId === pendingReject.id : false}
        onConfirm={confirmReject}
        onCancel={() => setPendingReject(null)}
      />
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em]"
      style={{ color: "var(--v3-ink-400)" }}
    >
      {children}
    </th>
  );
}

function ReviewRow({
  row,
  busy,
  onAction,
}: {
  row: AdminReferralRow;
  busy: boolean;
  onAction: (action: "approve" | "reject") => void;
}) {
  const created = formatRelative(row.createdAt);
  const emailDomain = extractDomain(row.referredEmail);
  const ipTail = row.ipHash ? row.ipHash.slice(-6) : "—";

  return (
    <tr style={{ borderBottom: "1px solid var(--v3-line-100)" }}>
      <td
        className="px-2 py-2 font-mono tabular-nums text-[11px]"
        style={{ color: "var(--v3-ink-200)" }}
        title={row.createdAt}
      >
        {created}
      </td>
      <td
        className="px-2 py-2"
        style={{ color: "var(--v3-ink-100)", fontWeight: 500 }}
      >
        @{row.referrerHandle ?? <span style={{ color: "var(--v3-ink-400)" }}>—</span>}
      </td>
      <td
        className="px-2 py-2"
        style={{ color: "var(--v3-ink-100)" }}
      >
        {row.referredHandle ? (
          <>@{row.referredHandle}</>
        ) : (
          <span style={{ color: "var(--v3-ink-400)" }}>click only</span>
        )}
      </td>
      <td
        className="px-2 py-2 font-mono text-[11px]"
        style={{ color: "var(--v3-ink-200)" }}
      >
        {emailDomain ?? "—"}
      </td>
      <td
        className="px-2 py-2 font-mono tabular-nums text-[11px]"
        style={{ color: "var(--v3-ink-200)" }}
      >
        {ipTail}
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap gap-1">
          {row.fraudFlags.map((flag) => (
            <span
              key={flag}
              className="rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{
                borderColor: "var(--v3-sig-amber)",
                background:
                  "color-mix(in srgb, var(--v3-sig-amber) 10%, transparent)",
                color: "var(--v3-sig-amber)",
              }}
            >
              {flag.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onAction("approve")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-up/60 bg-up/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--v4-money)] hover:bg-up/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="size-3 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="size-3" aria-hidden />
            )}
            Approve
          </button>
          <button
            type="button"
            onClick={() => onAction("reject")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-down/60 bg-down/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--v4-red)] hover:bg-down/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="size-3 animate-spin" aria-hidden />
            ) : (
              <XCircle className="size-3" aria-hidden />
            )}
            Reject
          </button>
        </div>
      </td>
    </tr>
  );
}

function extractDomain(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at === -1 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso.slice(0, 16).replace("T", " ");
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export default ReferralsQueueAdmin;
