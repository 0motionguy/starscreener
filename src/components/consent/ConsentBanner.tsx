"use client";

// <ConsentBanner /> — S3.5.C GDPR / CCPA cookie consent surface.
//
// Bottom-anchored sticky banner shown when `tr_consent` cookie is
// absent. Two primary actions ("Accept all" / "Necessary only") plus
// a "Customize" toggle that exposes per-category checkboxes for the
// 1% of users who want to opt into analytics but not marketing or
// vice versa.
//
// SSR safety: returns null on the server and during the first client
// render. Only after `useEffect` runs and we've read the cookie do
// we decide whether to mount the banner. This keeps the server HTML
// identical to client HTML and avoids hydration warnings.
//
// PostHogProvider listens for `trendingrepo:consent-changed` and
// initialises (or stays dormant) based on the latest decision; this
// banner does NOT call posthog directly.

import { useEffect, useState } from "react";

import {
  CONSENT_COOKIE_NAME,
  readConsent,
  writeConsent,
} from "@/lib/consent/cookie";

export function ConsentBanner() {
  // mounted=true after the first useEffect tick. Until then we render
  // null so the server-rendered HTML matches the initial client paint.
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    setMounted(true);
    const decision = readConsent();
    if (decision === null) {
      const id = window.setTimeout(() => setShow(true), 4500);
      return () => window.clearTimeout(id);
    }
  }, []);

  if (!mounted || !show) return null;

  function persist(decision: { analytics: boolean; marketing: boolean }) {
    writeConsent(decision);
    setShow(false);
  }

  function handleAcceptAll() {
    persist({ analytics: true, marketing: true });
  }
  function handleNecessaryOnly() {
    persist({ analytics: false, marketing: false });
  }
  function handleSaveCustom() {
    persist({ analytics, marketing });
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      data-testid={CONSENT_COOKIE_NAME}
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 999,
        maxWidth: 560,
        margin: "0 auto",
        // 2026-06-11 (Wave C, unification) — design system v6 token migration
        // complete (per docs/DESIGN-SYSTEM); the v4 fallback chains were
        // broadcasting that the token table wasn't trusted. Now read v6
        // tokens directly. Mapping: v4-bg-050→surface-3, v4-line-200→border,
        // v4-ink-100→fg, v4-ink-200→fg-muted, v4-ink-300→fg-subtle,
        // v4-bg-075→surface, v4-acc→info.
        background: "var(--surface-3)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: 16,
        // shell.css DESIGN.md anti-pattern: no card drop-shadows. Surface elevation via luminance.
        color: "var(--fg)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: "var(--font-geist-mono), monospace",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontSize: 10,
            color: "var(--fg-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.16em",
          }}
        >
          {"// COOKIES"}
        </span>
        <span style={{ fontSize: 13, lineHeight: 1.45 }}>
          We use a minimal set of cookies to make the site work, plus optional
          analytics and marketing cookies to help us improve. You can change
          your choice anytime in your browser settings.
        </span>
      </div>

      {customizing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
            }}
          >
            <input
              type="checkbox"
              checked
              disabled
              aria-label="Necessary cookies always on"
            />
            <span>
              <b>Necessary</b> — login, session, security (always on)
            </span>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
            }}
          >
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
              aria-label="Analytics cookies"
            />
            <span>
              <b>Analytics</b> — anonymised usage events (PostHog)
            </span>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
            }}
          >
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              aria-label="Marketing cookies"
            />
            <span>
              <b>Marketing</b> — referrer attribution + remarketing
            </span>
          </label>
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "flex-end",
        }}
      >
        {!customizing ? (
          <button
            type="button"
            onClick={() => setCustomizing(true)}
            style={{
              fontFamily: "inherit",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
              padding: "6px 12px",
              borderRadius: 4,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              cursor: "pointer",
            }}
          >
            CUSTOMIZE
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleNecessaryOnly}
          style={{
            fontFamily: "inherit",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
            padding: "6px 12px",
            borderRadius: 4,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: "pointer",
          }}
        >
          NECESSARY ONLY
        </button>
        {customizing ? (
          <button
            type="button"
            onClick={handleSaveCustom}
            style={{
              fontFamily: "inherit",
              background: "var(--surface)",
              border: "1px solid var(--info)",
              color: "var(--info)",
              padding: "6px 12px",
              borderRadius: 4,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            SAVE CHOICES
          </button>
        ) : (
          <button
            type="button"
            onClick={handleAcceptAll}
            style={{
              fontFamily: "inherit",
              background: "var(--surface)",
              border: "1px solid var(--info)",
              color: "var(--info)",
              padding: "6px 12px",
              borderRadius: 4,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ACCEPT ALL
          </button>
        )}
      </div>
    </div>
  );
}

export default ConsentBanner;
