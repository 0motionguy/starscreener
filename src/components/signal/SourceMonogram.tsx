// 1-2 letter monogram in the source's accent color. Used in
// cross-source views (Market Signals) where the row mixes sources, so
// the reader can glance which platform the signal comes from.

export type MonoSource =
  | "reddit"
  | "hackernews"
  | "bluesky"
  | "devto"
  | "lobsters"
  | "twitter"
  | "producthunt"
  | "github"
  | "mcp"
  | "skills";

const STYLES: Record<MonoSource, { label: string; cls: string }> = {
  reddit: { label: "R", cls: "border-warning/60 bg-warning/10 text-warning" },
  hackernews: { label: "HN", cls: "border-brand/60 bg-brand/10 text-brand" },
  bluesky: { label: "BL", cls: "border-functional/60 bg-functional/10 text-functional" },
  devto: { label: "DT", cls: "border-up/60 bg-up/10 text-up" },
  lobsters: { label: "LB", cls: "border-down/60 bg-down/10 text-down" },
  twitter: {
    label: "X",
    cls: "border-border-primary bg-bg-muted text-text-primary",
  },
  producthunt: { label: "PH", cls: "border-brand/60 bg-brand/10 text-brand" },
  github: {
    label: "GH",
    cls: "border-border-primary bg-bg-muted text-text-secondary",
  },
  mcp: { label: "MCP", cls: "border-functional/60 bg-functional/10 text-functional" },
  skills: { label: "SK", cls: "border-up/60 bg-up/10 text-up" },
};

interface SourceMonogramProps {
  source: MonoSource;
  className?: string;
}

export function SourceMonogram({ source, className = "" }: SourceMonogramProps) {
  const { label, cls } = STYLES[source];
  return (
    <span
      className={`inline-flex h-5 min-w-[24px] items-center justify-center rounded-sm border px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider ${cls} ${className}`}
      title={source}
    >
      {label}
    </span>
  );
}

export default SourceMonogram;
