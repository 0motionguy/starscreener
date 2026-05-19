import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  wrapperClassName?: string;
  inputClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      leftIcon,
      rightSlot,
      wrapperClassName,
      inputClassName,
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        className={cn(
          "ds-input-wrap",
          Boolean(leftIcon) && "has-left-icon",
          Boolean(rightSlot) && "has-right-slot",
          wrapperClassName,
        )}
      >
        {leftIcon ? (
          <span className="ds-input-icon" aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          className={cn("ds-input", inputClassName, className)}
          {...props}
        />
        {rightSlot ? <span className="ds-input-slot">{rightSlot}</span> : null}
      </div>
    );
  },
);

Input.displayName = "Input";
