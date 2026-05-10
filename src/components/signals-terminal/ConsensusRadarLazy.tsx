"use client";

// Lazy-loaded Consensus radar so the chart island stays out of first paint.
//
// The radar is wrapped inside a <Card variant="panel">; the chart canvas
// itself renders at height={320} (see ConsensusRadar.tsx) plus card chrome.
// We size the skeleton at 320 to match the canvas height — the surrounding
// card header / body padding sit outside the dynamic boundary so they
// always render server-side.

import dynamic from "next/dynamic";

export const ConsensusRadarLazy = dynamic(
  () => import("./ConsensusRadar").then((m) => ({ default: m.ConsensusRadar })),
  {
    ssr: false,
    loading: () => (
      <div
        className="chart-skeleton"
        style={{ width: "100%", height: 320 }}
        aria-hidden
      />
    ),
  },
);

export default ConsensusRadarLazy;
