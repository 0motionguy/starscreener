"use client";

// Client-side shim that lazy-loads `RepoDetailChart` so recharts (~100KB
// gzipped) isn't part of the initial JS shipped for /repo/[owner]/[name].
//
// The chart is the LAST section of the page — users almost always see the
// header, action row, stats, and mention feed before this bit comes into
// view. Splitting it off keeps the detail page's initial bundle lean
// without touching the protected RepoDetailChart component itself.

import dynamic from "next/dynamic";

import type { Repo } from "@/lib/types";
import type { MentionMarker } from "./MentionMarkerMeta";

const RepoDetailChart = dynamic(
  () =>
    import("./RepoDetailChart").then((m) => ({
      default: m.RepoDetailChart,
    })),
  {
    ssr: false,
    loading: () => (
      <section
        aria-label="Signal trend"
        className="skeleton-shimmer h-[380px] w-full"
        style={{ borderRadius: 2 }}
      />
    ),
  },
);

interface RepoDetailChartLazyProps {
  repo: Repo;
  markers: MentionMarker[];
}

export function RepoDetailChartLazy(
  props: RepoDetailChartLazyProps,
): React.ReactElement {
  return <RepoDetailChart {...props} />;
}

export default RepoDetailChartLazy;
