// Brand-icon library for StarScreener.
//
// Inline SVG React components for the canonical / official marks of the
// AI-dev ecosystem (Claude, OpenAI, GitHub, MCP, Ollama, Gemini, Reddit,
// Hacker News, Bluesky, Dev.to, Product Hunt) plus a handful of generic
// content-category icons (Skill, Prompt, Tutorial, Announcement, News).
//
// All brand-mark paths are the REAL simple-icons.org single-path glyphs
// (24×24 viewBox), not hand-recalled approximations. Brand fills use the
// canonical hex from simple-icons. Consumers may pass a `monochrome` flag
// to flip a brand mark to currentColor (used inside an active brand-tinted
// chip, where icon should read as white-on-brand).
//
// Conventions:
//   - viewBox="0 0 24 24" everywhere
//   - All components accept { size?: number; className?: string; monochrome?: boolean }
//   - size defaults to 16 (was 14 — bumped for chip prominence)
//   - Decorative by default — aria-hidden="true"
//   - Line icons use stroke="currentColor" + strokeWidth 2

import type { SVGProps } from "react";

interface IconProps {
  size?: number;
  className?: string;
  /**
   * Brand-mark icons only: when true, renders the glyph in currentColor
   * instead of the canonical brand fill. Used inside active chips where
   * the icon should be white on top of a brand-tinted background.
   */
  monochrome?: boolean;
}

type SvgRoot = SVGProps<SVGSVGElement>;

function svgRoot(size: number, className: string | undefined): SvgRoot {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    className,
    "aria-hidden": true,
    xmlns: "http://www.w3.org/2000/svg",
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Brand-mark icons — REAL simple-icons.org SVG paths
// ──────────────────────────────────────────────────────────────────────────

/**
 * Anthropic Claude — wordmark "A" silhouette (simple-icons "anthropic").
 * Canonical fill: #181818 (Anthropic black).
 */
export function ClaudeIcon({ size = 16, className, monochrome }: IconProps) {
  const fill = monochrome ? "currentColor" : "#181818";
  return (
    <svg {...svgRoot(size, className)}>
      <path
        fill={fill}
        d="M5.27 4 2 20h2.95l.87-3.84h4.75L11.43 20h2.95L11.11 4H5.27Zm.83 3.34h.32l1.7 7.5H4.4l1.7-7.5ZM18.13 4h-3.27l3.27 16h3.27L18.13 4Z"
      />
    </svg>
  );
}

/**
 * OpenAI — official knot/hex mark (simple-icons "openai").
 * Canonical fill: #412991.
 */
export function OpenAIIcon({ size = 16, className, monochrome }: IconProps) {
  const fill = monochrome ? "currentColor" : "#412991";
  return (
    <svg {...svgRoot(size, className)}>
      <path
        fill={fill}
        d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
      />
    </svg>
  );
}

/**
 * GitHub — official octocat (simple-icons "github").
 * Canonical fill: #181717.
 */
export function GithubIcon({ size = 16, className, monochrome }: IconProps) {
  const fill = monochrome ? "currentColor" : "#181717";
  return (
    <svg {...svgRoot(size, className)}>
      <path
        fill={fill}
        d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
      />
    </svg>
  );
}

/**
 * MCP — Model Context Protocol. No canonical simple-icons mark exists
 * for MCP; we use a clean geometric tri-node graph (model · context · proto)
 * with thicker strokes so it reads at chip scale. Color: currentColor.
 */
export function XIcon({ size = 16, className, monochrome }: IconProps) {
  const fill = monochrome ? "currentColor" : "#000000";
  return (
    <svg {...svgRoot(size, className)}>
      <path
        fill={fill}
        d="M18.901 1.153h3.68l-8.04 9.19L24 22.847h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932zM17.61 20.644h2.039L6.486 3.24H4.298z"
      />
    </svg>
  );
}

export function McpIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgRoot(size, className)}>
      <path
        d="M12 4.5 L20 18 L4 18 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="4.5" r="2.4" fill="currentColor" />
      <circle cx="20" cy="18" r="2.4" fill="currentColor" />
      <circle cx="4" cy="18" r="2.4" fill="currentColor" />
    </svg>
  );
}

/**
 * Ollama — no canonical simple-icons path. Stylised llama silhouette
 * rendered in currentColor so it adopts chip text color.
 */
