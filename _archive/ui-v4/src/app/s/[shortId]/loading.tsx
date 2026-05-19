// /s/[shortId] — shortlink resolver skeleton (brief flash before redirect).

export default function Loading() {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="animate-pulse space-y-3">
        <div className="h-7 bg-[var(--v4-bg-100)] rounded w-3/4 mx-auto" />
        <div className="h-32 bg-[var(--v4-bg-050)] rounded" />
        <div className="h-10 bg-[var(--v4-bg-100)] rounded" />
      </div>
    </div>
  );
}
