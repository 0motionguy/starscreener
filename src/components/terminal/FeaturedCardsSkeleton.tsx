"use client";

/**
 * Skeleton placeholder for the FeaturedCards horizontal row.
 * Renders 4 skeleton cards that match the real 280×160 (min-w-240) shape
 * so layout doesn't shift when the data resolves.
 */
export function FeaturedCardsSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex flex-col flex-shrink-0 min-w-[240px] sm:w-[280px] h-[160px] bg-bg-card border border-border-primary rounded-xl p-4 overflow-hidden"
          aria-hidden="true"
        >
          {/* Top label bar */}
          <div className="flex items-start justify-between">
            <div className="h-3 w-20 skeleton-shimmer rounded" />
            <div className="h-4 w-14 skeleton-shimmer rounded-badge" />
          </div>
          {/* Big number block */}
          <div className="mt-4 h-10 w-28 skeleton-shimmer rounded" />
          {/* Footer */}
          <div className="mt-auto space-y-1.5">
            <div className="h-3.5 w-36 skeleton-shimmer rounded" />
            <div className="h-3 w-44 skeleton-shimmer rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
