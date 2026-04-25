"use client";

// Shown when a source's last successful scrape is past the stale
// threshold. Per the redesign spec, we hide all data and render only this
// — never show outdated posts alongside fresh ones.
//
// Pure presentational client component — the parent page server-side
// computes the freshness verdict and passes pre-formatted props in.

import { useState } from "react";

interface SourceDownEmptyStateProps {
  /** Source id used to call POST /api/admin/scan. */
  source: string;
  sourceLabel: string;
  /** Pre-formatted age label, e.g. "4h" — produced server-side. */
  ageLabel: string;
  /** ms threshold the source must beat to come back from cold. */
  staleAfterMs: number;
  /** ISO of the last successful scrape, or null if never. */
  fetchedAt: string | null | undefined;
}

export function SourceDownEmptyState({
  source,
  sourceLabel,
  ageLabel,
  staleAfterMs,
  fetchedAt,
}: SourceDownEmptyStateProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function scan() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ source }),
      });
      const data = (await res.json()) as
        | { ok: true; logPath?: string; pid?: number | null }
        | { ok: false; error?: string; reason?: string };
      if (
        res.status === 401 ||
        (data.ok === false && data.reason === "unauthorized")
      ) {
        setResult("Sign in as admin to trigger a manual scan.");
        return;
      }
      if (!res.ok || data.ok === false) {
        const msg =
          data.ok === false ? data.error ?? "scan failed" : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setResult(
        `Scan started. Refresh in ~30-60s. Log: ${data.logPath ?? "(see /admin)"}`,
      );
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-down/40 bg-down/5 p-8 text-center">
      <div className="mx-auto inline-flex size-10 items-center justify-center rounded-full border border-down/60 bg-down/10 mb-4">
        <span className="text-xl text-down" aria-hidden>
          ×
        </span>
      </div>
      <h2 className="font-mono text-base font-semibold uppercase tracking-wider text-text-primary">
        {sourceLabel} is down
      </h2>
      <p className="mt-2 text-sm text-text-secondary">
        The {sourceLabel} scraper hasn&apos;t run successfully recently.
      </p>
      <p className="mt-1 text-xs text-text-tertiary">
        Last successful scan:{" "}
        {fetchedAt ? (
          <span title={fetchedAt} className="font-mono">
            {ageLabel} ago
          </span>
        ) : (
          <span className="font-mono">never</span>
        )}
        {" · "}
        threshold: {Math.floor(staleAfterMs / 60_000)}m
      </p>
      <p className="mt-3 max-w-md mx-auto text-xs text-text-tertiary">
        Showing stale data would mislead. The page is hidden until the
        scraper produces a fresh sample.
      </p>

      <div className="mt-6 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => void scan()}
          disabled={busy}
          className="rounded-md border border-brand/60 bg-brand/10 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-text-primary hover:bg-brand/20 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Scan now (admin)"}
        </button>
        {result ? (
          <p className="font-mono text-[11px] text-text-secondary">{result}</p>
        ) : null}
      </div>
    </div>
  );
}

export default SourceDownEmptyState;
