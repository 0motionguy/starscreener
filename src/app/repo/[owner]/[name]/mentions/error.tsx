"use client";

export default function RepoMentionsError() {
  return (
    <main className="home-surface mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
      <section className="v2-card border border-border-primary bg-bg-secondary p-5">
        <h1 className="text-lg font-semibold text-text-primary">Mentions page unavailable</h1>
        <p className="mt-2 text-sm text-text-secondary">
          The mentions data could not be loaded right now. Retry in a moment.
        </p>
      </section>
    </main>
  );
}

