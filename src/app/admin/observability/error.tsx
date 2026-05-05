"use client";

type AdminObservabilityErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminObservabilityError({
  error,
  reset,
}: AdminObservabilityErrorProps) {
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
        Observability page failed to render
      </h1>
      <p className="mt-3 text-[13px]" style={{ color: "var(--v3-ink-300)" }}>
        {error.message || "Unexpected route error."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="v2-mono mt-4 rounded-[2px] border px-3 py-2 text-[11px] tracking-[0.14em] uppercase"
        style={{
          borderColor: "var(--v3-line-200)",
          color: "var(--v3-ink-200)",
          background: "var(--v3-bg-050)",
        }}
      >
        Retry render
      </button>
    </main>
  );
}
