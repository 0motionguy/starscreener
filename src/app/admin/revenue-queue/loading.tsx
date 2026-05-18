export default function AdminRevenueQueueLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4 md:px-6 md:py-6">
      <div className="animate-pulse space-y-4">
        <div
          className="h-7 w-64 rounded-[2px]"
          style={{ background: "var(--v3-bg-100, var(--v4-bg-100))" }}
        />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-[2px]"
              style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
            />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-[2px]"
              style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
