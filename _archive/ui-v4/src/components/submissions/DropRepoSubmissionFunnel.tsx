/**
 * DropRepoSubmissionFunnel — funnel % widget for /submit's right rail.
 * Operator mockup deferred from 2026-05-15. Renders four stage bars:
 *
 *   SUBMITTED   100% baseline
 *   SCANNED     scanning + listed + failed
 *   LISTED      listed
 *   BOOSTED     boosted (boost rate, not a funnel stage — surfaces share
 *               activity at a glance)
 *
 * Each row: stage label · share-bar · count · percentage. Reads from
 * the queue summary the page already loads; no extra fetch.
 */

import { cn } from "@/lib/utils";

interface QueueShape {
  pending: number;
  queued: number;
  scanning: number;
  listed: number;
  failed: number;
  boosted: number;
}

interface DropRepoSubmissionFunnelProps {
  queue: QueueShape;
  loading: boolean;
  className?: string;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function DropRepoSubmissionFunnel({
  queue,
  loading,
  className,
}: DropRepoSubmissionFunnelProps) {
  const submitted =
    queue.pending +
    queue.queued +
    queue.scanning +
    queue.listed +
    queue.failed;
  const scanned = queue.scanning + queue.listed + queue.failed;

  const rows: ReadonlyArray<{
    key: string;
    label: string;
    count: number;
    share: number;
    tone: "neutral" | "fresh" | "live" | "warn";
  }> = [
    {
      key: "submitted",
      label: "Submitted",
      count: submitted,
      share: 100,
      tone: "neutral",
    },
    {
      key: "scanned",
      label: "Scanned",
      count: scanned,
      share: pct(scanned, submitted),
      tone: "fresh",
    },
    {
      key: "listed",
      label: "Listed",
      count: queue.listed,
      share: pct(queue.listed, submitted),
      tone: "live",
    },
    {
      key: "boosted",
      label: "Boosted",
      count: queue.boosted,
      share: pct(queue.boosted, submitted),
      tone: "warn",
    },
  ];

  return (
    <section
      className={cn("v2-card p-5 sm:p-6", className)}
      aria-label="Submission funnel"
    >
      <div className="flex items-center justify-between gap-2 text-text-primary">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-secondary">
          Funnel
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
          {loading ? "…" : `${submitted} total`}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-[80px_minmax(0,1fr)_32px_36px] items-center gap-2"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
              {row.label}
            </span>
            <span
              className="block h-1.5 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={row.share}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${row.label}: ${row.share}%`}
              style={{ background: "var(--v4-line-100, #1e1e22)" }}
            >
              <i
                className="block h-full rounded-full"
                style={{
                  width: `${row.share}%`,
                  background:
                    row.tone === "live"
                      ? "var(--v4-money, #22c55e)"
                      : row.tone === "fresh"
                        ? "var(--v4-acc, #fb923c)"
                        : row.tone === "warn"
                          ? "var(--v4-amber, #f59e0b)"
                          : "var(--ink-300, #9ca3af)",
                }}
              />
            </span>
            <span className="text-right text-xs tabular-nums text-text-secondary">
              {loading ? "…" : row.count}
            </span>
            <span className="text-right font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary tabular-nums">
              {loading ? "" : `${row.share}%`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
