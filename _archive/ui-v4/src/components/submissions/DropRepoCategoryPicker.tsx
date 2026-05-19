"use client";

/**
 * DropRepoCategoryPicker — 3-tile picker for the submission category
 * (REPO / SKILL / MCP). Operator-mockup 2026-05-15: each tile shows a
 * short type-badge ("code" / "claude" / "server") + the category name.
 *
 * Selected state uses the v4 accent wash + accent border so the choice
 * reads at the bottom-of-form glance. Hover lifts the border one step on
 * the line scale.
 */

import { cn } from "@/lib/utils";

export type DropRepoCategory = "repo" | "skill" | "mcp";

interface DropRepoCategoryPickerProps {
  value: DropRepoCategory | null;
  onChange: (next: DropRepoCategory) => void;
}

const ENTRIES: ReadonlyArray<{
  key: DropRepoCategory;
  label: string;
  badge: string;
  hint: string;
}> = [
  { key: "repo", label: "REPO", badge: "code", hint: "GitHub project" },
  { key: "skill", label: "SKILL", badge: "claude", hint: "Claude skill" },
  { key: "mcp", label: "MCP", badge: "server", hint: "MCP server" },
];

export function DropRepoCategoryPicker({
  value,
  onChange,
}: DropRepoCategoryPickerProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
      {ENTRIES.map((entry) => {
        const active = entry.key === value;
        return (
          <button
            type="button"
            key={entry.key}
            onClick={() => onChange(entry.key)}
            aria-pressed={active}
            className={cn(
              "flex min-w-0 flex-col items-start gap-1 rounded-card border px-3 py-2.5 text-left transition-colors",
              active ? "shadow-[0_0_0_1px_var(--v4-acc-soft)]" : "",
            )}
            style={{
              borderColor: active ? "var(--v4-acc)" : "var(--v4-line-200)",
              background: active ? "var(--v4-acc-wash)" : "var(--v4-bg-025)",
            }}
          >
            <span
              className="font-mono text-[9px] uppercase tracking-[0.18em]"
              style={{ color: active ? "var(--v4-acc)" : "var(--v4-ink-400)" }}
            >
              {entry.badge}
            </span>
            <span
              className="truncate text-sm font-semibold"
              style={{ color: "var(--v4-ink-100)" }}
            >
              {entry.label}
            </span>
            <span
              className="truncate text-[11px]"
              style={{ color: active ? "var(--v4-ink-200)" : "var(--v4-ink-300)" }}
            >
              {entry.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
