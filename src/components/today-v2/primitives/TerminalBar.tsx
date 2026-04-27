// Terminal-bar chrome — Node/01 motif. Sits above any data card to make
// the surface read like a live shell: three dot indicators (one filled
// orange = "live"), a monospace caption, and a right-aligned status.

import type { ReactNode } from "react";

interface TerminalBarProps {
  /** Caption left of the bar — already prefixed with `// ` upstream if desired. */
  label: ReactNode;
  /** Right-aligned status (e.g. "EU-CENTRAL-1 · 14ms" or "220 ROWS"). */
  status?: ReactNode;
  /** Number of dot indicators. First dot is "live" (animated). Default 3. */
  dots?: number;
}

export function TerminalBar({ label, status, dots = 3 }: TerminalBarProps) {
  return (
    <div className="v2-term-bar">
      <span className="v2-dots" aria-hidden>
        {Array.from({ length: dots }).map((_, i) => (
          <i key={i} className={i === 0 ? "live" : ""} />
        ))}
      </span>
      <span>{label}</span>
      {status ? <span className="v2-status">{status}</span> : null}
    </div>
  );
}
