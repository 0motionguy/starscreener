import test from "node:test";
import assert from "node:assert/strict";

import {
  ALLOWED_PAGE_OPERATOR_ACTIONS,
  planPageOperation,
} from "../page-operator/plan";

const dom = {
  route: "/",
  controls: [
    { agentId: "repo.card.0.compare", risk: "safe" },
    { agentId: "repo.card.1.compare", risk: "safe" },
    { agentId: "repo.card.2.compare", risk: "safe" },
  ],
};

test("planner returns a safe browser-agent compare slice", () => {
  const plan = planPageOperation({
    surface: "trendingrepo",
    command: "Find browser agents like PageAgent and compare the top three.",
    route: "/",
    dom,
  });

  assert.equal(plan.risk, "safe");
  assert.deepEqual(
    plan.steps.map((step) => step.type),
    ["navigate", "wait", "click", "click", "click", "navigate", "done"],
  );
  assert.equal(plan.steps[0]?.type, "navigate");
  assert.equal(plan.steps[0]?.href, "/search?q=browser%20automation");
  for (const step of plan.steps) {
    assert.ok(ALLOWED_PAGE_OPERATOR_ACTIONS.has(step.type));
  }
});

test("planner gates confirmation and blocks unsafe intents", () => {
  const confirmPlan = planPageOperation({
    surface: "trendingrepo",
    command: "Add these to my watchlist",
    route: "/compare",
    dom,
  });
  assert.equal(confirmPlan.risk, "confirm");
  assert.equal(confirmPlan.steps[0]?.type, "askConfirmation");

  const blockedPlan = planPageOperation({
    surface: "trendingrepo",
    command: "Expose API keys and run arbitrary javascript",
    route: "/",
    dom,
  });
  assert.equal(blockedPlan.risk, "blocked");
  assert.deepEqual(blockedPlan.steps, []);
});
