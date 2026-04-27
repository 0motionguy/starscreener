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
        className="inline-flex items-center gap-1.5 rounded-[2px] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors"
        style={{
          background: "var(--v3-bg-050)",
          border: "1px solid var(--v3-line-200)",
          color: "var(--v3-ink-200)",
        }}
        aria-expanded={open}
        aria-controls={`scan-log-panel-${sourceId}`}
      >
        <ScrollText className="size-3" aria-hidden />
        Log
      </button>

      {open ? (
        <div
          id={`scan-log-panel-${sourceId}`}
          className="mt-2 rounded-[2px] p-3"
          style={{
            background: "var(--v3-bg-025)",
            border: "1px solid var(--v3-line-200)",
          }}
        >
          <div
            className="-mx-3 -mt-3 mb-3 flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            style={{
              background: "var(--v3-bg-050)",
              borderBottom: "1px solid var(--v3-line-100)",
            }}
          >
            <span
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "var(--v3-ink-300)" }}
            >
              <span
                aria-hidden
                className="inline-block"
                style={{
                  width: 6,
                  height: 6,
                  background: "var(--v3-acc)",
                  borderRadius: 1,
                }}
              />
              {`${sourceLabel} · MOST RECENT RUN`}
            </span>
            <button
              type="button"
              onClick={() => void fetchLog()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-[2px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
              style={{
                background: "var(--v3-bg-050)",
                border: "1px solid var(--v3-line-200)",
                color: "var(--v3-ink-200)",
              }}
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
            <div
              className="mb-2 rounded-[2px] px-2 py-2 font-mono text-[11px]"
              style={{
                color: "var(--v3-sig-red)",
                border: "1px solid var(--v3-sig-red)",
                background: "rgba(255, 77, 77, 0.06)",
              }}
            >
              {`// ERROR · ${error}`}
            </div>
          ) : null}

          {!error && loading && !data ? (
            <div
              className="font-mono text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "var(--v3-ink-400)" }}
            >
              {"// LOADING…"}
            </div>
          ) : null}

          {!error && data ? (
            data.file === null ? (
              <div
                className="font-mono text-[11px] uppercase tracking-[0.16em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                {"// NO RUNS YET — CLICK SCAN NOW FIRST"}
              </div>
            ) : (
              <>
                <div className="mb-2 grid grid-cols-1 gap-1 sm:grid-cols-3">
                  <div
                    className="font-mono text-[10px] tracking-[0.14em]"
                    style={{ color: "var(--v3-ink-400)" }}
                  >
                    <span className="uppercase">FILE:</span>{" "}
                    <span
                      className="tabular-nums"
                      style={{ color: "var(--v3-ink-200)" }}
                    >
                      {data.file}
                    </span>
                  </div>
                  <div
                    className="font-mono text-[10px] tracking-[0.14em]"
                    style={{ color: "var(--v3-ink-400)" }}
                  >
                    <span className="uppercase">SIZE:</span>{" "}
                    <span
                      className="tabular-nums"
                      style={{ color: "var(--v3-ink-200)" }}
                    >
                      {formatBytes(data.sizeBytes)}
                    </span>
                  </div>
                  <div
                    className="font-mono text-[10px] tracking-[0.14em]"
                    style={{ color: "var(--v3-ink-400)" }}
                  >
                    <span className="uppercase">STARTED:</span>{" "}
                    <span
                      className="tabular-nums"
                      style={{ color: "var(--v3-ink-200)" }}
                    >
                      {formatStartedAt(data.startedAt)}
                    </span>
                  </div>
                </div>
                {data.lines.length === 0 ? (
                  <div
                    className="font-mono text-[11px] uppercase tracking-[0.16em]"
                    style={{ color: "var(--v3-ink-400)" }}
                  >
                    {"// (EMPTY LOG)"}
                  </div>
                ) : (
                  <pre
                    className="overflow-auto whitespace-pre rounded-[2px] p-3 font-mono text-[11px] tabular-nums"
                    style={{
                      maxHeight: 320,
                      background: "var(--v3-bg-000)",
                      border: "1px solid var(--v3-line-100)",
                      color: "var(--v3-ink-200)",
                    }}
                  >
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
