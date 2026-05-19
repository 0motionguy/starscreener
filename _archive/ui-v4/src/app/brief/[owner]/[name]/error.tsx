"use client";

export default function BriefError({ reset }: { reset: () => void }) {
  return (
    <main className="home-surface" style={{ paddingTop: 24, paddingBottom: 32 }}>
      <section className="panel" style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0, fontSize: 22 }}>Brief unavailable</h1>
        <p style={{ color: "var(--v4-ink-300)" }}>
          The editorial brief failed to load. Try again.
        </p>
        <button type="button" onClick={reset} className="btn">
          Retry
        </button>
      </section>
    </main>
  );
}