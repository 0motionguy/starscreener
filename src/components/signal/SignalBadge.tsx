// Compact pill used inside SignalTable rows to flag velocity / state.
// HOT / RISING / FIRE / NEW / LAUNCH / FUNDING / FRONT-PAGE.
//
// Spec rule: max 3 badges per row. Caller decides how many to render.

import { Badge, type BadgeTone } from "@/components/ui/Badge";

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
  | "llm"
  | "verified";

const STYLES: Record<SignalBadgeKind, { label: string; tone: BadgeTone }> = {
  hot: {
    label: "HOT",
    tone: "hot",
  },
  rising: {
    label: "RISING",
    tone: "positive",
  },
  fire: {
    label: "FIRE",
    tone: "accent",
  },
  new: {
    label: "NEW",
    tone: "new",
  },
  launch: {
    label: "LAUNCH",
    tone: "accent",
  },
  funding: {
    label: "FUNDING",
    tone: "positive",
  },
  "front-page": {
    label: "FRONT-PAGE",
    tone: "warning",
  },
  "linked-repo": {
    label: "LINKED",
    tone: "external",
  },
  agents: {
    label: "AGENTS",
    tone: "neutral",
  },
  mcp: {
    label: "MCP",
    tone: "neutral",
  },
  llm: {
    label: "LLM",
    tone: "neutral",
  },
  verified: {
    label: "VERIFIED",
    tone: "positive",
  },
  verified: {
    label: "VERIFIED",
    cls: "border-up/60 bg-up/10 text-up",
  },
  verified: {
    label: "VERIFIED",
    cls: "border-up/60 bg-up/10 text-up",
  },
};

interface SignalBadgeProps {
  kind: SignalBadgeKind;
  /** Override the default label (e.g. show count "+5"). */
  override?: string;
}

export function SignalBadge({ kind, override }: SignalBadgeProps) {
  const { label, tone } = STYLES[kind];
  return (
    <Badge tone={tone} size="xs">
      {override ?? label}
    </Badge>
  );
}

export default SignalBadge;
