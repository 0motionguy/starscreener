/**
 * trendingrepo ↔ Agent QA bridge adapter (dev-only).
 *
 * Enable with NEXT_PUBLIC_TRENDINGREPO_AGENT_QA_ENABLED=1 in .env.local on a
 * non-production build; components/agent-qa/AgentQaBridgeLoader.tsx gates on
 * both. The hub is @0motionguy/agent-qa-mcp (toolbox repo) on 127.0.0.1:43110.
 *
 * This bridge WRAPS the existing page-operator layer instead of replacing it:
 *  - captureDomMap() is registered as the "page-operator" state provider, so
 *    the DOM census (controls, repoCards, selectedRepos, freshness) becomes
 *    the appState surface and is addressable from flows via
 *    { kind: "state-equals", provider: "page-operator", ... }.
 *  - Act targets resolve via plain [data-agent] names annotated alongside the
 *    page-operator [data-agent-id] attributes; unannotated targets default to
 *    the "confirm" tier.
 *
 * Safety posture: watchlist mutation is confirm-tier by annotation
 * (data-agent-risk="confirm"); exports/alerts/x402/paid actions carry no
 * data-agent name at all and stay unreachable. The MCP/public agent surface
 * (src/portal, src/tools, mcp/) is intentionally untouched — Agent QA is a
 * dev-only, in-page concern (see docs/AGENT-QA-INVENTORY.md in aiso-ecosystem).
 *
 * vendor/ holds the verbatim `build:vendor` bundle from toolbox
 * packages/agent-bridge — never edit it by hand; re-copy to upgrade.
 */
import { init } from "./vendor/agent-qa-bridge.v0.2.0.mjs";
import { captureDomMap } from "@/lib/page-operator/dom-map";
import { agentQaFlows } from "./flows";

export function mountAgentQa(): void {
  init({
    app: "trendingrepo",
    mode: "dev",
    env: process.env.NODE_ENV ?? "development",
    flows: agentQaFlows,
    stateProviders: {
      // walkPath (state-equals) indexes arrays only by integer segment, so
      // derived scalar counts are exposed alongside the raw census.
      "page-operator": () => {
        const map = captureDomMap();
        return { ...map, selectedRepoCount: map.selectedRepos?.length ?? 0 };
      },
    },
  });
}
