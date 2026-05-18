export default function YouSettingsLoading() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 md:px-6 md:py-8">
      <div className="animate-pulse space-y-5">
        <div className="space-y-2">
          <div
            className="h-3 w-32 rounded-[2px]"
            style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
          />
          <div
            className="h-9 w-64 rounded-[2px]"
            style={{ background: "var(--v3-bg-100, var(--v4-bg-100))" }}
          />
          <div
            className="h-4 w-80 rounded-[2px]"
            style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
          />
        </div>
        <div
          className="h-56 rounded-[2px]"
          style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
        />
        <div
          className="h-24 rounded-[2px]"
          style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
        />
        <div
          className="h-40 rounded-[2px]"
          style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
        />
      </div>
    </div>
  );
}
