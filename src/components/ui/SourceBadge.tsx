"use client";

// SourceBadge — provider attribution chip for signal rows.
//
// Shows which provider produced a signal (Apify scrape vs Nitter mirror vs
// raw web vs OAuth API vs RSS fallback) so an operator can tell at a glance
// whether a row came from the trusted ingest path or a degraded fallback.
//
// Used inline next to /twitter and /reddit/trending row metadata.
//
// Color tokens (define if not present, otherwise reuse — flag for follow-up
// CSS sweep in globals.css if missing):
//   --src-apify-fg  → #f97316 (orange-500)
//   --src-nitter-fg → #a78bfa (purple-400)
//   --src-web-fg    → #6b7280 (gray-500)
//   --src-oauth-fg  → #22c55e (green-500)
//   --src-rss-fg    → #eab308 (yellow-500)
//
// The chip falls back to the raw hex when the var is undefined, so it stays
// correct on day-1 even before a designer wires the tokens into globals.css.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SignalProvider =
  | "apify"
  | "nitter"
  | "web"
  | "rss"
  | "oauth"
  | "unknown";

interface Props {
  provider: SignalProvider;
  /** ISO-8601 timestamp; surfaces in tooltip as "Collected via X on YYYY-MM-DD HH:mm UTC". */
  scannedAt?: string;
  size?: "xs" | "sm";
  className?: string;
}

interface ProviderMeta {
  label: string;
  color: string | null; // null → no dot rendered
}

const PROVIDER_META: Record<SignalProvider, ProviderMeta> = {
  apify: { label: "Apify", color: "var(--src-apify-fg, #f97316)" },
  nitter: { label: "Nitter", color: "var(--src-nitter-fg, #a78bfa)" },
  web: { label: "Web", color: "var(--src-web-fg, #6b7280)" },
  oauth: { label: "OAuth", color: "var(--src-oauth-fg, #22c55e)" },
  rss: { label: "RSS", color: "var(--src-rss-fg, #eab308)" },
  unknown: { label: "?", color: null },
};

function formatScannedAt(scannedAt: string): string | null {
  const d = new Date(scannedAt);
  if (Number.isNaN(d.getTime())) return null;
  // YYYY-MM-DD HH:mm UTC
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

export function SourceBadge({
  provider,
  scannedAt,
  size = "xs",
  className,
}: Props): ReactNode {
  const meta = PROVIDER_META[provider];
  const formatted = scannedAt ? formatScannedAt(scannedAt) : null;
  const tooltip = formatted
    ? `Collected via ${meta.label} on ${formatted}`
    : `Collected via ${meta.label}`;

  const sizeClass = size === "sm" ? "text-[10px]" : "text-[9px]";

  return (
    <abbr
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 font-mono no-underline",
        sizeClass,
        className,
      )}
      data-provider={provider}
    >
      {meta.color ? (
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: meta.color }}
        />
      ) : null}
      <span className="text-text-secondary">{meta.label}</span>
    </abbr>
  );
}
