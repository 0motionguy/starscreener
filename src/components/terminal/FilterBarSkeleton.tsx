import { cn } from "@/lib/utils";

/**
 * FilterBarSkeleton — placeholder rendered while the filter bar is awaiting
 * its first `meta-counts` + `status` fetch. Matches the two-row silhouette
 * of the real FilterBar so the page doesn't reflow on hydration.
 *
 * Server component. Pure presentation, no store access.
 */
export function FilterBarSkeleton() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "sticky top-14 z-30",
        "bg-bg-primary/90 backdrop-blur-md",
        "border-b border-border-primary",
      )}
    >
      <div className="max-w-full mx-auto px-4 sm:px-6 py-3 space-y-3">
        {/* Row 1 — 7 meta pills */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-32 skeleton-shimmer rounded-full"
            />
          ))}
        </div>

        {/* Row 2 — stats | tabs | time | view */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Stats row skeleton */}
          <div className="flex items-center gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-4 w-20 skeleton-shimmer rounded"
              />
            ))}
            <div className="size-6 skeleton-shimmer rounded-md" />
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Tabs skeleton */}
            <div className="flex items-center gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-7 w-20 skeleton-shimmer rounded-md"
                />
              ))}
            </div>

            <div className="hidden sm:block w-px h-5 bg-border-primary" />

            {/* Time range skeleton */}
            <div className="h-7 w-28 skeleton-shimmer rounded-md" />

            <div className="hidden sm:block w-px h-5 bg-border-primary" />

            {/* View controls skeleton */}
            <div className="flex items-center gap-2">
              <div className="h-7 w-14 skeleton-shimmer rounded-md" />
              <div className="size-7 skeleton-shimmer rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
