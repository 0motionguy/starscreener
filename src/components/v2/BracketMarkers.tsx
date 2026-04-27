// V2 design-system primitive — four-corner bracket markers around an active object.
// Wrap any element to declare it the focused object (Sentinel-style selection).
//
// Renders 4 small filled squares pinned to each corner. The wrapped element
// must establish its own positioning context if the brackets need to overflow.

import type { ReactNode } from "react";

type BracketMarkersProps = {
  children: ReactNode;
  active?: boolean;
  size?: number;
  color?: string;
  inset?: number;
  className?: string;
};

export function BracketMarkers({
  children,
  active = true,
  size = 8,
  color = "var(--v2-acc)",
  inset = -1,
  className = "",
}: BracketMarkersProps) {
  return (
    <div className={`relative ${className}`.trim()}>
      {children}
      {active ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{ width: size, height: size, top: inset, left: inset, background: color }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{ width: size, height: size, top: inset, right: inset, background: color }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{ width: size, height: size, bottom: inset, left: inset, background: color }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{ width: size, height: size, bottom: inset, right: inset, background: color }}
          />
        </>
      ) : null}
    </div>
  );
}
