"use client";

// Client-island wrapper around the recharts sparkline. The detail page is a
// server component; routing the chart through `next/dynamic` with
// `ssr: false` keeps recharts (~100KB gzip) out of the SSR bundle and
// avoids hydration of an empty SVG when the parent decides to skip the
// chart entirely (cold-start placeholder path).

import dynamic from "next/dynamic";

import type { McpDownloadsHistoryPoint } from "@/lib/mcp-detail";

const McpDownloadsSparkline = dynamic(
  () =>
    import("./McpDownloadsSparkline").then((m) => ({
      default: m.McpDownloadsSparkline,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="skeleton-shimmer h-[160px] w-full rounded-card" />
    ),
  },
);

interface McpDownloadsSparklineLazyProps {
  points: McpDownloadsHistoryPoint[];
}

export function McpDownloadsSparklineLazy(
  props: McpDownloadsSparklineLazyProps,
): React.ReactElement {
  return <McpDownloadsSparkline {...props} />;
}

export default McpDownloadsSparklineLazy;
