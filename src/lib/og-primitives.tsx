// StarScreener — shared primitives for ImageResponse OG cards
//
// ImageResponse tries to fetch Noto Sans glyphs for any character outside the
// default Latin subset — including ★ and ●. Those fetches hit Google Fonts
// and 400 on unrecognised glyph subsets, so we render the shapes as inline
// SVG instead. Same visual, no external font calls.

import type { ReactElement } from "react";

interface StarProps {
  size: number;
  color: string;
}

/** Five-point filled star, rendered as inline SVG. */
export function StarMark({ size, color }: StarProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "flex" }}
    >
      <path
        d="M12 2l2.9 6.9L22 10l-5.5 4.5 1.9 7.5L12 18l-6.4 4 1.9-7.5L2 10l7.1-1.1L12 2z"
        fill={color}
      />
    </svg>
  );
}

/** Small filled dot — used for "live" indicator. */
export function Dot({ size, color }: StarProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "flex" }}
    >
      <circle cx="12" cy="12" r="10" fill={color} />
    </svg>
  );
}
