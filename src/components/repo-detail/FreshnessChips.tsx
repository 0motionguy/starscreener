// FreshnessChips — per-source scanner freshness row.
//
// Renders a horizontal, monospace chip strip beneath the mentions feed
// header so users can tell whether Reddit was scanned 2h ago or 3d ago
// before trusting mention counts. Stale chips get a dim warning color
// plus a trailing "*" marker.
//
// Pure presentational component — no data fetching. Expects the same
// `sources` shape returned by /api/repos/[owner]/[name]/freshness.

import type { FreshnessSnapshot } from "@/lib/source-health";

type SourceKey = keyof FreshnessSnapshot["sources"];

interface FreshnessChipsProps {
  sources: FreshnessSnapshot["sources"];
}

// Short labels match the mentions tab shorthand so the row reads as a
// legend for the tabs above it.
const CHIP_LABEL: Record<SourceKey, string> = {
  reddit: "reddit",
  hackernews: "hn",
  bluesky: "bluesky",
  devto: "devto",
  producthunt: "ph",
  twitter: "twitter",
  npm: "npm",
  github: "github",
};

// Stable display order — matches the mentions tab order where possible
// and groups code-source channels (npm/github) at the tail.
const CHIP_ORDER: readonly SourceKey[] = [
  "reddit",
  "hackernews",
  "bluesky",
  "twitter",
  "devto",
  "producthunt",
  "npm",
  "github",
];

function formatAge(ageMs: number | null): string {
  if (ageMs === null) return "—";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function FreshnessChips({ sources }: FreshnessChipsProps) {
  // Hide sources that have nothing to say: never scanned AND not stale.
  // A source that is never scanned AND flagged stale would still render
  // as "never" so the user sees the absence.
  const visible = CHIP_ORDER.filter((key) => {
    const entry = sources[key];
    if (!entry) return false;
    if (entry.lastScanAt) return true;
    return entry.stale;
  });

  if (visible.length === 0) return null;

  return (
    <div
      aria-label="Scanner freshness"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-text-tertiary"
    >
      <span
        className="text-text-tertiary/70"
        title="Last scan age per source. A trailing * means the scan is older than the per-source freshness threshold (stale); numbers on newer scans are safe to trust."
      >
        {"// last scan"}
      </span>
      {visible.map((key, idx) => {
        const entry = sources[key];
        const ageLabel = entry.lastScanAt ? formatAge(entry.ageMs) : "never";
        const isStale = entry.stale;
        return (
          <span
            key={key}
            className="inline-flex items-center gap-1"
            title={
              entry.lastScanAt
                ? `${CHIP_LABEL[key]} last scanned ${new Date(entry.lastScanAt).toISOString()}${isStale ? " (stale)" : ""}`
                : `${CHIP_LABEL[key]} never scanned`
            }
          >
            <span className={isStale ? "text-[var(--v4-amber)]" : undefined}>
              {CHIP_LABEL[key]}{" "}
              <span className="tabular-nums">{ageLabel}</span>
              {isStale ? "*" : ""}
            </span>
            {idx < visible.length - 1 ? (
              <span aria-hidden className="text-text-tertiary/40">
                ·
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export default FreshnessChips;
