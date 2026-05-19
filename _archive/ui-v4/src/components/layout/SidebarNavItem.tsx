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
import { Badge as UiBadge } from "@/components/ui/Badge";

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
  disabled?: boolean;
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
  const tone =
    variant === "accent" ? "accent" : variant === "danger" ? "danger" : "neutral";
  return (
    <UiBadge
      tone={tone}
      size="xs"
      className="ml-auto shrink-0 tabular-nums"
    >
      {value}
    </UiBadge>
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
  disabled = false,
  accentColor,
  className,
}: SidebarNavItemProps) {
  const isActive = active && !disabled;
  const baseClass = cn(
    "nav relative w-full",
    isActive && "active",
    disabled && "cursor-not-allowed opacity-65",
    className,
  );

  const activeStyle = isActive && accentColor
    ? { borderLeftColor: accentColor }
    : undefined;

  const content = (
    <>
      <Icon
        className={cn(
          "ic shrink-0",
          disabled
            ? "text-[var(--ink-500)]"
            : isActive
              ? "text-[var(--acc)]"
              : "text-[var(--ink-300)]",
        )}
      />
      <span className="flex-1 truncate text-left">{label}</span>
      {badge !== undefined && badge !== null && badge !== "" && (
        <Badge value={badge} variant={badgeVariant} />
      )}
    </>
  );

  if (disabled) {
    return (
      <div aria-disabled="true" className={baseClass} style={activeStyle}>
        {content}
      </div>
    );
  }

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
