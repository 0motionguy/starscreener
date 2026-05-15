"use client";

/**
 * DropRepoCategoryPicker — 3-tile picker for the submission category
 * (REPO / SKILL / MCP). Operator-mockup 2026-05-15: each tile shows a
 * short type-badge ("code" / "claude" / "server") + the category name.
 *
 * Selection is presentational only at the moment — the
 * `/api/repo-submissions` schema doesn't accept a category field yet.
 * Operator extension of the API schema is the unblocking next step.
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
    <div className="grid grid-cols-3 gap-2">
      {ENTRIES.map((entry) => {
        const active = entry.key === value;
        return (
          <button
            type="button"
            key={entry.key}
            onClick={() => onChange(entry.key)}
            aria-pressed={active}
            className={cn(
              "flex flex-col items-start gap-1 rounded-card border px-3 py-2.5 text-left transition-colors",
              active ? "border-brand bg-brand/5" : "border-border-primary bg-bg-secondary hover:border-border-strong",
            )}
          >
            <span
              className="font-mono text-[9px] uppercase tracking-[0.18em]"
              style={{ color: active ? "var(--v3-acc)" : "var(--text-muted)" }}
            >
              {entry.badge}
            </span>
            <span className="text-sm font-semibold text-text-primary">
              {entry.label}
            </span>
            <span className="text-[11px] text-text-tertiary">{entry.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
