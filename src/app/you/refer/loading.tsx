export default function YouReferLoading() {
  return (
    <div className="mx-auto max-w-[800px] px-4 py-6 md:px-6 md:py-8">
      <div className="animate-pulse space-y-5">
        <div className="space-y-2">
          <div
            className="h-9 w-72 rounded-[2px]"
            style={{ background: "var(--v3-bg-100, var(--v4-bg-100))" }}
          />
          <div
            className="h-4 w-96 rounded-[2px]"
            style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
          />
        </div>
        <div
          className="h-32 rounded-[2px]"
          style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-[2px]"
              style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
