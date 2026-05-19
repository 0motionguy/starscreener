"use client";

// StarScreener — Terminal empty state
//
// Centered block with an icon, heading, description, and an optional
// call-to-action link. Callers can customize every slot; the defaults
// cover the generic "no results" case.

import Link from "next/link";
import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

interface TerminalEmptyProps {
  title?: string;
  message?: string;
  cta?: { label: string; href: string };
  icon?: ReactNode;
  className?: string;
}

export function TerminalEmpty({
  title = "No repositories match",
  message = "Adjust your filters or clear the active meta to see more results.",
  cta,
  icon,
  className,
}: TerminalEmptyProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-border-primary bg-bg-card px-6 py-16 text-center",
        className,
      )}
    >
      <div className="mb-3 inline-flex size-10 items-center justify-center rounded-full bg-bg-tertiary text-text-tertiary">
        {icon ?? <Inbox size={20} strokeWidth={1.75} />}
      </div>
      <h3 className="font-display text-lg text-text-primary">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-text-tertiary">{message}</p>
      {cta ? (
        <Link
          href={cta.href}
          className={cn(
            "mt-4 inline-flex items-center gap-1.5 rounded-button border border-brand bg-brand px-3 py-1.5 text-[12px] font-semibold text-white",
            "transition-colors hover:bg-brand-hover",
          )}
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}
