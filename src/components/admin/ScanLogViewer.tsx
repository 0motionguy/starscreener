"use client";

// Inline log-tail viewer for the admin "Scan Now" rows. Operators click
// "Log" next to a source to peek at the last N lines of the most recent
// `.data/admin-scan-runs/<source>-<ts>.log` without SSH'ing in.
//
// Auth contract: GET /api/admin/scan-log uses verifyAdminAuth; the admin
// shell authenticates via cookie session, so we send `credentials:
// "include"` and bounce to /admin/login on 401.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw, ScrollText } from "lucide-react";

interface ScanLogPayload {
  ok: true;
  source: string;
  file: string | null;
  startedAt: string | null;
  sizeBytes: number;
  lines: string[];
  note?: string;
}

interface ScanLogError {
  ok: false;
  error?: string;
  reason?: string;
}

interface ScanLogViewerProps {
  sourceId: string;
  sourceLabel: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatStartedAt(iso: string | null): string {
  if (!iso) return "unknown";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  return new Date(ts).toLocaleString();
}

export default function ScanLogViewer({
  sourceId,
  sourceLabel,
}: ScanLogViewerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ScanLogPayload | null>(null);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/scan-log?source=${encodeURIComponent(sourceId)}`,
        { credentials: "include", cache: "no-store" },
      );
      if (res.status === 401) {
        router.push("/admin/login?next=/admin");
        return;
      }
      const payload = (await res.json()) as ScanLogPayload | ScanLogError;
      if (!payload.ok) {
        throw new Error(payload.error ?? "request failed");
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [router, sourceId]);

  const onToggle = useCallback(() => {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next && !data && !loading) {
        void fetchLog();
      }
      return next;
    });
  }, [data, loading, fetchLog]);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-primary bg-bg-muted px-2.5 py-1 text-xs uppercase tracking-wider text-text-secondary hover:bg-bg-card-hover transition-colors"
        aria-expanded={open}
        aria-controls={`scan-log-panel-${sourceId}`}
      >
        <ScrollText className="size-3.5" aria-hidden />
        Log
      </button>

      {open ? (
        <div
          id={`scan-log-panel-${sourceId}`}
          className="mt-2 rounded-md border border-border-primary bg-bg-muted p-3"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-wider text-text-tertiary">
              {sourceLabel} · most recent run
            </div>
            <button
              type="button"
              onClick={() => void fetchLog()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-primary bg-bg-muted px-2 py-0.5 text-[11px] uppercase tracking-wider text-text-secondary hover:bg-bg-card-hover transition-colors disabled:opacity-50"
            >
              {loading ? (
                <LoaderCircle className="size-3 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-3" aria-hidden />
              )}
              Refresh
            </button>
          </div>

          {error ? (
            <div className="rounded-md border border-border-primary bg-bg-muted p-2 text-xs text-error">
              {error}
            </div>
          ) : null}

          {!error && loading && !data ? (
            <div className="text-xs text-text-tertiary">loading…</div>
          ) : null}

          {!error && data ? (
            data.file === null ? (
              <div className="text-xs text-text-tertiary">
                no runs yet — click Scan Now first
              </div>
            ) : (
              <>
                <div className="mb-2 grid grid-cols-1 gap-1 text-[11px] text-text-tertiary sm:grid-cols-3">
                  <div>
                    <span className="uppercase tracking-wider">file:</span>{" "}
                    <span className="font-mono text-text-secondary">
                      {data.file}
                    </span>
                  </div>
                  <div>
                    <span className="uppercase tracking-wider">size:</span>{" "}
                    <span className="font-mono text-text-secondary">
                      {formatBytes(data.sizeBytes)}
                    </span>
                  </div>
                  <div>
                    <span className="uppercase tracking-wider">started:</span>{" "}
                    <span className="font-mono text-text-secondary">
                      {formatStartedAt(data.startedAt)}
                    </span>
                  </div>
                </div>
                {data.lines.length === 0 ? (
                  <div className="text-xs text-text-tertiary">(empty log)</div>
                ) : (
                  <pre className="font-mono text-[11px] text-text-secondary bg-bg-muted p-3 rounded-md max-h-80 overflow-auto whitespace-pre">
                    {data.lines.join("\n")}
                  </pre>
                )}
              </>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
