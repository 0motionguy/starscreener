// /pricing - loading skeleton matching pricing layout density.

export default function PricingLoading() {
  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="animate-pulse space-y-8">
          <section className="space-y-3 border-b border-border-primary pb-8">
            <div className="h-9 w-52 rounded-sm bg-bg-secondary" />
            <div className="h-4 w-full max-w-3xl rounded-sm bg-bg-secondary" />
            <div className="h-4 w-3/4 max-w-2xl rounded-sm bg-bg-secondary" />
            <div className="h-8 w-52 rounded-sm bg-bg-secondary" />
          </section>
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-80 rounded-sm bg-bg-secondary" />
            ))}
          </section>
          <div className="h-72 rounded-sm bg-bg-secondary" />
          <div className="h-72 rounded-sm bg-bg-secondary" />
          <div className="h-64 rounded-sm bg-bg-secondary" />
        </div>
      </div>
    </main>
  );
}
