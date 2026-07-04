export const AGENT_RISKS = ["safe", "preview", "confirm", "danger", "blocked"] as const;
export type AgentRisk = (typeof AGENT_RISKS)[number];

export interface PageOperatorControl {
  agentId: string;
  label?: string;
  action?: string;
  risk?: AgentRisk;
  tag?: string;
  href?: string;
  value?: string;
}

export interface PageOperatorRepoCard {
  agentId: string;
  fullName?: string;
  href?: string;
  text?: string;
}

export interface PageDomMap {
  route: string;
  title: string;
  headings: string[];
  controls: PageOperatorControl[];
  repoCards: PageOperatorRepoCard[];
  resultsCount?: number;
  freshness?: string[];
  selectedRepos?: string[];
}

export type PageOperatorAction =
  | { type: "navigate"; href: string }
  | { type: "click"; target: string }
  | { type: "type"; target: string; text: string }
  | { type: "select"; target: string; value: string }
  | { type: "scroll"; direction: "up" | "down" }
  | { type: "wait"; ms: number }
  | { type: "askConfirmation"; summary: string }
  | { type: "done"; summary: string };

export interface PageOperatorPlan {
  summary: string;
  risk: AgentRisk;
  steps: PageOperatorAction[];
}
