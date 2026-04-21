"use client";

/**
 * SidebarNavItem — generic nav row used by every sidebar section.
 *
 * Polymorphic: renders a Next <Link> when `href` is set, otherwise falls
 * back to a <button>. Accepts an optional trailing badge (string | number)
 * and an active state that flips the text + icon color and paints a 2px
 * inset-left rail in the functional accent color.
 */
import Link from "next/link";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * Any React icon component that accepts `className` + optional `size`.
 * Wide enough to cover Lucide icons (stroke-based) AND the BrandIcons
 * family (fill-based SVGs with `currentColor` in monochrome mode), so
 * sidebar rows can mix the two without an adapter layer.
 */
export type SidebarIconComponent = ComponentType<{
  className?: string;
  size?: number;
}>;

export interface SidebarNavItemProps {
  href?: string;
  onClick?: () => void;
  icon: SidebarIconComponent;
  label: string;
  badge?: string | number;
  badgeVariant?: "default" | "accent" | "danger";
  active?: boolean;
  /** Optional override — paints a different inset-left rail color. */
  accentColor?: string;
  className?: string;
}

function Badge({
  value,
  variant = "default",
}: {
  value: string | number;
  variant?: "default" | "accent" | "danger";
}) {
  const variantClass =
    variant === "accent"
      ? "bg-functional-glow text-functional"
      : variant === "danger"
        ? "bg-down-bg text-down"
        : "bg-bg-tertiary text-text-tertiary";
  return (
    <span
      className={cn(
        "ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full tabular-nums shrink-0",
        variantClass,
      )}
    >
      {value}
    </span>
  );
}

export function SidebarNavItem({
  href,
  onClick,
  icon: Icon,
  label,
  badge,
  badgeVariant = "default",
  active = false,
  accentColor,
  className,
}: SidebarNavItemProps) {
  const baseClass = cn(
    "relative w-full h-9 flex items-center gap-2.5 pl-3 pr-2",
    "text-[13px] font-medium",
    "transition-colors duration-150",
    active
      ? "bg-functional-subtle text-functional"
      : "text-text-secondary hover:bg-bg-card-hover",
    className,
  );

  const activeStyle =
    active && accentColor
      ? { boxShadow: `inset 2px 0 0 ${accentColor}` }
      : active
        ? { boxShadow: "inset 2px 0 0 var(--color-functional)" }
        : undefined;

  const content = (
    <>
      <Icon
        className={cn(
          "w-4 h-4 shrink-0",
          active ? "text-functional" : "text-text-tertiary",
        )}
      />
      <span className="flex-1 truncate text-left">{label}</span>
      {badge !== undefined && badge !== null && badge !== "" && (
        <Badge value={badge} variant={badgeVariant} />
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={baseClass} style={activeStyle}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={baseClass} style={activeStyle}>
      {content}
    </button>
  );
}
