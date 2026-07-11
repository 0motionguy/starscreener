/**
 * Agent QA pilot flows (program pilot, W4).
 *
 * Both flows are safe-tier and write nothing durable:
 *  - trendingrepo-search-page-agent   fills the global repo search bar —
 *    deterministic, no navigation, no network; proves the fill→assert act
 *    pipeline against [data-agent] annotations.
 *  - trendingrepo-compare-top-three   showcase: toggles compare on the top
 *    three live-table rows (client-side Zustand selection only) and asserts
 *    the page-operator state provider reports three selected repos — proves
 *    the captureDomMap → appState wiring end to end.
 *
 * Watchlist mutation is confirm-tier by annotation and intentionally has no
 * flow; exports, alerts, x402/paid actions are unannotated (unreachable).
 *
 * Target names reference plain `data-agent` attributes in SearchBar /
 * LiveTopTable, added alongside the page-operator `data-agent-id` dialect.
 */
import type { FlowDef } from "./contracts";

export const searchPageAgentFlow: FlowDef = {
  name: "trendingrepo-search-page-agent",
  description:
    "Read-only: fill the global repo search bar with a page-agent query and assert the search region stays rendered. Deterministic (no navigation, no network). Run on any route with the header search bar.",
  risk: "safe",
  steps: [
    {
      kind: "act",
      action: { type: "fill", target: "repo-search-input", value: "page agent browser controller" },
    },
    { kind: "assert", condition: { kind: "region-visible", name: "repo-search" }, timeout_ms: 5000 },
  ],
};

export const compareTopThreeFlow: FlowDef = {
  name: "trendingrepo-compare-top-three",
  description:
    "Showcase: click the compare toggle on the top three live-table rows (client-side selection only, no persistence) and assert the page-operator state provider reports 3 selected repos. Run on / with the live table rendered and an empty compare set.",
  risk: "safe",
  steps: [
    { kind: "act", action: { type: "click", target: "repo-card-0-compare" } },
    { kind: "act", action: { type: "click", target: "repo-card-1-compare" } },
    { kind: "act", action: { type: "click", target: "repo-card-2-compare" } },
    {
      kind: "assert",
      condition: {
        kind: "state-equals",
        provider: "page-operator",
        path: "selectedRepoCount",
        equals: 3,
      },
      timeout_ms: 5000,
    },
  ],
};

export const agentQaFlows: FlowDef[] = [searchPageAgentFlow, compareTopThreeFlow];
