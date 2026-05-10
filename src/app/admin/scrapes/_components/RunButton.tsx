"use client";

// Tiny client island for the /admin/scrapes page. Posts to
// /api/admin/scrape/run and surfaces the response inline so the
// operator gets immediate feedback on spawn success/failure without
// a full-page reload. Once the spawn returns OK we trigger a
// router.refresh() so the server component re-reads the meta sidecars
// and the next render reflects the new last-run timestamp.
//
// Kept intentionally minimal — no toast library, no loading state
// beyond a per-button spinner. Operators are senior; a one-line
// status message is enough.

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

interface RunResultRow {
  source: string;
  script: string;
  pid: number | null;
  logFile: string;
  spawnError?: string;
}

interface RunResponse {
  ok: boolean;
  source?: string;
  startedAt?: string;
  results?: RunResultRow[];
  error?: string;
}

export function RunButton({
  source,
  label,
  variant,
}: {
  source: string;
  label: string;
  variant: "primary" | "ghost";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/scrape/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const data = (await res.json()) as RunResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const ok = (data.results ?? []).filter((r) => !r.spawnError);
      const failed = (data.results ?? []).filter((r) => r.spawnError);
      setStatus(
        `started ${ok.length} ${ok.length === 1 ? "collector" : "collectors"}` +
          (failed.length > 0 ? ` · ${failed.length} failed` : ""),
      );
      // Refresh the parent server component so the next render reads
      // the new sidecars/logs once collectors begin emitting.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [router, source]);

  const baseStyle =
    variant === "primary"
      ? {
          background: "var(--v4-acc-soft, #1e3a8a)",
          border: "1px solid var(--v4-acc-dim, #3b82f6)",
          color: "var(--v4-acc, #93c5fd)",
          fontWeight: 500,
        }
      : {
          background: "transparent",
          border: "1px solid var(--v4-line-100, #1f2937)",
          color: "var(--v4-ink-200, #cbd5e1)",
        };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        className="inline-flex items-center rounded-[2px] px-3 py-1.5 text-[10px] tracking-[0.16em] transition-colors uppercase disabled:opacity-50"
        style={baseStyle}
      >
        {busy ? "STARTING…" : label}
      </button>
      {status ? (
        <span
          className="text-[10px] tracking-[0.14em] uppercase"
          style={{ color: "var(--v4-money, #22c55e)" }}
        >
          {status}
        </span>
      ) : null}
      {error ? (
        <span
          className="max-w-[240px] truncate text-[10px] tracking-[0.14em] uppercase"
          style={{ color: "var(--v4-red, #ef4444)" }}
          title={error}
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
