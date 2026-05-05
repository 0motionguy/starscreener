"use client";

import dynamicImport from "next/dynamic";

const TierListEditor = dynamicImport(
  () =>
    import("@/components/tier-list/TierListEditor").then((m) => ({
      default: m.TierListEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <section className="panel col-9 tier-editor-panel">
        <div className="panel-head">
          <span className="key">{"// Tier list"}</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="skeleton-shimmer h-10 w-full rounded-sm" />
          <div className="skeleton-shimmer h-12 w-full rounded-sm" />
          <div className="skeleton-shimmer h-64 w-full rounded-sm" />
        </div>
      </section>
    ),
  },
);

export function TierListEditorIsland() {
  return <TierListEditor />;
}
