import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type CardVariant = "panel" | "feature" | "mini" | "tool";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  active?: boolean;
  children: ReactNode;
}

export function Card({
  variant = "panel",
  active = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "ds-card",
        `ds-card-${variant}`,
        active && "is-active",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  right?: ReactNode;
  showCorner?: boolean;
  children: ReactNode;
}

export function CardHeader({
  right,
  showCorner = false,
  className,
  children,
  ...props
}: CardHeaderProps) {
  return (
    <div className={cn("ds-card-head", className)} {...props}>
      {showCorner ? (
        <span className="corner" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      ) : null}
      <span className="key">{children}</span>
      {right ? <span className="right">{right}</span> : null}
    </div>
  );
}

export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardBody({ className, children, ...props }: CardBodyProps) {
  return (
    <div className={cn("ds-card-body", className)} {...props}>
      {children}
    </div>
  );
}
