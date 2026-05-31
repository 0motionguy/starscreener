"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback } from "react";

import { useAuthGate } from "@/lib/auth/use-auth-gate";

interface AuthGateButtonProps {
  children: ReactNode;
  className?: string;
  title?: string;
  ariaLabel?: string;
  redirectUrl?: string;
  authenticatedHref?: string;
}

export function AuthGateButton({
  children,
  className,
  title,
  ariaLabel,
  redirectUrl,
  authenticatedHref,
}: AuthGateButtonProps) {
  const gate = useAuthGate();
  const router = useRouter();

  const onClick = useCallback(() => {
    gate.requireAuth(() => {
      if (authenticatedHref) router.push(authenticatedHref);
    }, redirectUrl);
  }, [authenticatedHref, gate, redirectUrl, router]);

  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
