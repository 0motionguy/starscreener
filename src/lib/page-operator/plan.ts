import type { AgentRisk, PageDomMap, PageOperatorAction, PageOperatorPlan } from "./types";

export const ALLOWED_PAGE_OPERATOR_ACTIONS = new Set<PageOperatorAction["type"]>([
  "navigate",
  "click",
  "type",
  "select",
  "scroll",
  "wait",
  "askConfirmation",
  "done",
]);

export interface PageOperationInput {
  surface: "trendingrepo" | string;
  command: string;
  route: string;
  dom?: Partial<PageDomMap> | Record<string, unknown>;
}

const BLOCKED = [
  "api key",
  "secret",
  "token",
  "cookie",
  "localstorage",
  "sessionstorage",
  "arbitrary javascript",
  "javascript:",
  "eval(",
  "delete watchlist",
];

const CONFIRM = [
  "watchlist",
  "subscribe",
  "alert",
  "export",
  "spend",
  "paid",
  "x402",
  "deep scan",
  "deep crawl",
  "toolbox",
  "publish",
  "share report",
];

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function cleanQuery(command: string): string {
  return command
    .replace(/\b(find|show|open|repos?|repositories|trending|around|with|only)\b/gi, " ")
    .replace(/[^\w\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function safeBrowserAgentPlan(): PageOperatorPlan {
  const steps: PageOperatorAction[] = [
    { type: "navigate", href: "/search?q=browser%20automation" },
    { type: "wait", ms: 4000 },
  ];

  for (let i = 0; i < 3; i += 1) {
    steps.push({ type: "click", target: `repo.card.${i}.compare` });
  }

  steps.push(
    { type: "navigate", href: "/compare" },
    {
      type: "done",
      summary:
        "Compared the top visible browser-agent repos. Use the panel CTAs to request a Toolbox scan or market brief.",
    },
  );

  return {
    summary: "Find browser agents like PageAgent and compare the top three.",
    risk: "safe",
    steps,
  };
}

export function planPageOperation(input: PageOperationInput): PageOperatorPlan {
  const command = input.command.trim();
  const normalized = command.toLowerCase();

  if (!command) {
    return { summary: "No command entered.", risk: "safe", steps: [] };
  }

  if (hasAny(normalized, BLOCKED)) {
    return {
      summary: "Blocked unsafe website operation.",
      risk: "blocked",
      steps: [],
    };
  }

  if (
    normalized.includes("pageagent") ||
    (normalized.includes("browser") && normalized.includes("agent") && normalized.includes("compare"))
  ) {
    return safeBrowserAgentPlan();
  }

  if (hasAny(normalized, CONFIRM)) {
    const summary = `Confirm before running: ${command}`;
    return {
      summary,
      risk: "confirm",
      steps: [
        { type: "askConfirmation", summary },
        { type: "done", summary: "Confirmation required before this action runs." },
      ],
    };
  }

  const query = cleanQuery(command) || command.slice(0, 120);
  return {
    summary: `Search repositories for "${query}".`,
    risk: "safe",
    steps: [
      { type: "navigate", href: `/search?q=${encodeURIComponent(query)}` },
      { type: "done", summary: `Showing search results for "${query}".` },
    ],
  };
}

export type { AgentRisk, PageDomMap, PageOperatorAction, PageOperatorPlan };
