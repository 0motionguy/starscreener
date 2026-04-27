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
          <button
            key={tag.tagId}
            type="button"
            onClick={() => setActive(isActive ? null : tag.tagId)}
            aria-pressed={isActive}
            title={tag.description}
            className={cn(
              "group shrink-0 snap-start",
              "inline-flex items-center gap-1.5",
              "h-6 px-2 rounded-[2px]",
              "font-mono uppercase tracking-[0.16em]",
              "text-[10px] font-medium",
              "border transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-1",
            )}
            style={{
              background: isActive ? "var(--v3-acc-soft)" : "var(--v3-bg-050)",
              borderColor: isActive
                ? "var(--v3-acc)"
                : "var(--v3-line-200)",
              color: isActive ? "var(--v3-acc)" : "var(--v3-ink-300)",
            }}
          >
            <span
              aria-hidden="true"
              className="shrink-0 size-1"
              style={{
                background: isActive ? "var(--v3-acc)" : "var(--v3-line-400)",
              }}
            />
            <span className="whitespace-nowrap">{tag.label}</span>
            {typeof count === "number" && (
              <span
                className="font-mono text-[10px] tabular-nums tracking-[0.12em] px-1 rounded-[1px]"
                style={{
                  color: isActive ? "var(--v3-acc)" : "var(--v3-ink-400)",
                  background: isActive
                    ? "var(--v3-acc-soft)"
                    : "var(--v3-bg-100)",
                }}
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
