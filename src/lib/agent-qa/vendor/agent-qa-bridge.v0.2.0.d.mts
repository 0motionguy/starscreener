/**
 * Sibling declaration for the vendored agent-bridge bundle (allowJs is off
 * in this repo, so TS cannot infer from the .mjs directly). Only the surface
 * this repo consumes is declared; types live in ../contracts.
 */
import type {
  ActAction,
  AgentRisk,
  BridgeConfig,
  FlowDef,
  FlowResult,
  WaitCondition,
} from "../contracts";

export declare function init(config: BridgeConfig): unknown;

/** Test-only import: flow registry with injected deps. */
export declare function createFlowRegistry(deps: {
  actGranted(action: ActAction): { ok: boolean; error?: string };
  resolveTargetRisk(target: string): AgentRisk;
  waitFor(
    condition: WaitCondition,
    timeoutMs?: number,
  ): Promise<{ ok: boolean; condition: WaitCondition; waited_ms: number; error?: string }>;
  grants?: unknown;
  now?: () => number;
}): {
  register(def: FlowDef): void;
  list(): FlowDef[];
  run(name: string, confirmToken?: string): Promise<FlowResult>;
};
