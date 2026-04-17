import { cn } from "@/lib/utils";

interface SkeletonProps {
  variant: "card" | "row" | "chart" | "detail";
  count?: number;
}

function Bone({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-card bg-bg-tertiary",
        className
      )}
    />
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-card border border-border-secondary bg-bg-card p-4 space-y-3">
      {/* Title row */}
      <div className="flex items-center gap-3">
        <Bone className="w-8 h-8 rounded-full shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Bone className="h-4 w-3/5" />
          <Bone className="h-3 w-2/5" />
        </div>
      </div>
      {/* Description */}
      <Bone className="h-3 w-full" />
      <Bone className="h-3 w-4/5" />
      {/* Sparkline area */}
      <Bone className="h-12 w-full" />
      {/* Stats row */}
      <div className="flex gap-3">
        <Bone className="h-5 w-16 rounded-badge" />
        <Bone className="h-5 w-12 rounded-badge" />
        <Bone className="h-5 w-14 rounded-badge" />
      </div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-border-secondary">
      <Bone className="w-6 h-4 shrink-0" />
      <Bone className="w-7 h-7 rounded-full shrink-0" />
      <Bone className="h-4 w-32" />
      <Bone className="h-3 w-48 hidden sm:block" />
      <div className="flex-1" />
      <Bone className="h-4 w-16" />
      <Bone className="h-4 w-12" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-card border border-border-secondary bg-bg-card p-4">
      <Bone className="h-64 w-full" />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header block */}
      <div className="flex items-center gap-4">
        <Bone className="w-14 h-14 rounded-card shrink-0" />
        <div className="flex-1 space-y-2">
          <Bone className="h-6 w-48" />
          <Bone className="h-4 w-72" />
        </div>
      </div>
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-card border border-border-secondary bg-bg-card p-3 space-y-2"
          >
            <Bone className="h-3 w-16" />
            <Bone className="h-6 w-24" />
          </div>
        ))}
      </div>
      {/* Chart block */}
      <Bone className="h-64 w-full rounded-card" />
    </div>
  );
}

const VARIANT_MAP = {
  card: CardSkeleton,
  row: RowSkeleton,
  chart: ChartSkeleton,
  detail: DetailSkeleton,
} as const;

export function Skeleton({ variant, count = 1 }: SkeletonProps) {
  const Component = VARIANT_MAP[variant];

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Component key={i} />
      ))}
    </>
  );
}
