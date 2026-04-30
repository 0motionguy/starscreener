import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface DataListProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
}

export function DataList({
  header,
  className,
  children,
  ...props
}: DataListProps) {
  return (
    <div className={cn("ds-list", className)} {...props}>
      {header ? <div className="ds-list-head">{header}</div> : null}
      <div className="ds-list-body">{children}</div>
    </div>
  );
}

export interface DataRowProps extends HTMLAttributes<HTMLDivElement> {
  first?: boolean;
}

export function DataRow({
  first = false,
  className,
  children,
  ...props
}: DataRowProps) {
  return (
    <div className={cn("ds-list-row", first && "first", className)} {...props}>
      {children}
    </div>
  );
}
