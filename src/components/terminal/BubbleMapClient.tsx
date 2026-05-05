"use client";

// Client-side wrapper for BubbleMap (AGN-710).
//
// Next 15 forbids `dynamic({ ssr: false })` inside server components, so the
// dynamic import lives here (a client component). The home page server
// component imports this wrapper directly. The skeleton reserves the same
// 360px-tall slot to keep CLS at zero when the canvas hydrates in.

import dynamic from "next/dynamic";
import type { Repo } from "@/lib/types";

const BubbleMap = dynamic(
  () => import("./BubbleMap").then((m) => ({ default: m.BubbleMap })),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden="true"
        style={{
          width: "100%",
          height: 360,
          background: "var(--v2-bg-000, transparent)",
          borderRadius: 8,
        }}
      />
    ),
  },
);

export interface BubbleMapClientProps {
  repos: Repo[];
  limit?: number;
}

export function BubbleMapClient(props: BubbleMapClientProps) {
  return <BubbleMap {...props} />;
}
