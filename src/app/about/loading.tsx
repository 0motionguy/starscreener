// /about — static info page skeleton.

export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-[var(--v4-bg-100)] rounded w-1/2" />
        <div className="h-4 bg-[var(--v4-bg-050)] rounded w-full" />
        <div className="h-4 bg-[var(--v4-bg-050)] rounded w-5/6" />
        <div className="h-4 bg-[var(--v4-bg-050)] rounded w-4/5" />
        <div className="h-4 bg-[var(--v4-bg-050)] rounded w-full" />
      </div>
    </div>
  );
}
