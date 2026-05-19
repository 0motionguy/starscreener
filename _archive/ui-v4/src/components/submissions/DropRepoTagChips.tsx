"use client";

/**
 * DropRepoTagChips — 12-chip strip for the submission tag set. Max
 * `maxSelected` selected at once (operator mockup: 4). When the cap is
 * reached a v4-amber "max" chip surfaces inline so the user understands
 * why further taps don't register without scrolling back to the field
 * label counter.
 */

import { cn } from "@/lib/utils";

export type DropRepoTag =
  | "AGENTS"
  | "RAG"
  | "EVAL"
  | "VECTOR"
  | "CLI"
  | "FINETUNE"
  | "FRAMEWORK"
  | "INFERENCE"
  | "DATA"
  | "VISION"
  | "VOICE"
  | "CODEGEN";

export const DROP_REPO_TAGS: ReadonlyArray<DropRepoTag> = [
  "AGENTS",
  "RAG",
  "EVAL",
  "VECTOR",
  "CLI",
  "FINETUNE",
  "FRAMEWORK",
  "INFERENCE",
  "DATA",
  "VISION",
  "VOICE",
  "CODEGEN",
];

interface DropRepoTagChipsProps {
  value: ReadonlySet<DropRepoTag>;
  onChange: (next: Set<DropRepoTag>) => void;
  maxSelected?: number;
}

export function DropRepoTagChips({
  value,
  onChange,
  maxSelected = 4,
}: DropRepoTagChipsProps) {
  const atCap = value.size >= maxSelected;

  function toggle(tag: DropRepoTag) {
    const next = new Set(value);
    if (next.has(tag)) {
      next.delete(tag);
    } else if (next.size < maxSelected) {
      next.add(tag);
    } else {
      return;
    }
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {DROP_REPO_TAGS.map((tag) => {
        const active = value.has(tag);
        const disabled = !active && atCap;
        return (
          <button
            type="button"
            key={tag}
            onClick={() => toggle(tag)}
            disabled={disabled}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
              active
                ? "border-brand bg-brand/10 text-text-primary"
                : "border-border-primary bg-bg-muted text-text-tertiary hover:text-text-primary",
              disabled && "cursor-not-allowed opacity-40 hover:text-text-tertiary",
            )}
          >
            {tag}
          </button>
        );
      })}
      {atCap && (
        <span
          aria-live="polite"
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{
            borderColor: "var(--v4-amber)",
            background: "var(--v4-amber-soft)",
            color: "var(--v4-amber)",
          }}
          title={`Max ${maxSelected} tags. Deselect one to add another.`}
        >
          Max {maxSelected}
        </span>
      )}
    </div>
  );
}
