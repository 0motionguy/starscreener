export default function AdminSourcesLoading() {
  return (
    <main className="mx-auto max-w-[1400px] px-6 py-10">
      <p
        className="v2-mono text-[10px] tracking-[0.22em] uppercase"
        style={{ color: "var(--v3-ink-400)" }}
      >
        Admin / Source SLA
      </p>
      <h1
        className="mt-1 text-[28px] leading-tight"
        style={{ color: "var(--v3-ink-100)" }}
      >
        Loading freshness state...
      </h1>
      <p className="mt-3 text-[13px]" style={{ color: "var(--v3-ink-300)" }}>
        Pulling per-source freshness budgets and writer metadata.
      </p>
    </main>
  );
}
