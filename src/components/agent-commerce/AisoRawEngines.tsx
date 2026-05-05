"use client";

// AGN-773 — [AISO-GAP-12] Cross-engine comparison view.
//
// Power users want to see the RAW per-engine prompt-test responses that
// feed into the synthesized AISO score. This component renders a collapsible
// <details> section listing each engine's question, answer-snippet, and
// citation flag. PostHog fires a `aiso_raw_engines_expanded` event the
// first time a user opens the panel on a given page (signal of value).
//
// Gating: this is a stub for the AISO-GAP-12 feature. The AC notes the
// view "may be paid-only". For now we gate behind the environment flag
// `NEXT_PUBLIC_AISO_RAW_ENGINES` (off by default) so the behaviour can
// flip without a deploy and without entangling with the paid-tier system
// before product decides. TODO: when the paid-tier story lands, replace
// the env-flag check with a `useUserTier()` gate (see
// src/lib/pricing/tiers.ts).
//
// Surface: rendered inside <AisoScanSection /> when the scan has at least
// one promptTest row. Server-side passes the raw promptTests array down;
// the component itself is a thin client island so we can attach the
// onToggle handler.

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";

import type { AisoToolsPromptTest } from "@/lib/aiso-tools";

interface AisoRawEnginesProps {
  promptTests: AisoToolsPromptTest[];
  /** Slug of the parent agent-commerce item — included on the PostHog event. */
  itemSlug: string;
}

export function AisoRawEngines({ promptTests, itemSlug }: AisoRawEnginesProps) {
  const [enabled, setEnabled] = useState(false);
  const fired = useRef(false);

  // Read the feature flag client-side so SSR + the initial paint stay
  // identical (avoids hydration mismatch when the flag is unset on the
  // server but a stale build leaks a different value into the client
  // bundle).
  useEffect(() => {
    setEnabled(process.env.NEXT_PUBLIC_AISO_RAW_ENGINES === "1");
  }, []);

  if (!enabled) return null;
  if (promptTests.length === 0) return null;

  const handleToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open) return;
    if (fired.current) return;
    fired.current = true;
    try {
      posthog.capture("aiso_raw_engines_expanded", {
        item_slug: itemSlug,
        engine_count: promptTests.length,
      });
    } catch {
      // analytics failure must never break the UI
    }
  };

  return (
    <details
      onToggle={handleToggle}
      style={{
        marginTop: 12,
        padding: "10px 12px",
        border: "1px solid var(--color-border, rgba(255,255,255,0.12))",
        borderRadius: 6,
        background: "var(--color-bg-soft, rgba(255,255,255,0.02))",
        fontFamily: "var(--font-mono, ui-monospace)",
        fontSize: 12,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--color-text-faint)",
          fontSize: 11,
        }}
      >
        Raw engine responses ({promptTests.length})
      </summary>
      <ul
        style={{
          margin: "12px 0 0",
          padding: 0,
          listStyle: "none",
          display: "grid",
          gap: 14,
        }}
      >
        {promptTests.map((test, idx) => (
          <li
            key={`${test.engine}-${idx}`}
            style={{
              display: "grid",
              gap: 4,
              paddingBottom: 10,
              borderBottom:
                idx === promptTests.length - 1
                  ? "none"
                  : "1px dashed var(--color-border, rgba(255,255,255,0.08))",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "baseline",
                color: "var(--color-text-default)",
              }}
            >
              <span
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                }}
              >
                {test.engine}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: test.cited
                    ? "var(--color-text-default)"
                    : "var(--color-text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {test.cited ? "[cited]" : "[not cited]"}
              </span>
              {test.brandMentioned ? (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--color-text-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  [brand]
                </span>
              ) : null}
            </div>
            <div style={{ color: "var(--color-text-faint)" }}>
              <span
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginRight: 6,
                }}
              >
                Q:
              </span>
              {test.prompt}
            </div>
            {test.snippet ? (
              <div style={{ color: "var(--color-text-default)" }}>
                <span
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginRight: 6,
                    color: "var(--color-text-faint)",
                  }}
                >
                  A:
                </span>
                {test.snippet}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
