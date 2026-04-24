// "Share to X" — opens twitter.com/intent/tweet with a pre-filled
// post and a canonical TrendingRepo URL. No OAuth on our side; the
// user authenticates with Twitter when the intent page loads.
//
// Server-safe wrapper so pages can render this without a client
// component boundary leak; the anchor is a plain link, no client
// JS required.

import type { JSX } from "react";
import { Share2 } from "lucide-react";

import { buildShareToXUrl } from "@/lib/twitter/outbound/share";
import { cn } from "@/lib/utils";

interface ShareToXProps {
  /** Prefilled tweet text. Caller is responsible for length budgeting. */
  text: string;
  /**
   * Absolute canonical URL. MUST start with https:// — Twitter's intent
   * flow rejects relative URLs.
   */
  url: string;
  /** Optional via-handle, e.g. "trendingrepo". Omit the @. */
  via?: string;
  /**
   * Compact: icon only, used on tight rows (idea cards, repo rows).
   * Full: icon + "Share" label, used in headers.
   */
  compact?: boolean;
  className?: string;
}

export function ShareToX({
  text,
  url,
  via,
  compact = false,
  className,
}: ShareToXProps): JSX.Element {
  const href = buildShareToXUrl({
    text,
    url,
    via: via ? [via] : undefined,
  });
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Share to X"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-button border border-border-primary bg-bg-card text-text-secondary hover:bg-bg-card-hover hover:text-text-primary font-mono text-xs transition-colors min-h-[32px]",
        compact ? "px-2 py-1" : "px-3 py-1.5",
        className,
      )}
    >
      <Share2 size={14} aria-hidden />
      {!compact ? <span>Share</span> : null}
    </a>
  );
}

export default ShareToX;
