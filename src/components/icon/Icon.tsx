// Canonical icon component for TrendingRepo.
//
// One Icon for the 132 UI icons in /public/icons/ (lucide-style, 24x24,
// 1.5 stroke, currentColor). Tinted via background-color + mask-image so the
// icon takes on the surrounding text color automatically.
//
// One SourceLogo for the 21 brand logos in /public/brand/sources/ (GitHub,
// OpenAI, Anthropic, etc.) — rendered as <img> to preserve native brand
// colors. Never use these as masks.
//
// See docs/DESIGN-SYSTEM.md §8 (Icon system) + §9 (Brand assets).
//
// Examples:
//   <Icon name="trending-up" />                   // 14px, currentColor
//   <Icon name="flame" size="lg" />               // 20px
//   <Icon name="arrow-up-right" size={18} />      // any px
//   <Icon name="check" aria-label="Done" />       // screen-reader visible
//   <SourceLogo source="github" size="sm" />      // brand-color preserved

import type { CSSProperties } from "react";

const SIZE = {
  xs: 10,
  sm: 12,
  md: 14, // default
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
} as const;

export type IconSize = keyof typeof SIZE | number;

export type IconName = string; // intentionally loose — every file under /public/icons/

export interface IconProps {
  name: IconName;
  size?: IconSize;
  className?: string;
  style?: CSSProperties;
  /** Accessible label. When set, the icon is announced; otherwise it's aria-hidden. */
  "aria-label"?: string;
  /** Optional title attribute (tooltip + extra a11y signal). */
  title?: string;
}

function px(size: IconSize): number {
  return typeof size === "number" ? size : SIZE[size];
}

export function Icon({
  name,
  size = "md",
  className,
  style,
  title,
  "aria-label": ariaLabel,
}: IconProps) {
  const dim = px(size);
  const url = `/icons/${name}.svg`;
  const hasLabel = Boolean(ariaLabel);
  return (
    <span
      role={hasLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={hasLabel ? undefined : true}
      title={title}
      className={className}
      style={{
        display: "inline-block",
        width: dim,
        height: dim,
        flexShrink: 0,
        verticalAlign: "middle",
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${url})`,
        maskImage: `url(${url})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        ...style,
      }}
    />
  );
}

export type SourceName =
  | "aiso"
  | "anthropic"
  | "arxiv"
  | "bluesky"
  | "deepseek"
  | "devto"
  | "exa"
  | "github"
  | "hackernews"
  | "huggingface"
  | "langchain"
  | "microsoft"
  | "modelcontextprotocol"
  | "npm"
  | "obsidian"
  | "ollama"
  | "openai"
  | "producthunt"
  | "reddit"
  | "supabase"
  | "vercel"
  | "x-twitter"
  // LLM creators (real brand SVGs from simpleicons; monogram-only creators
  // are intentionally NOT in this enum — they render via CreatorAvatar's
  // letter-tile fallback in LlmsLeaderboardTable).
  | "google"
  | "meta"
  | "alibaba"
  | "cohere"
  | "mistral"
  | "xiaomi"
  | "nvidia"
  | "amazon"
  | "perplexity"
  | "databricks"
  | "baidu"
  | "tencent"
  | "bytedance"
  | "ibm"
  | "naver"
  | "lg"
  | "snowflake"
  | "servicenow";

export interface SourceLogoProps {
  source: SourceName;
  size?: IconSize;
  className?: string;
  style?: CSSProperties;
  /** Override the default alt text. */
  alt?: string;
}

const SOURCE_LABEL: Record<SourceName, string> = {
  aiso: "AISO",
  anthropic: "Anthropic",
  arxiv: "arXiv",
  bluesky: "Bluesky",
  deepseek: "DeepSeek",
  devto: "Dev.to",
  exa: "Exa",
  github: "GitHub",
  hackernews: "Hacker News",
  huggingface: "Hugging Face",
  langchain: "LangChain",
  microsoft: "Microsoft",
  modelcontextprotocol: "Model Context Protocol",
  npm: "npm",
  obsidian: "Obsidian",
  ollama: "Ollama",
  openai: "OpenAI",
  producthunt: "Product Hunt",
  reddit: "Reddit",
  supabase: "Supabase",
  vercel: "Vercel",
  "x-twitter": "X",
  google: "Google",
  meta: "Meta",
  alibaba: "Alibaba",
  cohere: "Cohere",
  mistral: "Mistral",
  xiaomi: "Xiaomi",
  nvidia: "NVIDIA",
  amazon: "Amazon",
  perplexity: "Perplexity",
  databricks: "Databricks",
  baidu: "Baidu",
  tencent: "Tencent",
  bytedance: "ByteDance",
  ibm: "IBM",
  naver: "Naver",
  lg: "LG",
  snowflake: "Snowflake",
  servicenow: "ServiceNow",
};

export function SourceLogo({
  source,
  size = "md",
  className,
  style,
  alt,
}: SourceLogoProps) {
  const dim = px(size);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG, no Next optimization
    <img
      src={`/brand/sources/${source}.svg`}
      width={dim}
      height={dim}
      alt={alt ?? SOURCE_LABEL[source]}
      loading="lazy"
      decoding="async"
      className={className}
      style={{
        display: "inline-block",
        flexShrink: 0,
        verticalAlign: "middle",
        ...style,
      }}
    />
  );
}
