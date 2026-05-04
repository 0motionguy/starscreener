// Single SourceKey → BrandIcon mapping. Lets every signals-terminal surface
// render the canonical brand SVG (from src/components/brand/BrandIcons.tsx)
// without each component re-implementing the same switch.

import {
  HackerNewsIcon,
  GithubIcon,
  XIcon,
  RedditIcon,
  BlueskyIcon,
  DevtoIcon,
  ClaudeIcon,
  OpenAIIcon,
} from "@/components/brand/BrandIcons";
import type { SourceKey } from "@/lib/signals/types";
import type { ComponentType } from "react";

interface BrandIconProps {
  size?: number;
  className?: string;
  monochrome?: boolean;
}

const ICONS: Record<SourceKey, ComponentType<BrandIconProps>> = {
  hn: HackerNewsIcon,
  github: GithubIcon,
  x: XIcon,
  reddit: RedditIcon,
  bluesky: BlueskyIcon,
  devto: DevtoIcon,
  claude: ClaudeIcon,
  openai: OpenAIIcon,
};

export const SOURCE_BRAND_COLOR: Record<SourceKey, string> = {
  hn: "var(--source-hackernews)",
  github: "var(--source-github)",
  x: "var(--source-x)",
  reddit: "var(--source-reddit)",
  bluesky: "var(--source-bluesky)",
  devto: "var(--source-dev)",
  claude: "var(--source-claude)",
  openai: "var(--source-openai)",
};

export interface SourceMarkProps {
  source: SourceKey;
  size?: number;
  className?: string;
  /** Render in currentColor (use inside brand-tinted active chips). */
  monochrome?: boolean;
}

export function SourceMark({ source, size = 14, className, monochrome }: SourceMarkProps) {
  const Icon = ICONS[source];
  return <Icon size={size} className={className} monochrome={monochrome} />;
}

export default SourceMark;
