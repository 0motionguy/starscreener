// /u/[handle] — V4 W9 ProfileTemplate skeleton.

export default function UserProfileLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="animate-pulse space-y-4">
        <div className="flex items-start gap-3">
          <div
            className="h-14 w-14 rounded-full"
            style={{ background: "var(--v3-bg-100)" }}
          />
          <div className="flex flex-col gap-1.5 flex-1">
            <div
              className="h-3 w-32 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
            <div
              className="h-7 w-72 rounded-[2px]"
              style={{ background: "var(--v3-bg-100)" }}
            />
            <div
              className="h-3 w-96 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
