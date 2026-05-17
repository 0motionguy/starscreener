"use client";

// <InviteBanner /> — dismissible "earn early access" CTA (Chunk G).
//
// Mounted on `/you` (top of mainPanels for signed-in users) and as a
// one-shot post-watchlist-save nudge. Self-hosted dismissal: PATCH
// `/api/referrals/me` with `dismissedInviteBannerAt = now()` so the
// same user doesn't see it on the next page load.
//
// S3.B (2026-05-17): re-skinned with v4 tokens to match /you and now
// emits `referral_share_click` (event-name, not funnel-step) when the
// invite CTA is followed.
//
// Lightweight by design — no Radix, no Framer Motion. v4 design tokens.

import Link from "next/link";
import { useState } from "react";

import { toast } from "@/lib/toast";
import { getLoadedBrowserPostHog } from "@/lib/analytics/posthog-client";

interface InviteBannerProps {
  /**
   * Pre-existing dismissal stamp from the server. When provided, the
   * banner is hidden on initial render so the parent doesn't have to
   * conditionally mount us — we just early-return null.
   */
  dismissedAt?: string | null;
  /**
   * Optional caller hook to mutate any local state (e.g. /you's
   * `useProfile` query) after the dismiss PATCH lands. Optional so most
   * mount sites can stay simple.
   */
  onDismissed?: () => void;
}

export function InviteBanner({
  dismissedAt,
  onDismissed,
}: InviteBannerProps = {}) {
  const [hidden, setHidden] = useState(Boolean(dismissedAt));
  const [busy, setBusy] = useState(false);

  if (hidden) return null;

  async function dismiss() {
    setBusy(true);
    try {
      const res = await fetch("/api/referrals/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dismissedInviteBannerAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        // Soft-fail — we still hide locally so the user gets the
        // expected behaviour. Server retry on next visit is fine.
        console.warn("[InviteBanner] dismiss PATCH failed", res.status);
      }
      setHidden(true);
      onDismissed?.();
    } catch (err) {
      console.warn("[InviteBanner] dismiss network error", err);
      // Hide locally anyway — the user clicked dismiss.
      setHidden(true);
      onDismissed?.();
    } finally {
      setBusy(false);
    }
  }

  function copyAndCelebrate() {
    // Optional inline confirmation when the user clicks the CTA — the
    // /you/refer landing covers the actual flow, this is just a nudge.
    toast.info("Heading to your referral page");
    // S3.B — fire-and-forget product analytics. PostHog SDK may be
    // dormant (consent off, no token) — `getLoadedBrowserPostHog`
    // returns null and the capture quietly skips.
    try {
      getLoadedBrowserPostHog()?.capture("referral_share_click", {
        source: "invite_banner",
        surface: "/you",
      });
    } catch {
      // Analytics must never throw upstream.
    }
  }

  return (
    <div
      className="rounded-[4px] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
      style={{
        background: "var(--v4-bg-050)",
        border: "1px solid var(--v4-line-200)",
      }}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--v4-acc)" }}
        >
          {"// EARN EARLY ACCESS"}
        </div>
        <div
          className="text-sm leading-snug"
          style={{ color: "var(--v4-ink-100)" }}
        >
          Invite a friend to TrendingRepo. Badges + early access — no cash, no spam.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/you/refer"
          onClick={copyAndCelebrate}
          className="inline-flex items-center rounded-[3px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors"
          style={{
            background: "var(--v4-bg-075)",
            border: "1px solid var(--v4-line-200)",
            color: "var(--v4-acc)",
            fontWeight: 500,
          }}
        >
          INVITE FRIENDS →
        </Link>
        <button
          type="button"
          onClick={() => void dismiss()}
          disabled={busy}
          className="inline-flex items-center rounded-[3px] px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
          style={{
            background: "transparent",
            border: "1px solid var(--v4-line-200)",
            color: "var(--v4-ink-300)",
          }}
          aria-label="Dismiss invite banner"
        >
          {busy ? "…" : "DISMISS"}
        </button>
      </div>
    </div>
  );
}

export default InviteBanner;
