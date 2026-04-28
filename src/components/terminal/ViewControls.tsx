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
        className="flex items-center overflow-hidden"
        style={{
          border: "1px solid var(--v2-line-300)",
          borderRadius: 2,
        }}
      >
        {DENSITY_OPTIONS.map((opt, idx) => {
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
                "size-7 transition-colors duration-150",
                "focus-visible:outline-none focus-visible:z-10",
              )}
              style={{
                borderLeft:
                  idx > 0 ? "1px solid var(--v2-line-300)" : undefined,
                background: isActive ? "var(--v2-acc-soft)" : "transparent",
                color: isActive ? "var(--v2-acc)" : "var(--v2-ink-300)",
              }}
            >
              <opt.Icon size={13} aria-hidden="true" strokeWidth={1.75} />
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
            "inline-flex items-center justify-center size-7 transition-colors duration-150",
            "focus-visible:outline-none",
          )}
          style={{
            border: "1px solid",
            borderRadius: 2,
            borderColor: pickerOpen ? "var(--v2-acc)" : "var(--v2-line-300)",
            background: pickerOpen ? "var(--v2-acc-soft)" : "transparent",
            color: pickerOpen ? "var(--v2-acc)" : "var(--v2-ink-300)",
          }}
        >
          <Settings2 size={13} aria-hidden="true" strokeWidth={1.75} />
        </button>

        {pickerOpen && <ColumnPicker onClose={() => setPickerOpen(false)} />}
      </div>
    </div>
  );
}
