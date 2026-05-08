"use client";

// Lazy-loaded agreement-matrix heatmap. The live AgreementMatrix renders
// the ECharts canvas at height={480} (see AgreementMatrix.tsx); we size the
// skeleton to match exactly so the consensus page's // 02 receipts band
// does not jump on hydration.
//
// AgreementMatrix is exported as a named export only (no default) — the
// dynamic import resolves the named export via the .then() shape below.

import dynamic from "next/dynamic";

export const AgreementMatrixLazy = dynamic(
  () =>
    import("./AgreementMatrix").then((m) => ({ default: m.AgreementMatrix })),
  {
    ssr: false,
    loading: () => (
      <div
        className="chart-skeleton"
        style={{ width: "100%", height: 480 }}
        aria-hidden
      />
    ),
  },
);

export default AgreementMatrixLazy;
