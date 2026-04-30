// V4 — SourcePip
//
// Compact source-channel indicator. Shows a 2-letter code in the source's
// brand color. Used in:
//   - Filter chips (signals.html, consensus.html source row)
//   - Volume chart legend
//   - Consensus 8-cell agreement gauge (label inside each cell)
//   - Mention rows (signals.html secondary feed avatars)
//
// Sizes (mockup-canonical):
//   sm → 14×14px, font 8.5px
//   md → 18×18px, font 8.5-9px (default)
//   lg → 24×24px, font 11px
//
// The text color inside the pip is dark (#0a0a0a) when the source bg is
// light (gh, openai), and white when dark (reddit, claude). This is
// pre-encoded per source — no runtime contrast computation.

import { cn } from "@/lib/utils";

export type SourceKey =
  | "hn"
  | "gh"
  | "x"
  | "reddit"
  | "bsky"
  | "dev"
  | "claude"
  | "openai"
  | "github";

export type SourcePipSize = "sm" | "md" | "lg";

export interface SourcePipProps {
  src: SourceKey;
  size?: SourcePipSize;
  /** Override the 2-letter code (default uses SOURCE_CODE map). */
  code?: string;
  className?: string;
  title?: string;
}

const SOURCE_CODE: Record<SourceKey, string> = {
  hn: "HN",
  gh: "GH",
  github: "GH",
  x: "X",
  reddit: "R",
  bsky: "BS",
  dev: "DV",
  claude: "CL",
  openai: "OA",
};

export function SourcePip({
  src,
  size = "md",
  code,
  className,
  title,
}: SourcePipProps) {
  // Normalize "github" alias → "gh".
  const normalized = src === "github" ? "gh" : src;
  return (
    <span
      className={cn(
        "v4-source-pip",
        `v4-source-pip--${size}`,
        `v4-source-pip--${normalized}`,
        className,
      )}
      title={title}
      aria-label={title ?? `${SOURCE_CODE[normalized]} source`}
    >
      {code ?? SOURCE_CODE[normalized]}
    </span>
  );
}
