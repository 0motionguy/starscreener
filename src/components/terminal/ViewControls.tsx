"use client";

import { useState } from "react";
import { Rows3, Settings2, StretchHorizontal } from "lucide-react";
import { useFilterStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Density } from "@/lib/types";
import { ColumnPicker } from "./ColumnPicker";

interface DensityOption {
  id: Density;
  label: string;
  Icon: typeof Rows3;
}

const DENSITY_OPTIONS: DensityOption[] = [
  { id: "compact", label: "Compact rows", Icon: Rows3 },
  { id: "spacious", label: "Spacious rows", Icon: StretchHorizontal },
];

/**
 * ViewControls — density toggle + column visibility gear.
 *
 * Right-hand cluster of the filter bar. The density toggle binds directly
 * to useFilterStore.density; the gear button opens ColumnPicker in a
 * floating popover anchored below the button.
 */
export function ViewControls() {
  const density = useFilterStore((s) => s.density);
  const setDensity = useFilterStore((s) => s.setDensity);

  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {/* Density toggle */}
      <div
        role="group"
        aria-label="Row density"
        className={cn(
          "flex items-center",
          "border border-border-primary rounded-md",
          "divide-x divide-border-primary overflow-hidden",
        )}
      >
        {DENSITY_OPTIONS.map((opt) => {
          const isActive = density === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={isActive}
              aria-label={opt.label}
              title={opt.label}
              onClick={() => setDensity(opt.id)}
              className={cn(
                "inline-flex items-center justify-center",
                "size-7",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-functional/40 focus-visible:z-10",
                isActive
                  ? "bg-functional-glow text-functional"
                  : "text-text-tertiary hover:text-text-primary hover:bg-bg-secondary",
              )}
            >
              <opt.Icon size={14} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* Column picker */}
      <div className="relative">
        <button
          type="button"
          aria-label="Configure columns"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((v) => !v)}
          className={cn(
            "inline-flex items-center justify-center size-7 rounded-md",
            "border border-border-primary text-text-tertiary",
            "transition-colors duration-150",
            "hover:text-text-primary hover:border-brand",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
            pickerOpen && "border-brand text-brand",
          )}
        >
          <Settings2 size={14} aria-hidden="true" />
        </button>

        {pickerOpen && <ColumnPicker onClose={() => setPickerOpen(false)} />}
      </div>
    </div>
  );
}
