"use client";

// V3 AI-focus tag chips (claude-code, agent-memory, …).
//
// Sibling row to MetasBar. Each chip toggles `activeTag` in the filter
// store, sending `?tag=<id>` on the next /api/repos fetch. Tags are
// additive to metaFilter so a user can see "breakouts" AND "claude-code"
// together. When `counts` is supplied, each chip shows its tag count in
// a tabular-nums slot pinned to the right edge.

import { useFilterStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { TAG_RULES } from "@/lib/pipeline/classification/tag-rules";
import { Chip } from "@/components/ui/Badge";

interface TagsBarProps {
  counts?: Record<string, number>;
}

export function TagsBar({ counts }: TagsBarProps) {
  const active = useFilterStore((s) => s.activeTag);
  const setActive = useFilterStore((s) => s.setActiveTag);

  return (
    <div
      className={cn(
        "flex gap-1.5",
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
          <Chip
            key={tag.tagId}
            onClick={() => setActive(isActive ? null : tag.tagId)}
            aria-pressed={isActive}
            title={tag.description}
            active={isActive}
            dot
            count={typeof count === "number" ? count : undefined}
            className={cn(
              "group shrink-0 snap-start",
              "h-6 px-2 text-[10px]",
              "focus-visible:outline-none focus-visible:ring-1",
            )}
            style={{
              background: isActive ? "var(--v4-acc-soft)" : "var(--v4-bg-050)",
              borderColor: isActive
                ? "var(--v4-acc)"
                : "var(--v4-line-200)",
              color: isActive ? "var(--v4-acc)" : "var(--v4-ink-300)",
            }}
            dotStyle={{
              background: isActive ? "var(--v4-acc)" : "var(--v4-line-400)",
            }}
          >
            {tag.label}
          </Chip>
        );
      })}
    </div>
  );
}
