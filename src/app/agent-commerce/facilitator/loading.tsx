export default function AgentCommerceFacilitatorLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4 md:px-6 md:py-6">
      <div className="animate-pulse space-y-5">
        <div className="space-y-2">
          <div
            className="h-9 w-full max-w-80 rounded-[2px]"
            style={{ background: "var(--v3-bg-100, var(--v4-bg-100))" }}
          />
          <div
            className="h-4 w-full max-w-96 rounded-[2px]"
            style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 rounded-[2px]"
              style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
