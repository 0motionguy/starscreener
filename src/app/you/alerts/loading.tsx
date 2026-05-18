// /you/alerts — alert rule list skeleton. Mirrors the page chrome so the
// hand-off into real content has no layout shift.

export default function YouAlertsLoading() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
      <div className="animate-pulse space-y-5">
        {/* Header */}
        <div className="space-y-2">
          <div
            className="h-3 w-32 rounded-[2px]"
            style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
          />
          <div
            className="h-9 w-72 rounded-[2px]"
            style={{ background: "var(--v3-bg-100, var(--v4-bg-100))" }}
          />
          <div
            className="h-4 w-96 rounded-[2px]"
            style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
          />
        </div>

        {/* Add-rule CTA */}
        <div
          className="h-12 w-48 rounded-[2px]"
          style={{ background: "var(--v3-bg-075, var(--v4-bg-075))" }}
        />

        {/* Rule rows */}
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
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
