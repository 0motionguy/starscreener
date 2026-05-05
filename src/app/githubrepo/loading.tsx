// /githubrepo — loading skeleton mirroring page-head + 6-up MetricGrid + LiveTopTable.

export default function GithubRepoLoading() {
  return (
    <div className="home-surface" aria-hidden="true">
      <section className="page-head">
        <div className="animate-pulse space-y-2">
          <div
            className="h-3 w-48 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
          <div
            className="h-7 w-[28rem] max-w-full rounded-[2px]"
            style={{ background: "var(--v3-bg-100)" }}
          />
          <div
            className="h-3 w-96 max-w-full rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
        </div>
        <div className="clock animate-pulse">
          <div
            className="h-5 w-28 rounded-[2px]"
            style={{ background: "var(--v3-bg-100)" }}
          />
        </div>
      </section>

      <div className="animate-pulse grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
        ))}
      </div>

      <div className="animate-pulse space-y-2">
        <div
          className="h-4 w-40 rounded-[2px]"
          style={{ background: "var(--v3-bg-050)" }}
        />
        <div
          className="h-9 rounded-[2px]"
          style={{ background: "var(--v3-bg-050)" }}
        />
        <div className="space-y-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
