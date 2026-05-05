export default function BriefLoading() {
  return (
    <main className="home-surface" style={{ paddingTop: 24, paddingBottom: 32 }}>
      <section className="panel" style={{ padding: 24 }}>
        <div className="skeleton-shimmer h-3 w-32 rounded-[2px]" />
        <div className="mt-3 skeleton-shimmer h-8 w-[260px] max-w-full rounded-[2px]" />
        <div className="mt-6 grid gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-4 w-full rounded-[2px]" />
          ))}
        </div>
      </section>
    </main>
  );
}
