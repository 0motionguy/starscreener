import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "neutral"
  | "primary"
  | "ghost"
  | "chip"
  | "segment"
  | "dashed";

export type ButtonSize = "sm" | "md" | "lg" | "xl" | "format";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  statusDot?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "neutral",
      size = "md",
      active = false,
      statusDot = false,
      className,
      children,
      type = "button",
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "ds-button",
          `ds-button-${variant}`,
          `ds-button-${size}`,
          active && "is-active",
          className,
        )}
        {...props}
        aria-pressed={active ? true : props["aria-pressed"]}
      >
        {statusDot ? <span className="ds-button-dot" aria-hidden="true" /> : null}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
