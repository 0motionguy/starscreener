// RubricPopover — zero-JS click-to-reveal container.
//
// Wraps a <details>/<summary> so we can expose scoring rubrics (cross-signal
// breakdown, momentum tiers) without pulling in a popover library. Because
// it's pure HTML, the disclosure is keyboard-accessible (Enter/Space on the
// focused <summary>) out of the box and server-renders deterministically.
//
// Visual language matches the terminal aesthetic used elsewhere on the repo
// profile: a monospace chevron + uppercase-tracked label that flips state
// when the <details> is open. No runtime JS, no client directive.

import type { JSX, ReactNode } from "react";

interface RubricPopoverProps {
  /** Short disclosure label, rendered inside the <summary>. */
  summary: ReactNode;
  /** Rubric content revealed when the <details> is open. */
  children: ReactNode;
  /** Optional wrapper className override. */
  className?: string;
}

export function RubricPopover({
  summary,
  children,
  className,
}: RubricPopoverProps): JSX.Element {
  return (
    <details
      className={
        className ??
        "group rounded-md border border-border-primary/60 bg-bg-secondary/40 open:bg-bg-secondary/70"
      }
    >
      <summary
        className="cursor-pointer list-none select-none px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-tertiary hover:text-text-secondary focus:outline-none focus-visible:ring-1 focus-visible:ring-brand/60"
      >
        <span
          aria-hidden
          className="inline-block w-3 text-text-tertiary transition-transform group-open:rotate-90"
        >
          {">"}
        </span>
        <span className="ml-1">{summary}</span>
      </summary>
      <div className="border-t border-border-primary/50 px-2.5 py-2 text-[11px] leading-relaxed text-text-secondary">
        {children}
      </div>
    </details>
  );
}

export default RubricPopover;
