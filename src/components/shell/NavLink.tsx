"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavLinkProps {
  href: string;
  children: ReactNode;
  /** Mark active when pathname === href or when pathname starts with href + "/". Pass `false` to disable auto-active. */
  match?: boolean | string;
  className?: string;
  count?: number | string;
  pill?: string;
  prefetch?: boolean;
}

export function NavLink({ href, children, match, className, count, pill, prefetch }: NavLinkProps) {
  const pathname = usePathname() || "/";
  let isActive = false;
  if (match === false) {
    isActive = false;
  } else if (typeof match === "string") {
    isActive = pathname === match || pathname.startsWith(match + "/");
  } else {
    isActive = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
  }

  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={`nav-link${isActive ? " active" : ""}${className ? " " + className : ""}`}
    >
      {children}
      {count !== undefined && <span className="nav-count">{count}</span>}
      {pill && <span className="nav-pill">{pill}</span>}
    </Link>
  );
}

/** Topbar hero-pillar variant — matches `.topbar-tab.is-<pillar>` markup. */
export function HeroPillarLink({
  href,
  pillar,
  children,
  match,
}: {
  href: string;
  pillar: "trending" | "ideas" | "build" | "signals";
  children: ReactNode;
  /** Match prefix for active state (e.g. `/repo` for trending). Default = href. */
  match?: string;
}) {
  const pathname = usePathname() || "/";
  const matchPath = match || href;
  const isActive =
    pathname === matchPath ||
    (matchPath !== "/" && pathname.startsWith(matchPath + "/"));

  return (
    <Link
      href={href}
      className={`topbar-tab is-${pillar}${isActive ? " active" : ""}`}
      data-pillar={pillar}
    >
      {children}
    </Link>
  );
}
