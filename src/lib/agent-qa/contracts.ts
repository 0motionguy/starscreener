/**
 * Structural mirror of the Agent QA wire contract for type-only use.
 * Source of truth: aiso-ecosystem/contracts/schemas/agent-qa-v1.schema.json
 * Runtime behavior comes from the vendored bundle (src/lib/agent-qa/vendor/);
 * its sibling .d.mts consumes these names because JS bundles cannot export types.
 */

export type BridgeMode = "dev" | "prod";
export type AgentRisk = "safe" | "preview" | "confirm" | "danger" | "blocked";

export interface ActAction {
  type: "click" | "fill" | "select";
  /** data-agent name of the target element. */
  target: string;
  value?: string;
}

export type WaitCondition =
  | { kind: "region-visible"; name: string }
  | { kind: "region-hidden"; name: string }
  | { kind: "text-present"; text: string }
  | { kind: "network-quiet"; quiet_ms?: number }
  | { kind: "console-quiet"; quiet_ms?: number }
  /**
   * Dot-path lookup into a registered state provider's snapshot — this repo
   * registers "page-operator" (captureDomMap + derived counts), e.g.
   * { provider: "page-operator", path: "selectedRepoCount", equals: 3 }.
   * NOTE: array segments resolve by integer index only — expose scalar
   * counts from the provider instead of asserting on ".length".
   */
  | { kind: "state-equals"; provider: string; path: string; equals: unknown };

export type FlowStep =
  | { kind: "act"; action: ActAction }
  | { kind: "wait"; condition: WaitCondition; timeout_ms?: number }
  | { kind: "assert"; condition: WaitCondition; timeout_ms?: number };

export interface FlowDef {
  name: string;
  description: string;
  steps: FlowStep[];
  /** Highest tier the flow may touch; hotter steps are refused. Default "safe". */
  risk?: AgentRisk;
}

export interface FlowResult {
  flow: string;
  ok: boolean;
  risk: AgentRisk;
  steps: Array<{
    index: number;
    kind: FlowStep["kind"];
    ok: boolean;
    duration_ms: number;
    error?: string;
  }>;
  duration_ms: number;
  error?: string;
  confirm_required?: boolean;
  confirm_token?: string;
  expires_in_ms?: number;
}

export interface BridgeConfig {
  app: string;
  /** "dev" unlocks act + chip; anything else is read-only-safe. */
  mode?: BridgeMode;
  enabled?: boolean;
  appVersion?: string;
  commit?: string;
  env?: string;
  flows?: FlowDef[];
  /** Named app-state snapshots; addressable from state-equals waits. */
  stateProviders?: Record<string, () => unknown>;
  [key: string]: unknown;
}
