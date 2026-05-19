"use client";

import { APP_VERSION } from "@/lib/app-meta";
import { AccentPicker } from "@/components/v3/AccentPicker";
import { BgThemePicker } from "@/components/v3/BgThemePicker";
import { SystemBarcode } from "@/components/v3/SystemBarcode";

export function SidebarFooterControls(): React.ReactElement {
  return (
    <>
      <BgThemePicker compact />
      <AccentPicker compact />
      <SystemBarcode
        label="// PROD"
        value={`v${APP_VERSION}`}
        bars={18}
        height={18}
      />
    </>
  );
}

export default SidebarFooterControls;
