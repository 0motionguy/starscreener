"use client";

import dynamic from "next/dynamic";

const SidebarFooterControlsIsland = dynamic(
  () =>
    import("./SidebarFooterControls").then((m) => ({
      default: m.SidebarFooterControls,
    })),
  {
    ssr: false,
    loading: () => <div aria-hidden className="h-[82px]" />,
  },
);

export function SidebarFooterControlsLazy(): React.ReactElement {
  return <SidebarFooterControlsIsland />;
}

export default SidebarFooterControlsLazy;
