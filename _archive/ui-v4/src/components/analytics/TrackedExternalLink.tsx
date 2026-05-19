"use client";

// AGN-848 — Thin <a> wrapper that fires a `funnel_step` capture before
// the browser opens the new tab. Used by the server-rendered repo-detail
// surfaces that link out to GitHub but don't already own a client
// onClick handler. The render result is identical to a plain anchor —
// only behaviour difference is the side-effect.

import { captureFunnelStep, type FunnelFlow, type FunnelStep } from "@/lib/analytics/funnel";

interface TrackedExternalLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  step: FunnelStep;
  flow: FunnelFlow;
  /** Flat properties the dashboard can break down on. */
  trackProps?: Record<string, string | number | boolean | undefined>;
  href: string;
  children: React.ReactNode;
}

export function TrackedExternalLink({
  step,
  flow,
  trackProps,
  onClick,
  href,
  children,
  target = "_blank",
  rel = "noopener noreferrer",
  ...rest
}: TrackedExternalLinkProps) {
  return (
    <a
      {...rest}
      href={href}
      target={target}
      rel={rel}
      onClick={(event) => {
        captureFunnelStep({ step, flow, ...(trackProps ?? {}) });
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}
