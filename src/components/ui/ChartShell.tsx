import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ChartShellVariant =
  | "chart"
  | "map"
  | "matrix"
  | "heatmap"
  | "market"
  | "treemap";

export interface ChartShellProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "div";
  variant?: ChartShellVariant;
  children: ReactNode;
}

export function ChartShell({
  as: Component = "section",
  variant = "chart",
  className,
  children,
  ...props
}: ChartShellProps) {
  return (
    <Component
      className={cn("ds-chart-shell", `ds-chart-shell-${variant}`, className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface ChartWrapProps extends HTMLAttributes<HTMLDivElement> {
  variant?: ChartShellVariant;
  children: ReactNode;
}

export function ChartWrap({
  variant = "chart",
  className,
  children,
  ...props
}: ChartWrapProps) {
  return (
    <div
      className={cn("ds-chart-wrap", `${variant}-wrap`, className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface ChartLegendProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "map" | "matrix" | "market" | "chart";
  right?: ReactNode;
  children: ReactNode;
}

export function ChartLegend({
  variant = "chart",
  right,
  className,
  children,
  ...props
}: ChartLegendProps) {
  return (
    <div
      className={cn("ds-chart-legend", `${variant}-legend`, className)}
      {...props}
    >
      {children}
      {right ? <span className="right">{right}</span> : null}
    </div>
  );
}

export interface ChartStatsProps extends HTMLAttributes<HTMLDivElement> {
  columns?: 3 | 4 | 5 | 6;
  children: ReactNode;
}

export function ChartStats({
  columns = 4,
  className,
  children,
  ...props
}: ChartStatsProps) {
  return (
    <div
      className={cn("ds-chart-stats", "map-stats", "chart-stats", className)}
      style={{ "--chart-stat-columns": columns } as CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}

export interface ChartStatProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
}

export function ChartStat({
  label,
  value,
  sub,
  className,
  ...props
}: ChartStatProps) {
  return (
    <div className={cn("ds-chart-stat", className)} {...props}>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}
