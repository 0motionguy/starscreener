"use client";

// <PricingCtaButton /> — S3.C client wrapper for the PricingCard footer.
//
// For paid tiers (`pro`, `team`) the CTA opens `<CheckoutWalkthrough />`
// instead of navigating to the placeholder `/pricing#pro` anchor that
// existed before this PR. For all other tiers (`free` link to home,
// `enterprise` mailto) the original anchor is preserved so the page
// behaviour for those tiers is unchanged.
//
// Operator kill-switch: set `NEXT_PUBLIC_CHECKOUT_WALKTHROUGH=0` (or
// unset) and paid tiers fall back to the legacy anchor. The flag is
// inlined at build time per the NEXT_PUBLIC_ contract.

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

const WALKTHROUGH_FLAG_ON =
  process.env.NEXT_PUBLIC_CHECKOUT_WALKTHROUGH === "1";

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

  if (!WALKTHROUGH_FLAG_ON || !isPaidTier(tier)) {
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
