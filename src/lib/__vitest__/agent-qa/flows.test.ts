import { describe, expect, it } from "vitest";
import { createFlowRegistry } from "@/lib/agent-qa/vendor/agent-qa-bridge.v0.2.1.mjs";
import type { AgentRisk, FlowResult, WaitCondition } from "@/lib/agent-qa/contracts";
import {
  agentQaFlows,
  compareTopThreeFlow,
  searchPageAgentFlow,
} from "@/lib/agent-qa/flows";

function makeRegistry(resolveRisk: (target: string) => AgentRisk) {
  return createFlowRegistry({
    actGranted: () => ({ ok: true }),
    resolveTargetRisk: resolveRisk,
    waitFor: async (condition: WaitCondition) => ({ ok: true, condition, waited_ms: 0 }),
  });
}

/** Annotated surfaces carry data-agent-risk="safe"; anything else defaults to "confirm". */
const pageRisk = (target: string): AgentRisk => (target.startsWith("repo-") ? "safe" : "confirm");

describe("agent-qa pilot flows (trendingrepo)", () => {
  it("registers both flows against the vendored registry", () => {
    const reg = makeRegistry(pageRisk);
    for (const flow of agentQaFlows) reg.register(flow);
    expect(reg.list().map((f) => f.name)).toEqual([
      "trendingrepo-search-page-agent",
      "trendingrepo-compare-top-three",
    ]);
  });

  it("search flow is safe-tier and runs without a confirm token", async () => {
    expect(searchPageAgentFlow.risk).toBe("safe");
    const reg = makeRegistry(pageRisk);
    reg.register(searchPageAgentFlow);
    const result: FlowResult = await reg.run(searchPageAgentFlow.name);
    expect(result.confirm_required).toBeFalsy();
    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(searchPageAgentFlow.steps.length);
  });

  it("compare flow asserts via the page-operator state provider", async () => {
    const assertStep = compareTopThreeFlow.steps.at(-1);
    expect(assertStep).toMatchObject({
      kind: "assert",
      condition: { kind: "state-equals", provider: "page-operator" },
    });
    const reg = makeRegistry(pageRisk);
    reg.register(compareTopThreeFlow);
    const result: FlowResult = await reg.run(compareTopThreeFlow.name);
    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(compareTopThreeFlow.steps.length);
  });

  it("safe flow refuses steps that resolve hotter than declared", async () => {
    const reg = makeRegistry(() => "confirm"); // pretend annotations are missing
    reg.register(compareTopThreeFlow);
    const result: FlowResult = await reg.run(compareTopThreeFlow.name);
    expect(result.ok).toBe(false);
  });
});
