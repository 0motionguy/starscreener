"use client";

// Sticky tab strip for V2 — same IntersectionObserver wiring as the
// original TodayTabs, redressed in Node/01 vocabulary: flat mono labels
// with a 2px orange underline + bracket markers on the active tab.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "ideas", label: "IDEAS" },
  { id: "repos", label: "REPOS" },
  { id: "signals", label: "SIGNALS" },
  { id: "launch", label: "LAUNCH" },
] as const;

export function TabsV2() {
  const [active, setActive] = useState<string>("ideas");

  useEffect(() => {
    const els = TABS.map((t) => document.getElementById(t.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      {
        rootMargin: "-120px 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "sticky top-14 z-20",
        // Solid bg so this strip never bleeds with the dot-field below it.
        "bg-[color:var(--v2-bg-000)]/90 backdrop-blur",
        "border-b border-[color:var(--v2-line-100)]",
      )}
    >
      <div className="v2-frame py-3 flex items-center gap-1 overflow-x-auto scrollbar-hide">
        <span className="v2-mono mr-3 hidden sm:inline-flex">
          <span aria-hidden>{"// "}</span>
          NAV
        </span>
        <nav role="tablist" className="flex items-center gap-6">
          {TABS.map((tab) => {
            const isActive = active === tab.id;
            return (
              <a
                key={tab.id}
                href={`#${tab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "relative shrink-0 py-2 px-1 v2-mono",
                  "transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--v2-acc-glow)]",
                  isActive
                    ? "text-[color:var(--v2-ink-000)]"
                    : "text-[color:var(--v2-ink-300)] hover:text-[color:var(--v2-ink-100)]",
                )}
              >
                {tab.label}
                {/* Active indicator — 2px underline + corner brackets. */}
                {isActive ? (
                  <>
                    <span
                      aria-hidden
                      className="absolute left-0 right-0 -bottom-3 h-0.5"
                      style={{ background: "var(--v2-acc)" }}
                    />
                    <span
                      aria-hidden
                      className="absolute -left-1 -top-1 size-1.5"
                      style={{ background: "var(--v2-acc)" }}
                    />
                    <span
                      aria-hidden
                      className="absolute -right-1 -top-1 size-1.5"
                      style={{ background: "var(--v2-acc)" }}
                    />
                  </>
                ) : null}
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
