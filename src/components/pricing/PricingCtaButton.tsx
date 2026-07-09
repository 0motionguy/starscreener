"use client";

// <PricingCtaButton /> — S3.C client wrapper for the PricingCard footer.
//
// For paid tiers (`pro`, `team`) the CTA opens `<CheckoutWalkthrough />`
// which POSTs /api/checkout/stripe. This is ON BY DEFAULT: the old
// build-time `NEXT_PUBLIC_CHECKOUT_WALKTHROUGH === "1"` opt-in was set in
// no build config anywhere, which silently shipped dead `/pricing#pro`
// anchors on the paid CTAs in every default build. The explicit
// kill-switch is now the inverse — set
// `NEXT_PUBLIC_CHECKOUT_WALKTHROUGH=0` to fall back to the legacy
// anchors (e.g. while Stripe envs are being rotated). The flag is inlined
// at build time per the NEXT_PUBLIC_ contract.
//
// For all other tiers (`free` link to home, `enterprise` mailto) the
// original anchor is preserved.

import Link from "next/link";
import { useState, type ReactNode } from "react";

import type { BillingCadence, TierDefinition } from "@/lib/pricing/tiers";
import { CheckoutWalkthrough } from "./CheckoutWalkthrough";

interface PricingCtaButtonProps {
  tier: TierDefinition;
  cadence: BillingCadence;
  className: string;
  children: ReactNode;
}

const WALKTHROUGH_DISABLED =
  process.env.NEXT_PUBLIC_CHECKOUT_WALKTHROUGH === "0";

function isPaidTier(tier: TierDefinition): boolean {
  return tier.key === "pro" || tier.key === "team";
}

export function PricingCtaButton({
  tier,
  cadence,
  className,
  children,
}: PricingCtaButtonProps) {
  const [open, setOpen] = useState(false);

  if (WALKTHROUGH_DISABLED || !isPaidTier(tier)) {
    // Legacy passthrough — internal vs external decides Link vs anchor,
    // mirroring the original PricingCard footer logic.
    if (tier.ctaHref.startsWith("/")) {
      return (
        <Link
          href={tier.ctaHref}
          className={className}
          style={{ minHeight: 42 }}
        >
          {children}
        </Link>
      );
    }
    return (
      <a href={tier.ctaHref} className={className} style={{ minHeight: 42 }}>
        {children}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        style={{ minHeight: 42, cursor: "pointer" }}
      >
        {children}
      </button>
      <CheckoutWalkthrough
        tier={tier}
        cadence={cadence}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export default PricingCtaButton;
