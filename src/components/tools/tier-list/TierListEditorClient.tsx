// Client-only wrapper around TierListEditor.
//
// The editor's state lives in Zustand and hydrates from URL params on mount.
// The server doesn't have access to URL state at render time, so any URL
// derived from the store (TopSharePngButton href, SharePanel permalink /
// embed snippet, X-share text) diverges between SSR and first client paint.
// That mismatch trips React 19's hydration check.
//
// Wrapping the editor in a `next/dynamic` import with `ssr: false` skips the
// SSR pass entirely — server returns the skeleton below, client mounts the
// real editor once. No mismatch, no FOUC.
//
// /tools/tier-list and /tierlist both render this wrapper.

"use client";

import dynamic from "next/dynamic";

export const TierListEditor = dynamic(
  () =>
    import("./TierListEditor").then((m) => ({ default: m.TierListEditor })),
  {
    ssr: false,
    loading: TierListEditorSkeleton,
  },
);

function TierListEditorSkeleton() {
  return (
    <div className="tier-workbench tier-workbench--loading" aria-busy="true">
      <section className="panel tier-editor-panel">
        <div className="panel-head tier-editor-head">
          <span className="tier-editor-eyebrow">
            {"// TIER LIST · LOADING…"}
          </span>
        </div>
        <div
          className="tier-editor-skeleton"
          style={{
            padding: "32px 16px",
            color: "var(--fg-faint)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Mounting editor…
        </div>
      </section>
    </div>
  );
}
