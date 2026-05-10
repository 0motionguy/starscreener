"use client";

import dynamic from "next/dynamic";

const GlobalShortcutsIsland = dynamic(
  () =>
    import("./GlobalShortcuts").then((m) => ({
      default: m.GlobalShortcuts,
    })),
  { ssr: false },
);

export function GlobalShortcutsLazy(): React.ReactElement {
  return <GlobalShortcutsIsland />;
}

export default GlobalShortcutsLazy;
