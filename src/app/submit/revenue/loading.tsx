// /submit/revenue - lightweight form loading shell.

export default function SubmitRevenueLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 md:py-10">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 rounded-sm bg-bg-secondary" />
        <div className="h-4 w-full rounded-sm bg-bg-secondary" />
        <div className="h-4 w-5/6 rounded-sm bg-bg-secondary" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-11 rounded-sm bg-bg-secondary" />
          ))}
        </div>
        <div className="h-11 w-40 rounded-sm bg-bg-secondary" />
      </div>
    </div>
  );
}
