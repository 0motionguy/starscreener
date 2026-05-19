"use client";

import dynamic from "next/dynamic";

const BrowserAlertBridgeIsland = dynamic(
  () =>
    import("./BrowserAlertBridge").then((m) => ({
      default: m.BrowserAlertBridge,
    })),
  { ssr: false },
);

export function BrowserAlertBridgeLazy(): React.ReactElement {
  return <BrowserAlertBridgeIsland />;
}

export default BrowserAlertBridgeLazy;
