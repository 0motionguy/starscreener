import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface FooterBarProps extends HTMLAttributes<HTMLElement> {
  as?: "footer" | "div";
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function FooterBar({
  as: Component = "footer",
  meta,
  actions,
  className,
  children,
  ...props
}: FooterBarProps) {
  return (
    <Component className={cn("ds-footer", "cat-foot", className)} {...props}>
      {children ?? (
        <>
          <span>{meta}</span>
          {actions ? <span className="right">{actions}</span> : null}
        </>
      )}
    </Component>
  );
}

export interface FooterLinkProps
  extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  external?: boolean;
  children: ReactNode;
}

export function FooterLink({
  href,
  external = false,
  className,
  children,
  ...props
}: FooterLinkProps) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("ds-footer-link", className)}
        {...props}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={cn("ds-footer-link", className)}>
      {children}
    </Link>
  );
}
