import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  ReactNode,
} from "react";

import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "positive"
  | "warning"
  | "danger"
  | "consensus"
  | "early"
  | "divergence"
  | "external"
  | "single"
  | "hot"
  | "new"
  | "firing";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: "xs" | "sm" | "md";
  dot?: boolean;
  dotClassName?: string;
  dotStyle?: CSSProperties;
  count?: ReactNode;
  active?: boolean;
}

export function Badge({
  tone = "neutral",
  size = "sm",
  dot = false,
  dotClassName,
  dotStyle,
  count,
  active = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "ds-badge",
        `ds-badge-${tone}`,
        `ds-badge-${size}`,
        active && "is-active",
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          className={cn("ds-badge-pip", dotClassName)}
          style={dotStyle}
          aria-hidden="true"
        />
      ) : null}
      <span className="ds-badge-label">{children}</span>
      {count !== undefined && count !== null ? (
        <span className="ds-badge-count">{count}</span>
      ) : null}
    </span>
  );
}

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: BadgeTone;
  active?: boolean;
  dot?: boolean;
  dotClassName?: string;
  dotStyle?: CSSProperties;
  count?: ReactNode;
}

export function Chip({
  tone = "neutral",
  active = false,
  dot = false,
  dotClassName,
  dotStyle,
  count,
  className,
  children,
  ...props
}: ChipProps) {
  return (
    <button
      type="button"
      className={cn(
        "ds-chip",
        `ds-badge-${tone}`,
        active && "is-active",
        className,
      )}
      aria-pressed={props["aria-pressed"] ?? (active ? true : undefined)}
      {...props}
    >
      {dot ? (
        <span
          className={cn("ds-badge-pip", dotClassName)}
          style={dotStyle}
          aria-hidden="true"
        />
      ) : null}
      <span className="ds-badge-label">{children}</span>
      {count !== undefined && count !== null ? (
        <span className="ds-badge-count">{count}</span>
      ) : null}
    </button>
  );
}
