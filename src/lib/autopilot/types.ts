// Typed action DSL for the Autopilot agent.
//
// The LLM router (/api/navigator, action.kind="autopilot") emits an
// AutopilotPlan; the client executor (executor.ts) plays it as a cinematic
// on-page sequence (ghost cursor + spotlight + narration). Every step maps to
// one existing, stable UI hook on the site — see executor.ts for the selector
// vocabulary. Keep this in sync with the server prompt in the navigator route.

export type AutopilotRank = "top" | "gainer" | "trend" | "discovery";
export type AutopilotCat = "repos" | "agents" | "llms" | "models";

export type AutopilotStep =
  /** Say something in the narration ribbon (types out). */
  | { kind: "narrate"; text: string }
  /** Router-navigate to an internal path (validated server-side). */
  | { kind: "navigate"; href: string; label?: string }
  /** Switch the homepage discovery tab (URL-param SSR nav). */
  | { kind: "switchTab"; rank?: AutopilotRank; cat?: AutopilotCat; label?: string }
  /** Type a query into the global search box (char-by-char). */
  | { kind: "fillSearch"; query: string }
  /** Move the ghost cursor to + spotlight an element by CSS selector. */
  | { kind: "highlight"; selector: string; label?: string }
  /** Open a repo detail page by "owner/name". */
  | { kind: "openRepo"; fullName: string; label?: string }
  /** Run a live Toolbox web search and narrate the top results. */
  | { kind: "webSearch"; query: string }
  /** Dwell for effect. */
  | { kind: "wait"; ms: number };

export interface AutopilotPlan {
  /** One-line restatement of the user's goal (shown as the run title). */
  goal: string;
  steps: AutopilotStep[];
}

/** Hard ceiling on plan length — mirrored in the navigator route guard. */
export const AUTOPILOT_MAX_STEPS = 12;

export const AUTOPILOT_RANKS: readonly AutopilotRank[] = ["top", "gainer", "trend", "discovery"];
export const AUTOPILOT_CATS: readonly AutopilotCat[] = ["repos", "agents", "llms", "models"];
