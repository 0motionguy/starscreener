import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type MetricTone =
  | "neutral"
  | "accent"
  | "positive"
  | "negative"
  | "warning"
  | "consensus"
  | "early"
  | "divergence"
  | "external";

export interface MetricProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  tone?: MetricTone;
  pip?: boolean;
  live?: boolean;
}

export function Metric({
  label,
  value,
  sub,
  delta,
  tone = "neutral",
  pip = false,
  live = false,
  className,
  children,
  ...props
}: MetricProps) {
  return (
    <div
      className={cn("ds-metric", "kpi", `ds-metric-${tone}`, className)}
      {...props}
    >
      <div className={cn("lbl", live && "live")}>
        {pip ? <span className="pip" aria-hidden="true" /> : null}
        {label}
      </div>
      <div className="val">{value}</div>
      {delta ? <div className="delta up">{delta}</div> : null}
      {sub ? <div className="sub">{sub}</div> : null}
      {children}
    </div>
  );
}

export interface MetricGridProps extends HTMLAttributes<HTMLDivElement> {
  columns?: 4 | 5 | 6;
}

export function MetricGrid({
  columns = 6,
  className,
  children,
  ...props
}: MetricGridProps) {
  return (
    <div
      className={cn("ds-metric-grid", "kpi-strip", className)}
      style={{ "--metric-columns": columns } as CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}
