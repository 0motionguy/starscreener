"use client";

/**
 * SidebarSection — collapsible section wrapper.
 *
 * Header is a clickable button that toggles the `collapsed` state in
 * `useSidebarStore.collapsedSections` keyed by `id`. Body uses a CSS grid
 * `grid-template-rows: 0fr | 1fr` transition so collapse/expand animates
 * without measuring content height. When `maxHeightPx` is set the body
 * becomes independently scrollable (for the long categories list).
 */
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/lib/store";

export interface SidebarSectionProps {
  id: string;
  label: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  rightSlot?: ReactNode;
  maxHeightPx?: number;
}

export function SidebarSection({
  id,
  label,
  children,
  defaultCollapsed = false,
  rightSlot,
  maxHeightPx,
}: SidebarSectionProps) {
  const collapsed = useSidebarStore((s) => {
    const stored = s.collapsedSections[id];
    return stored === undefined ? defaultCollapsed : stored;
  });
  const toggleSection = useSidebarStore((s) => s.toggleSection);

  const headerId = `sidebar-section-header-${id}`;
  const bodyId = `sidebar-section-body-${id}`;

  return (
    <section className="border-b border-border-secondary last:border-b-0">
      <button
        type="button"
        id={headerId}
        onClick={() => toggleSection(id)}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        className={cn(
          "group w-full flex items-center justify-between",
          "px-3 pt-4 pb-2",
          "hover:bg-bg-card-hover transition-colors",
        )}
      >
        <span className="flex items-center gap-2">
          <ChevronDown
            className={cn(
              "w-3 h-3 text-text-tertiary shrink-0 transition-transform duration-200 motion-reduce:transition-none",
              collapsed ? "-rotate-90" : "rotate-0",
            )}
            strokeWidth={2.5}
            aria-hidden="true"
          />
          <span className="label-micro">{label}</span>
        </span>
        {rightSlot ? (
          <span onClick={(e) => e.stopPropagation()} className="flex items-center">
            {rightSlot}
          </span>
        ) : null}
      </button>

      <div
        id={bodyId}
        role="region"
        aria-labelledby={headerId}
        hidden={collapsed}
        style={maxHeightPx ? { maxHeight: `${maxHeightPx}px` } : undefined}
        className={cn(
          "pb-2",
          maxHeightPx ? "overflow-y-auto scrollbar-hide" : undefined,
        )}
      >
        {children}
      </div>
    </section>
  );
}
