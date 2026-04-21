// Icon-row variant of content tags. Sibling to ContentTagChips (text chips
// used for filter UI); this one is the in-row visual marker stamped onto
// each post in the trending feed.
//
// Maps content_tag strings → brand or lucide icons. Brand icons (MCP, Skill,
// GitHub, Prompt, Tutorial, News, Announcement) ship with their own brand
// colors; lucide fallbacks inherit a Tailwind text-* class. Unknown tags are
// skipped; output is capped at `max` icons with a "+N" overflow chip.

import {
  Bot,
  Code,
  FileText,
  HelpCircle,
  Smile,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import {
  AnnouncementIcon,
  GithubIcon,
  McpIcon,
  NewsIcon,
  PromptIcon,
  SkillIcon,
  TutorialIcon,
} from "@/components/brand/BrandIcons";
import type { ComponentType, SVGProps } from "react";

type IconLike = LucideIcon | ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

interface IconSpec {
  icon: IconLike;
  /** Either a Tailwind text-* class or null if `color` is set / brand icon
   *  carries its own fill. */
  className: string | null;
  /** Inline color (used when not a Tailwind utility — e.g. exact hex hint).
   *  Brand icons that hard-code their own fill keep `color: null`. */
  color: string | null;
  label: string;
}

const TAG_TO_SPEC: Record<string, IconSpec> = {
  "has-mcp": {
    icon: McpIcon,
    className: null,
    color: null,
    label: "MCP",
  },
  "has-skill": {
    icon: SkillIcon,
    className: null,
    color: null,
    label: "Skill",
  },
  "has-code-block": {
    icon: Code,
    className: "text-text-secondary",
    color: null,
    label: "Code block",
  },
  "has-github-repo": {
    icon: GithubIcon,
    className: null,
    color: null,
    label: "GitHub repo",
  },
  "has-cli": {
    icon: Terminal,
    className: "text-text-secondary",
    color: null,
    label: "CLI",
  },
  "has-prompt": {
    icon: PromptIcon,
    className: null,
    color: null,
    label: "Prompt",
  },
  "has-agent": {
    icon: Bot,
    className: null,
    color: "#22c55e",
    label: "Agent",
  },
  "has-tutorial": {
    icon: TutorialIcon,
    className: null,
    color: null,
    label: "Tutorial",
  },
  "has-md-file": {
    icon: FileText,
    className: "text-text-tertiary",
    color: null,
    label: "Markdown file",
  },
  "is-question": {
    icon: HelpCircle,
    className: "text-text-tertiary",
    color: null,
    label: "Question",
  },
  "is-news": {
    icon: NewsIcon,
    className: null,
    color: null,
    label: "News",
  },
  "is-announcement": {
    icon: AnnouncementIcon,
    className: null,
    color: null,
    label: "Announcement",
  },
  "is-meme": {
    icon: Smile,
    className: "text-text-muted",
    color: null,
    label: "Meme",
  },
};

interface ContentTagIconsProps {
  tags: string[] | undefined;
  /** Cap how many icons render. Default 6. */
  max?: number;
  /** Pixel size. Default 16. */
  size?: number;
}

export function ContentTagIcons({
  tags,
  max = 6,
  size = 16,
}: ContentTagIconsProps) {
  if (!Array.isArray(tags) || tags.length === 0) return null;

  // Preserve input order, skip unknown tags.
  const recognized = tags.filter((t) => TAG_TO_SPEC[t] !== undefined);
  if (recognized.length === 0) return null;

  const visible = recognized.slice(0, max);
  const overflow = recognized.length - visible.length;

  return (
    <span className="inline-flex items-center gap-1">
      {visible.map((tag) => {
        const spec = TAG_TO_SPEC[tag];
        const Icon = spec.icon;
        return (
          <span
            key={tag}
            title={spec.label}
            className={spec.className ?? undefined}
            style={spec.color ? { color: spec.color } : undefined}
          >
            <Icon size={size} aria-hidden="true" />
          </span>
        );
      })}
      {overflow > 0 ? (
        <span className="text-text-tertiary text-[10px] font-mono tabular-nums">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
