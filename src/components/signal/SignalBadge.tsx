// Compact pill used inside SignalTable rows to flag velocity / state.
// HOT / RISING / FIRE / NEW / LAUNCH / FUNDING / FRONT-PAGE.
//
// Spec rule: max 3 badges per row. Caller decides how many to render.

export type SignalBadgeKind =
  | "hot"
  | "rising"
  | "fire"
  | "new"
  | "launch"
  | "funding"
  | "front-page"
  | "linked-repo"
  | "agents"
  | "mcp"
  | "llm";

const STYLES: Record<SignalBadgeKind, { label: string; cls: string }> = {
  hot: {
    label: "HOT",
    cls: "border-warning/60 bg-warning/10 text-warning",
  },
  rising: {
    label: "RISING",
    cls: "border-up/60 bg-up/10 text-up",
  },
  fire: {
    label: "FIRE",
    cls: "border-brand/60 bg-brand/10 text-brand",
  },
  new: {
    label: "NEW",
    cls: "border-functional/60 bg-functional/10 text-functional",
  },
  launch: {
    label: "LAUNCH",
    cls: "border-brand/60 bg-brand/10 text-brand",
  },
  funding: {
    label: "FUNDING",
    cls: "border-up/60 bg-up/10 text-up",
  },
  "front-page": {
    label: "FRONT-PAGE",
    cls: "border-warning/60 bg-warning/10 text-warning",
  },
  "linked-repo": {
    label: "LINKED",
    cls: "border-functional/60 bg-functional/10 text-functional",
  },
  agents: {
    label: "AGENTS",
    cls: "border-border-primary bg-bg-muted text-text-secondary",
  },
  mcp: {
    label: "MCP",
    cls: "border-border-primary bg-bg-muted text-text-secondary",
  },
  llm: {
    label: "LLM",
    cls: "border-border-primary bg-bg-muted text-text-secondary",
  },
};

interface SignalBadgeProps {
  kind: SignalBadgeKind;
  /** Override the default label (e.g. show count "+5"). */
  override?: string;
}

export function SignalBadge({ kind, override }: SignalBadgeProps) {
  const { label, cls } = STYLES[kind];
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${cls}`}
    >
      {override ?? label}
    </span>
  );
}

export default SignalBadge;
