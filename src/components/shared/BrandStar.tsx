import type { CSSProperties, SVGProps } from "react";
import { cn } from "@/lib/utils";

interface BrandStarProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height" | "viewBox"> {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * TrendingRepo brand star mark used as the canonical "GitHub stars" glyph.
 */
export function BrandStar({ size = 12, className, style, ...svgProps }: BrandStarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 340 260"
      aria-hidden="true"
      className={cn("inline-block shrink-0 align-middle", className)}
      style={style}
      {...svgProps}
    >
      <path
        d="M137.214 61.225 L161.762 123.424 L301.652 88.012 L180.75 172.89 L195.993 242.126 L137.214 199.421 L78.436 242.126 L100.887 173.028 L42.109 130.323 L114.763 130.323 Z"
        fill="currentColor"
      />
    </svg>
  );
}
