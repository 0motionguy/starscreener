"use client";

// <CheckoutSuccess /> — S5.A.6 post-checkout success surface.
//
// Mounted from /pricing/page.tsx when ?checkout=success is in the URL.
// Polls /api/auth/session every 1.5s for up to 30s waiting for the user's
// tier to flip from "free" → "pro" / "team". Stripe's webhook usually
// delivers within 1-2s, so the wait is normally invisible.
//
// On flip: terminal-aesthetic confirmation + "Create next alert" +
// "Manage billing" buttons. No confetti — matches the rest of the
// product's restrained chrome.
//
// On timeout (30s without flip): "Payment recorded — your tier will
// activate shortly. Refresh if it doesn't appear in 1 minute." This
// covers the very unlikely race where the webhook is delayed (Stripe
// SLA is best-effort, not real-time).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { captureFunnelStep } from "@/lib/analytics/funnel";
import { getLoadedBrowserPostHog } from "@/lib/analytics/posthog-client";

interface SessionProbeResponse {
  ok: boolean;
  tier?: string;
  tierExpiresAt?: string | null;
}

type FlipState =
  | { kind: "waiting"; pollsAttempted: number }
  | { kind: "flipped"; tier: "pro" | "team"; expiresAt: string | null }
  | { kind: "timeout" };

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 20; // 20 * 1.5s = 30s ceiling.

function isPaidTier(tier: string | undefined): tier is "pro" | "team" {
  return tier === "pro" || tier === "team";
}

function formatRenewalDate(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CheckoutSuccess({ sessionId }: { sessionId?: string }) {
  const [state, setState] = useState<FlipState>({
    kind: "waiting",
    pollsAttempted: 0,
  });
  // Track whether we've already fired the funnel event so a re-render
  // doesn't double-capture.
  const fundedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    async function poll() {
      if (cancelled) return;
      attempt += 1;
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
        });
        const body = (await res.json().catch(() => null)) as
          | SessionProbeResponse
          | null;
        if (cancelled) return;
        if (body?.ok && isPaidTier(body.tier)) {
          setState({
            kind: "flipped",
            tier: body.tier,
            expiresAt: body.tierExpiresAt ?? null,
          });
          // Fire funnel event ONCE.
          if (!fundedRef.current) {
            fundedRef.current = true;
            try {
              getLoadedBrowserPostHog()?.capture("checkout_completed", {
                tier: body.tier,
                session_id: sessionId,
              });
            } catch {
              // analytics must never throw
            }
            // S5.B.5 — checkout_completed step in the revenue-loop funnel.
            captureFunnelStep({
              step: "checkout_completed",
              flow: "revenue-loop",
              tier: body.tier,
            });
          }
          return;
        }
        if (attempt >= POLL_MAX_ATTEMPTS) {
          setState({ kind: "timeout" });
          return;
        }
        setState({ kind: "waiting", pollsAttempted: attempt });
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        // Network failure — back off and retry once. If we hit the
        // attempt ceiling, downgrade to timeout.
        if (attempt >= POLL_MAX_ATTEMPTS) {
          setState({ kind: "timeout" });
          return;
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    // Start polling immediately.
    poll();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <section
      role="status"
      aria-live="polite"
      style={{
        maxWidth: 720,
        margin: "32px auto",
        padding: "20px 24px",
        border: "1px solid var(--v2-line-200, var(--v3-line-200))",
        background: "var(--v2-bg-050, var(--v3-bg-050))",
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--v2-ink-400, var(--v3-ink-400))",
        }}
      >
        {"// CHECKOUT · COMPLETE"}
      </span>

      {state.kind === "flipped" ? (
        <>
          <h2
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontSize: 28,
              fontWeight: 510,
              letterSpacing: "-0.018em",
              lineHeight: 1.1,
              margin: 0,
              color: "var(--v2-ink-000, var(--v3-ink-000))",
            }}
          >
            You&apos;re on {state.tier === "pro" ? "Pro" : "Team"}.
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "var(--v2-ink-200, var(--v3-ink-200))",
              margin: 0,
            }}
          >
            {state.expiresAt && formatRenewalDate(state.expiresAt)
              ? `Renews ${formatRenewalDate(state.expiresAt)}.`
              : "Subscription active."}{" "}
            Your new quota lights up on the next page load.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              paddingTop: 4,
            }}
          >
            <Link
              href="/you/alerts"
              className="v2-btn v2-btn-primary"
              style={{ minHeight: 38 }}
            >
              CREATE YOUR NEXT ALERT →
            </Link>
            <Link
              href="/you/settings"
              className="v2-btn v2-btn-ghost"
              style={{ minHeight: 38 }}
            >
              MANAGE BILLING
            </Link>
          </div>
        </>
      ) : state.kind === "timeout" ? (
        <>
          <h2
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontSize: 24,
              fontWeight: 510,
              letterSpacing: "-0.018em",
              lineHeight: 1.1,
              margin: 0,
              color: "var(--v2-ink-000, var(--v3-ink-000))",
            }}
          >
            Payment recorded.
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "var(--v2-ink-200, var(--v3-ink-200))",
              margin: 0,
            }}
          >
            Your tier will activate shortly. If it hasn&apos;t appeared in 60
            seconds, refresh the page or check{" "}
            <Link
              href="/you/settings"
              style={{ color: "var(--v2-acc, var(--v3-acc))" }}
            >
              /you/settings
            </Link>
            . If the issue persists, reply to your Stripe receipt and
            we&apos;ll fix it manually.
          </p>
        </>
      ) : (
        <>
          <h2
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontSize: 24,
              fontWeight: 510,
              letterSpacing: "-0.018em",
              lineHeight: 1.1,
              margin: 0,
              color: "var(--v2-ink-000, var(--v3-ink-000))",
            }}
          >
            Activating your subscription…
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "var(--v2-ink-200, var(--v3-ink-200))",
              margin: 0,
            }}
          >
            Confirming with Stripe (attempt {state.pollsAttempted + 1} of{" "}
            {POLL_MAX_ATTEMPTS}). This usually takes 1-2 seconds.
          </p>
        </>
      )}
    </section>
  );
}

export default CheckoutSuccess;
