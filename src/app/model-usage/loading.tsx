import { TerminalSkeleton } from "@/components/terminal/TerminalSkeleton";

export default function ModelUsageLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <TerminalSkeleton rows={8} />
    </div>
  );
}
