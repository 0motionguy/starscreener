"use client";

// StarScreener — Column visibility picker
//
// Popover dropdown listing every column in ALL_COLUMNS as a checkbox.
// Required columns (rank + repo) are disabled. Provides Compact / Full
// preset buttons + a Reset-to-default button. Closes on Escape / outside
// click / explicit close button.

import { useEffect, useMemo, useRef } from "react";
import { Check, X } from "lucide-react";

import { ALL_COLUMNS, type ColumnId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useFilterStore } from "@/lib/store";

import { COLUMNS_BY_ID, REQUIRED_COLUMNS } from "./columns";

interface ColumnPickerProps {
  onClose: () => void;
}

export function ColumnPicker({ onClose }: ColumnPickerProps) {
  const visibleColumns = useFilterStore((s) => s.visibleColumns);
  const toggleColumn = useFilterStore((s) => s.toggleColumn);
  const setVisibleColumns = useFilterStore((s) => s.setVisibleColumns);
  const resetColumnsToDefault = useFilterStore(
    (s) => s.resetColumnsToDefault,
  );

  const ref = useRef<HTMLDivElement | null>(null);

  // Esc + outside click dismiss
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const visibleSet = useMemo(
    () => new Set(visibleColumns),
    [visibleColumns],
  );

  const compactPreset: ColumnId[] = useMemo(
    () =>
      ALL_COLUMNS.filter((id) => COLUMNS_BY_ID[id]?.compactVisible ?? false),
    [],
  );

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Configure columns"
      className={cn(
        "absolute right-2 top-full z-40 mt-2 w-72 rounded-card border border-border-primary bg-bg-card",
        "shadow-[var(--shadow-popover)]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-secondary px-3 py-2">
        <span className="label-section">Columns</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close column picker"
          className="inline-flex size-6 items-center justify-center rounded text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary"
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Preset buttons */}
      <div className="flex gap-1.5 border-b border-border-secondary px-3 py-2">
        <button
          type="button"
          onClick={() => setVisibleColumns(compactPreset)}
          className="flex-1 rounded border border-border-primary bg-bg-secondary px-2 py-1 text-[11px] text-text-secondary hover:border-functional hover:text-functional transition-colors"
        >
          Compact
        </button>
        <button
          type="button"
          onClick={() => setVisibleColumns([...ALL_COLUMNS])}
          className="flex-1 rounded border border-border-primary bg-bg-secondary px-2 py-1 text-[11px] text-text-secondary hover:border-functional hover:text-functional transition-colors"
        >
          Full
        </button>
        <button
          type="button"
          onClick={() => resetColumnsToDefault()}
          className="flex-1 rounded border border-border-primary bg-bg-secondary px-2 py-1 text-[11px] text-text-secondary hover:border-brand hover:text-brand transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Column list */}
      <ul
        role="listbox"
        aria-multiselectable="true"
        className="max-h-80 overflow-y-auto py-1"
      >
        {ALL_COLUMNS.map((id) => {
          const col = COLUMNS_BY_ID[id];
          if (!col) return null;
          const isChecked = visibleSet.has(id);
          const isRequired = REQUIRED_COLUMNS.includes(id);
          return (
            <li key={id}>
              <button
                type="button"
                role="option"
                aria-selected={isChecked}
                disabled={isRequired}
                onClick={() => toggleColumn(id)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors",
                  isRequired
                    ? "cursor-not-allowed text-text-muted"
                    : "text-text-secondary hover:bg-bg-row-hover hover:text-text-primary",
                )}
                title={col.description}
              >
                <span
                  className={cn(
                    "inline-flex size-4 shrink-0 items-center justify-center rounded border",
                    isChecked
                      ? "border-functional bg-functional text-bg-primary"
                      : "border-border-strong bg-transparent",
                  )}
                  aria-hidden="true"
                >
                  {isChecked ? (
                    <Check
                      size={11}
                      strokeWidth={3}
                      className="text-bg-primary"
                    />
                  ) : null}
                </span>
                <span className="flex-1 truncate">
                  {col.label || id.toUpperCase()}
                </span>
                {isRequired ? (
                  <span className="label-micro shrink-0 text-text-muted">
                    required
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
