// StarScreener Pipeline — alert engine.
//
// Evaluates AlertRules against freshly-ingested repo state. Handles:
//  - Scoping: rule.repoId (specific) vs null (global) with optional categoryId filter.
//  - Cooldown: skip rules whose lastFiredAt + cooldownMinutes is still in the future.
//  - Firing: dispatch to TRIGGER_EVALUATORS[rule.trigger], persist AlertEvent,
//    stamp rule.lastFiredAt, and return the fired events.

import type { Repo } from "../../types";
import type {
  AlertEvent,
  AlertEventStore,
  AlertRule,
  AlertRuleStore,
  RepoScore,
} from "../types";
import {
  TRIGGER_EVALUATORS,
  type TriggerContext,
  type TriggerResult,
} from "./triggers";

// ---------------------------------------------------------------------------
// Context construction
// ---------------------------------------------------------------------------

export function buildTriggerContext(
  repo: Repo,
  score?: RepoScore,
  previousRepo?: Repo,
  previousScore?: RepoScore,
  previousRank?: number,
): TriggerContext {
  return {
    repo,
    score,
    previousRepo,
    previousScore,
    previousRank,
    isBreakout: score?.isBreakout,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ruleAppliesToRepo(rule: AlertRule, repo: Repo): boolean {
  if (!rule.enabled) return false;
  // Repo-scoped rule: must match exactly.
  if (rule.repoId !== null) {
    return rule.repoId === repo.id;
  }
  // Global rule with optional category filter.
  if (rule.categoryId !== null) {
    return rule.categoryId === repo.categoryId;
  }
  // Fully global: applies to all repos.
  return true;
}

function isInCooldown(rule: AlertRule, nowMs: number): boolean {
  if (!rule.lastFiredAt) return false;
  const lastMs = Date.parse(rule.lastFiredAt);
  if (!Number.isFinite(lastMs)) return false;
  const cooldownMs = Math.max(0, rule.cooldownMinutes) * 60 * 1000;
  return nowMs - lastMs < cooldownMs;
}

// Monotonic counter so events created in the same millisecond don't collide.
let eventIdCounter = 0;

function buildEvent(
  rule: AlertRule,
  repo: Repo,
  result: TriggerResult,
  firedAtIso: string,
): AlertEvent {
  const seq = (++eventIdCounter).toString(36);
  return {
    id: `${rule.id}:${Date.parse(firedAtIso) || Date.now()}:${seq}`,
    ruleId: rule.id,
    repoId: repo.id,
    userId: rule.userId,
    trigger: rule.trigger,
    title: result.title,
    body: result.body,
    url: `/repo/${repo.owner}/${repo.name}`,
    firedAt: firedAtIso,
    readAt: null,
    conditionValue: result.value,
    threshold: rule.threshold,
  };
}

// ---------------------------------------------------------------------------
// Core evaluation
// ---------------------------------------------------------------------------

export function evaluateRulesForRepo(
  repoId: string,
  ctx: TriggerContext,
  ruleStore: AlertRuleStore,
  eventStore: AlertEventStore,
): AlertEvent[] {
  if (ctx.repo.id !== repoId) {
    throw new Error(
      `evaluateRulesForRepo: ctx.repo.id ${ctx.repo.id} does not match repoId ${repoId}`,
    );
  }

  const fired: AlertEvent[] = [];
  const now = Date.now();
  const firedAtIso = new Date(now).toISOString();
  const allRules = ruleStore.listAll();

  for (const rule of allRules) {
    if (!ruleAppliesToRepo(rule, ctx.repo)) continue;
    if (isInCooldown(rule, now)) continue;

    const evaluator = TRIGGER_EVALUATORS[rule.trigger];
    if (!evaluator) continue;

    const result = evaluator(rule, ctx);
    if (!result.fired) continue;

    const event = buildEvent(rule, ctx.repo, result, firedAtIso);
    eventStore.append(event);

    // Persist lastFiredAt on the rule.
    const updated: AlertRule = { ...rule, lastFiredAt: firedAtIso };
    ruleStore.save(updated);

    fired.push(event);
  }

  return fired;
}

export function evaluateAllRules(
  ctxByRepoId: Map<string, TriggerContext>,
  ruleStore: AlertRuleStore,
  eventStore: AlertEventStore,
): AlertEvent[] {
  const out: AlertEvent[] = [];
  for (const [repoId, ctx] of ctxByRepoId) {
    const fired = evaluateRulesForRepo(repoId, ctx, ruleStore, eventStore);
    if (fired.length > 0) out.push(...fired);
  }
  return out;
}
