// Unified "scraped Xm ago" badge for every news source page. Classification
// is performed server-side in the parent page (via classifyFreshness) and
// passed in as plain props so this stays a pure presentational component
// safe to import from client surfaces.

import type { FreshnessStatus } from "@/lib/news/freshness";

interface ScrapeAgeProps {
  status: FreshnessStatus;
  ageLabel: string;
  /** Optional ISO of the last fetch — shown as the title attr / aria-label. */
  fetchedAt?: string | null;
  className?: string;
}

export function ScrapeAge({
  status,
  ageLabel,
  fetchedAt,
  className = "",
}: ScrapeAgeProps) {
  const { dotClass, textClass, label } = (() => {
    if (status === "cold") {
      return {
        dotClass: "bg-down",
        textClass: "text-[var(--v4-red)]",
        label: `COLD · ${ageLabel}`,
      };
    }
    if (status === "warn") {
      return {
        dotClass: "bg-warning",
        textClass: "text-[var(--v4-amber)]",
        label: `STALE · ${ageLabel}`,
      };
    }
    return {
      dotClass: "bg-functional",
      textClass: "text-functional",
      label: `LIVE · ${ageLabel}`,
    };
  })();

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border-primary bg-bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${textClass} ${className}`}
      title={fetchedAt ?? "never scraped"}
      aria-label={`Last scrape: ${ageLabel}`}
    >
      <span
        className={`inline-block size-1.5 rounded-full ${dotClass}`}
        aria-hidden
      />
      {label}
    </span>
  );
}

export default ScrapeAge;
