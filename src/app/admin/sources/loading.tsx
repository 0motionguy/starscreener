export default function AdminSourcesLoading() {
  return (
    <main className="mx-auto max-w-[1400px] px-6 py-10">
      <div className="skeleton-shimmer h-3 w-36 rounded-[2px]" />
      <div className="mt-3 skeleton-shimmer h-10 w-[340px] max-w-full rounded-[2px]" />
      <div className="mt-3 skeleton-shimmer h-4 w-[520px] max-w-full rounded-[2px]" />
      <div className="mt-8 grid gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer h-14 w-full rounded-card" />
        ))}
      </div>
    </main>
  );
}