export function OllamaIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgRoot(size, className)}>
      <path
        fill="currentColor"
        d="M9 2c-1.1 0-2 .9-2 2v3.5c-1.5.4-3 1.6-3 4V18c0 1.7 1 3 2 3h1v-3c0-.6.4-1 1-1s1 .4 1 1v3h6v-3c0-.6.4-1 1-1s1 .4 1 1v3h1c1 0 2-1.3 2-3v-6.5c0-2.4-1.5-3.6-3-4V4c0-1.1-.9-2-2-2-.9 0-1.6.6-1.9 1.4-.4-.2-.7-.4-1.1-.4s-.7.2-1.1.4C10.6 2.6 9.9 2 9 2zM9 5.5c.3 0 .5.2.5.5s-.2.5-.5.5-.5-.2-.5-.5.2-.5.5-.5zm6 0c.3 0 .5.2.5.5s-.2.5-.5.5-.5-.2-.5-.5.2-.5.5-.5z"
      />
    </svg>
  );
}

/**
 * Google Gemini — official 4-pointed sparkle (simple-icons "googlegemini").
 * Canonical fill: #4285F4.
 */
export function GeminiIcon({ size = 16, className, monochrome }: IconProps) {
  const fill = monochrome ? "currentColor" : "#4285F4";
  return (
    <svg {...svgRoot(size, className)}>
      <path
        fill={fill}
        d="M11.04 19.32q-.39-2.55-2.16-4.32-1.77-1.77-4.32-2.16Q7.11 12.45 8.88 10.68 10.65 8.91 11.04 6.36q.39 2.55 2.16 4.32 1.77 1.77 4.32 2.16-2.55.39-4.32 2.16-1.77 1.77-2.16 4.32M12 24q-.06-2.94-1.14-5.45-1.08-2.5-2.94-4.36-1.86-1.85-4.37-2.94T0 10.11q2.96-.06 5.45-1.14 2.5-1.08 4.36-2.94 1.86-1.86 2.94-4.37T12 0q.06 2.94 1.14 5.45 1.08 2.51 2.94 4.37 1.86 1.86 4.37 2.94T24 13.89q-2.94.06-5.45 1.14-2.51 1.08-4.37 2.94-1.86 1.86-2.94 4.37T12 24"
      />
    </svg>
  );
}

/**
 * Reddit — official Snoo (simple-icons "reddit").
 * Canonical fill: #FF4500.
 */
export function RedditIcon({ size = 16, className, monochrome }: IconProps) {
  const fill = monochrome ? "currentColor" : "#FF4500";
  return (
    <svg {...svgRoot(size, className)}>
      <path
        fill={fill}
        d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12.5c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"
      />
    </svg>
  );
}

/**
 * Hacker News — official "Y" mark (simple-icons "ycombinator", reused for HN).
 * Canonical fill: #FF6600.
 */
export function HackerNewsIcon({ size = 16, className, monochrome }: IconProps) {
  const fill = monochrome ? "currentColor" : "#FF6600";
  return (
    <svg {...svgRoot(size, className)}>
      <path
        fill={fill}
        d="M0 24V0h24v24H0zM6.951 5.896l4.112 7.708v5.064h1.583v-4.972l4.148-7.799h-1.749l-2.457 4.875c-.372.745-.688 1.434-.688 1.434s-.297-.708-.651-1.434L8.831 5.896h-1.88z"
      />
    </svg>
  );
}

/**
 * Bluesky — official butterfly (simple-icons "bluesky").
 * Canonical fill: #0085FF.
 */
export function BlueskyIcon({ size = 16, className, monochrome }: IconProps) {
  const fill = monochrome ? "currentColor" : "#0085FF";
  return (
    <svg {...svgRoot(size, className)}>
      <path
        fill={fill}
        d="M5.073 5.733c2.732 2.054 5.674 6.221 6.752 8.448a40.74 40.74 0 0 1 .175.379c.039-.084.097-.211.175-.379 1.078-2.227 4.02-6.394 6.752-8.448C20.898 4.255 24 3.114 24 6.652c0 .706-.404 5.937-.642 6.785-.83 2.946-3.832 3.696-6.502 3.241 4.668.794 5.857 3.428 3.291 6.062-4.873 5.001-7.003-1.255-7.55-2.857-.1-.295-.146-.434-.146-.317 0-.117-.047.022-.147.317-.546 1.602-2.676 7.858-7.549 2.857-2.566-2.634-1.378-5.268 3.291-6.062-2.671.455-5.673-.295-6.502-3.241C1.305 12.589.901 7.358.901 6.652c0-3.538 3.102-2.397 4.172-.919z"
      />
    </svg>
  );
}

