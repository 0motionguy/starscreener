"use client";

// Admin moderation UI for the /ideas queue. Auth is handled by the ss_admin
// cookie (server-gated in src/app/admin/ideas-queue/page.tsx + re-checked by
// verifyAdminAuth on every API call). No token paste in the UI.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Lightbulb,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import type { IdeaRecord } from "@/lib/ideas";

type Filter = "pending" | "published" | "rejected" | "all";

export function IdeasQueueAdmin() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<IdeaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return ideas;
    if (filter === "pending") {
      return ideas.filter((i) => i.status === "pending_moderation");
    }
    return ideas.filter((i) => i.status === filter);
  }, [ideas, filter]);

  const pendingCount = useMemo(
    () => ideas.filter((i) => i.status === "pending_moderation").length,
    [ideas],
  );

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ideas-queue", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        router.push("/admin/login?next=/admin/ideas-queue");
        return;
      }
      const payload = (await res.json()) as
        | { ok: true; ideas: IdeaRecord[] }
        | { ok: false; error: string; reason?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "request failed");
      }
      setIdeas(payload.ideas);
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
      const res = await fetch("/api/admin/ideas-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, action }),
      });
      if (res.status === 401) {
        router.push("/admin/login?next=/admin/ideas-queue");
        return;
      }
      const payload = (await res.json()) as
        | { ok: true; idea: IdeaRecord }
        | { ok: false; error: string };
      if (!payload.ok) throw new Error(payload.error ?? "request failed");
      setIdeas((prev) =>
        prev.map((row) => (row.id === id ? payload.idea : row)),
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
              Ideas Moderation Queue
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Approved ideas appear publicly on{" "}
              <Link href="/ideas" className="underline">/ideas</Link>. Once an
              author has 5 approved ideas, subsequent posts auto-publish.
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
          {(["pending", "published", "rejected", "all"] as Filter[]).map((f) => (
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
  row: IdeaRecord;
  busy: boolean;
  onAction: (action: "approve" | "reject") => void;
}) {
  const isPending = row.status === "pending_moderation";
  return (
    <article
      className="v2-card p-4"
      style={{
        background:
          row.status === "published" || row.status === "shipped"
            ? "rgba(34, 197, 94, 0.06)"
            : row.status === "rejected"
              ? "rgba(255, 77, 77, 0.06)"
              : "var(--v2-bg-050)",
        borderColor:
          row.status === "published" || row.status === "shipped"
            ? "var(--v2-sig-green)"
            : row.status === "rejected"
              ? "var(--v2-sig-red)"
              : "var(--v2-line-std)",
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Lightbulb className="size-3.5 text-warning" aria-hidden />
            <span className="font-mono text-xs text-text-tertiary">
              @{row.authorHandle} · {new Date(row.createdAt).toISOString().slice(0, 16).replace("T", " ")}
            </span>
          </div>
          <h3 className="mt-1 font-mono text-base font-semibold text-text-primary">
            {row.title}
          </h3>
        </div>
        <span
          className={
            "rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] " +
            (row.status === "published" || row.status === "shipped"
              ? "border-up/60 bg-up/10 text-up"
              : row.status === "rejected"
                ? "border-down/60 bg-down/10 text-down"
                : "border-border-primary bg-bg-muted text-text-secondary")
          }
        >
          {row.status.replace("_", " ")}
        </span>
      </header>

      <p className="mt-2 text-sm text-text-secondary">{row.pitch}</p>

      {row.targetRepos.length > 0 ? (
        <p className="mt-2 text-[11px] text-text-tertiary">
          Targets: {row.targetRepos.join(", ")}
        </p>
      ) : null}

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

export default IdeasQueueAdmin;
