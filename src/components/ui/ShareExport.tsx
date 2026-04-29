import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ShareExportPanelProps extends HTMLAttributes<HTMLElement> {
  as?: "aside" | "section" | "div";
  children: ReactNode;
}

export function ShareExportPanel({
  as: Component = "section",
  className,
  children,
  ...props
}: ShareExportPanelProps) {
  return (
    <Component className={cn("ds-share-panel", className)} {...props}>
      {children}
    </Component>
  );
}

export interface ShareExportHeadProps extends HTMLAttributes<HTMLDivElement> {
  right?: ReactNode;
  children: ReactNode;
}

export function ShareExportHead({
  right,
  className,
  children,
  ...props
}: ShareExportHeadProps) {
  return (
    <div className={cn("share-head", className)} {...props}>
      <span className="corner" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="key">{children}</span>
      {right ? <span className="right">{right}</span> : null}
    </div>
  );
}

export interface ShareFormatGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ShareFormatGrid({
  className,
  children,
  ...props
}: ShareFormatGridProps) {
  return (
    <div className={cn("share-fmt", className)} {...props}>
      {children}
    </div>
  );
}

export interface ShareFormatButtonProps
  extends HTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label: ReactNode;
  size?: ReactNode;
}

export function ShareFormatButton({
  active = false,
  label,
  size,
  className,
  ...props
}: ShareFormatButtonProps) {
  return (
    <button
      type="button"
      className={cn("b", active && "on", className)}
      aria-pressed={active}
      {...props}
    >
      {label}
      {size ? <span className="px">{size}</span> : null}
    </button>
  );
}

export interface ShareActionGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ShareActionGrid({
  className,
  children,
  ...props
}: ShareActionGridProps) {
  return (
    <div className={cn("share-actions", className)} {...props}>
      {children}
    </div>
  );
}

export interface ShareMetaBlockProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ShareMetaBlock({
  className,
  children,
  ...props
}: ShareMetaBlockProps) {
  return (
    <div className={cn("share-meta", className)} {...props}>
      {children}
    </div>
  );
}

export interface ShareMetaRowProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  children: ReactNode;
}

export function ShareMetaRow({
  label,
  className,
  children,
  ...props
}: ShareMetaRowProps) {
  return (
    <div className={cn("row", className)} {...props}>
      <span className="l">{label}</span>
      {children}
    </div>
  );
}

export interface ShareRowProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  heading: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function ShareRow({
  icon,
  heading,
  description,
  action,
  className,
  ...props
}: ShareRowProps) {
  return (
    <div className={cn("share-row", className)} {...props}>
      {icon ? <span className="ic">{icon}</span> : null}
      <span className="body">
        <span className="h">{heading}</span>
        {description ? <span className="d">{description}</span> : null}
      </span>
      {action ? <span className="ar">{action}</span> : null}
    </div>
  );
}
