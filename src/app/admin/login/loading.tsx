export default function AdminLoginLoading() {
  return (
    <div className="mx-auto max-w-md px-4 py-12 md:py-20">
      <div className="animate-pulse space-y-3">
        <div
          className="h-7 w-48 rounded-[2px]"
          style={{ background: "var(--v3-bg-100, var(--v4-bg-100))" }}
        />
        <div
          className="h-12 rounded-[2px]"
          style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
        />
        <div
          className="h-12 rounded-[2px]"
          style={{ background: "var(--v3-bg-050, var(--v4-bg-050))" }}
        />
        <div
          className="h-10 w-32 rounded-[2px]"
          style={{ background: "var(--v3-bg-075, var(--v4-bg-075))" }}
        />
      </div>
    </div>
  );
}
