// Root-level <Suspense> fallback. Every route segment inherits this
// unless it declares its own loading.tsx. Keeps the terminal chrome
// visible and shows a skeleton grid so navigation feels instant even
// when the underlying RSC stream hasn't resolved yet.

import { TerminalSkeleton } from "@/components/terminal/TerminalSkeleton";

export default function RootLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <TerminalSkeleton rows={10} />
    </div>
  );
}