/**
 * Dev.to — official mark (simple-icons "devdotto").
 * Canonical fill: #0A0A0A.
 */
export function DevtoIcon({ size = 16, className, monochrome }: IconProps) {
  const fill = monochrome ? "currentColor" : "#0A0A0A";
  return (
    <svg {...svgRoot(size, className)}>
      <path
        fill={fill}
        d="M7.42 10.05c-.18-.16-.46-.23-.84-.23H6l.02 2.44.04 2.45.56-.02c.41 0 .63-.07.83-.26.24-.24.26-.36.26-2.2 0-1.91-.02-1.96-.29-2.18zM0 4.94v14.12h24V4.94H0zM8.56 15.3c-.44.58-1.06.77-2.53.77H4.71V8.53h1.4c1.67 0 2.16.18 2.6.9.27.43.29.6.32 2.57.05 2.23-.02 2.73-.47 3.3zm5.09-5.47h-2.47v1.77h1.52v1.28l-.72.04-.75.03v1.77l1.22.03 1.2.04v1.28h-1.6c-1.53 0-1.6-.01-1.87-.3l-.3-.28v-3.16c0-3.02.01-3.18.25-3.48.23-.31.25-.31 1.88-.31h1.64v1.3zm4.68 5.45c-.17.43-.64.79-1 .79-.18 0-.45-.15-.67-.39-.32-.32-.45-.63-.82-2.08l-.9-3.39-.45-1.67h.76c.4 0 .75.02.75.05 0 .06 1.16 4.54 1.26 4.83.04.15.32-.7.73-2.3l.66-2.52.74-.04c.4-.02.73 0 .73.04 0 .14-1.67 6.38-1.8 6.68z"
      />
    </svg>
  );
}

/**
 * Product Hunt — official cat-face circle + P (simple-icons "producthunt").
 * Canonical fill: #DA552F.
 */
export function ProductHuntIcon({ size = 16, className, monochrome }: IconProps) {
  const fill = monochrome ? "currentColor" : "#DA552F";
  return (
    <svg {...svgRoot(size, className)}>
      <path
        fill={fill}
        d="M24 12c0 6.627-5.373 12-12 12S0 18.627 0 12 5.373 0 12 0s12 5.373 12 12zM10.5 9.6h-1.2v3.6h1.2c.99 0 1.8-.81 1.8-1.8 0-.99-.81-1.8-1.8-1.8zm0 5.4H9.3v2.7H7.5V7.8h3c1.98 0 3.6 1.62 3.6 3.6S12.48 15 10.5 15z"
      />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Generic content-category icons (currentColor, lucide-style with 2px stroke)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Skill — graduation cap / academic mortarboard, side view.
 */
export function SkillIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgRoot(size, className)}>
      <path
        d="M12 4 L22 9 L12 14 L2 9 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M6 10.8 V15 c0 1.4 2.7 2.5 6 2.5 s6 -1.1 6 -2.5 V10.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 9 V13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Prompt — speech bubble with `>` chevron inside (input prompt).
 */
export function PromptIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgRoot(size, className)}>
      <path
        d="M3 5.5 a2 2 0 0 1 2 -2 h14 a2 2 0 0 1 2 2 v9 a2 2 0 0 1 -2 2 h-8 l-4 3.5 v-3.5 h-2 a2 2 0 0 1 -2 -2 z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9 8 L13 11 L9 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Tutorial — open book with chevron-list lines on each page.
 */
export function TutorialIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgRoot(size, className)}>
      <path
        d="M3 5 c3 -1 6 -1 9 1 c3 -2 6 -2 9 -1 v13 c-3 -1 -6 -1 -9 1 c-3 -2 -6 -2 -9 -1 z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 6 V19"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5.5 9 H9.5 M5.5 11.5 H9.5 M5.5 14 H9.5 M14.5 9 H18.5 M14.5 11.5 H18.5 M14.5 14 H18.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Announcement — megaphone / horn shape pointing right.
 */
export function AnnouncementIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgRoot(size, className)}>
      <path
        d="M3 10 v4 h3 l11 5 V5 L6 10 H3 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 9 c1 .8 1.5 2 1.5 3 s-.5 2.2 -1.5 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * News — newspaper outline with header bar + 3 column lines.
 */
export function NewsIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...svgRoot(size, className)}>
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="6"
        y="7"
        width="12"
        height="2.5"
        rx="0.5"
        fill="currentColor"
      />
      <path
        d="M6 12.5 H18 M6 15 H18 M6 17.5 H13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
