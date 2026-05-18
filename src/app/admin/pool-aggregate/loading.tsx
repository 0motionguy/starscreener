export default function AdminPoolAggregateLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4 md:px-6 md:py-6">
      <div className="animate-pulse space-y-4">
        <div
          className="h-7 w-72 rounded-[2px]"
          style={{ background: "var(--v3-bg-100, var(--v4-bg-100))" }}
        />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-[2px]"
              style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
