"use client";

// TagsBar — narrow AI-focus tag chips (claude-code, agent-memory, ...).
//
// Sibling row to MetasBar. Each chip toggles `activeTag` in the filter store,
// which in turn sends `?tag=<id>` to /api/repos on the next fetch. Tags are
// additive to metaFilter so a user can see "breakouts" AND "claude-code"
// simultaneously.
//
// Counts are optional — when `counts` prop is passed, chip shows count badge.

import { useFilterStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { TAG_RULES } from "@/lib/pipeline/classification/tag-rules";

interface TagsBarProps {
  counts?: Record<string, number>;
}

export function TagsBar({ counts }: TagsBarProps) {
  const active = useFilterStore((s) => s.activeTag);
  const setActive = useFilterStore((s) => s.setActiveTag);

  return (
    <div
      className={cn(
        "flex gap-2",
        "overflow-x-auto scrollbar-hide snap-x",
        "md:flex-wrap md:overflow-visible",
      )}
      role="group"
      aria-label="AI focus tags"
    >
      {TAG_RULES.map((tag) => {
        const isActive = active === tag.tagId;
        const count = counts?.[tag.tagId];
        return (
          <button
            key={tag.tagId}
            type="button"
            onClick={() => setActive(isActive ? null : tag.tagId)}
            aria-pressed={isActive}
            title={tag.description}
            className={cn(
              "group shrink-0 snap-start",
              "inline-flex items-center gap-1.5",
              "h-6 px-2 rounded-full",
              "text-[11px] font-medium",
              "border transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              isActive
                ? "border-brand bg-brand-subtle text-brand"
                : "border-border-secondary bg-bg-secondary text-text-tertiary hover:border-brand/40 hover:text-text-secondary",
            )}
          >
            <span className="label-micro tracking-wide">#{tag.label}</span>
            {typeof count === "number" && (
              <span
                className={cn(
                  "font-mono text-[10px] px-1 rounded-full tabular-nums",
                  isActive ? "text-brand" : "text-text-tertiary",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
