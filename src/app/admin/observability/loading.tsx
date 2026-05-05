export default function AdminObservabilityLoading() {
  return (
    <main className="mx-auto max-w-[1400px] px-6 py-10">
      <p
        className="v2-mono text-[10px] tracking-[0.22em] uppercase"
        style={{ color: "var(--v3-ink-400)" }}
      >
        Admin / Observability
      </p>
      <h1
        className="mt-1 text-[28px] leading-tight"
        style={{ color: "var(--v3-ink-100)" }}
      >
        Loading observability surface...
      </h1>
      <p className="mt-3 text-[13px]" style={{ color: "var(--v3-ink-300)" }}>
        Pulling alert rules and health routing metadata.
      </p>
    </main>
  );
}
