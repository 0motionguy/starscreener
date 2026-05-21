"use client";

// ShareCTAButton — shared social-sharing affordance for /tools/* sub-routes.
//
// Renders a small two-action group:
//   - "Share on X" opens https://x.com/intent/tweet with the supplied text +
//     the current absolute URL. We compose the URL on click off
//     `window.location.href` so any `?repo=` / `?repos=` / `?date=` /
//     `?seed=` deep-link the user landed on travels with the tweet — that
//     permalink is the social-loop hook the operator asked for.
//   - "Copy link" writes the same URL to the clipboard via
//     `navigator.clipboard.writeText`, with a `<input>` fallback for
//     surface area in browsers that don't expose the Async Clipboard API.
//
// Why client-only: window.open + navigator.clipboard are both browser-only
// APIs. The component sits inside server-rendered hero chrome but never
// blocks SSR — the buttons render as inert until hydration.

import { useCallback, useState } from "react";

interface ShareCTAButtonProps {
  /** Pre-filled tweet body. Final URL is appended client-side. */
  shareText: string;
  /** Optional hashtags (no `#`). Comma-joined into the intent URL. */
  hashtags?: string[];
  /** When set, override `window.location.href`. Useful for testing. */
  forceUrl?: string;
  /** Compact variant — smaller buttons, used inside dense hero strips. */
  size?: "sm" | "md";
  /** className override for the outer container. */
  className?: string;
}

function buildIntent(text: string, url: string, hashtags?: string[]): string {
  const params = new URLSearchParams();
  params.set("text", text);
  params.set("url", url);
  if (hashtags && hashtags.length > 0) {
    params.set("hashtags", hashtags.join(","));
  }
  return `https://x.com/intent/tweet?${params.toString()}`;
}

export function ShareCTAButton({
  shareText,
  hashtags,
  forceUrl,
  size = "md",
  className,
}: ShareCTAButtonProps) {
  const [copied, setCopied] = useState(false);

  const currentUrl = useCallback((): string => {
    if (forceUrl) return forceUrl;
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, [forceUrl]);

  const onShareX = useCallback(async () => {
    const url = currentUrl();
    if (!url) return;
    // Mobile: prefer the native share sheet (iOS/Android), 1-tap UX with
    // more share targets than X-intent. Falls through to X-intent if the
    // user cancels, the API is unavailable, or we're not on mobile.
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(max-width: 768px)").matches
    ) {
      try {
        await navigator.share({ text: shareText, url });
        return;
      } catch {
        // User canceled or share failed — fall through.
      }
    }
    const intent = buildIntent(shareText, url, hashtags);
    window.open(intent, "_blank", "noopener,noreferrer");
  }, [shareText, hashtags, currentUrl]);

  const onCopy = useCallback(async () => {
    const url = currentUrl();
    if (!url) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Silent — copy fallback already covers the common failure path.
    }
  }, [currentUrl]);

  const sz = size === "sm" ? "tr-share--sm" : "";

  return (
    <div className={`tr-share ${sz} ${className ?? ""}`} role="group" aria-label="Share">
      <button
        type="button"
        onClick={onShareX}
        className="tr-share-btn tr-share-btn--x"
        aria-label="Share on X"
      >
        <span className="tr-share-glyph" aria-hidden="true">X</span>
        <span className="tr-share-label">Share</span>
      </button>
      <button
        type="button"
        onClick={onCopy}
        className="tr-share-btn tr-share-btn--copy"
        aria-label="Copy link"
      >
        <span className="tr-share-label">{copied ? "Copied" : "Copy link"}</span>
      </button>
      <style>{`
        .tr-share {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .tr-share-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 2px;
          color: var(--fg);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          transition: border-color var(--d-fast) var(--ease),
                      background var(--d-fast) var(--ease),
                      color var(--d-fast) var(--ease);
        }
        .tr-share-btn:hover {
          border-color: var(--accent);
          color: var(--fg-bright);
        }
        .tr-share-btn--x:hover {
          background: var(--accent);
          color: var(--bg);
        }
        .tr-share-glyph {
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0;
        }
        .tr-share-label {
          font-weight: 600;
        }
        .tr-share--sm .tr-share-btn {
          padding: 4px 9px;
          font-size: 10px;
        }
      `}</style>
    </div>
  );
}
