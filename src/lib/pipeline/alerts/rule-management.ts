// StarScreener Pipeline — AlertRule helpers: creation, validation, presets.

import type { AlertRule, AlertTriggerType } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALERT_TRIGGER_TYPES: readonly AlertTriggerType[] = [
  "star_spike",
  "new_release",
  "rank_jump",
  "discussion_spike",
  "momentum_threshold",
  "breakout_detected",
  "daily_digest",
  "weekly_digest",
] as const;

const TRIGGER_SET = new Set<AlertTriggerType>(ALERT_TRIGGER_TYPES);

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateRuleId(): string {
  // Prefer Web Crypto / Node crypto if available.
  const g = globalThis as unknown as {
    crypto?: { randomUUID?: () => string };
  };
  if (g.crypto?.randomUUID) {
    try {
      return `rule_${g.crypto.randomUUID()}`;
    } catch {
      // fall through
    }
  }
  return `rule_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreateRuleInput extends Partial<AlertRule> {
  userId: string;
  trigger: AlertTriggerType;
  threshold: number;
}

export function createRule(input: CreateRuleInput): AlertRule {
  if (!TRIGGER_SET.has(input.trigger)) {
    throw new Error(`createRule: invalid trigger type "${input.trigger}"`);
  }
  const now = new Date().toISOString();
  return {
    id: input.id ?? generateRuleId(),
    userId: input.userId,
    repoId: input.repoId ?? null,
    categoryId: input.categoryId ?? null,
    trigger: input.trigger,
    threshold: input.threshold,
    cooldownMinutes: input.cooldownMinutes ?? 60,
    enabled: input.enabled ?? true,
    createdAt: input.createdAt ?? now,
    lastFiredAt: input.lastFiredAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface RuleValidation {
  valid: boolean;
  errors: string[];
}

export function validateRule(rule: AlertRule): RuleValidation {
  const errors: string[] = [];

  if (!rule.id || typeof rule.id !== "string") {
    errors.push("id must be a non-empty string");
  }
  if (!rule.userId || typeof rule.userId !== "string") {
    errors.push("userId must be a non-empty string");
  }
  if (!TRIGGER_SET.has(rule.trigger)) {
    errors.push(`trigger must be one of: ${ALERT_TRIGGER_TYPES.join(", ")}`);
  }
  if (typeof rule.threshold !== "number" || !Number.isFinite(rule.threshold)) {
    errors.push("threshold must be a finite number");
  } else if (rule.threshold < 0) {
    errors.push("threshold must be >= 0");
  }
  if (
    typeof rule.cooldownMinutes !== "number" ||
    !Number.isFinite(rule.cooldownMinutes)
  ) {
    errors.push("cooldownMinutes must be a finite number");
  } else if (rule.cooldownMinutes < 0) {
    errors.push("cooldownMinutes must be >= 0");
  }

  // Scope validation: repoId / categoryId are both optional, both can be null
  // (global rule). Both may also be set together (repo in a category).
  if (rule.repoId !== null && typeof rule.repoId !== "string") {
    errors.push("repoId must be a string or null");
  }
  if (rule.categoryId !== null && typeof rule.categoryId !== "string") {
    errors.push("categoryId must be a string or null");
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Preset suggestions
// ---------------------------------------------------------------------------

export interface AlertSuggestion {
  trigger: AlertTriggerType;
  threshold: number;
  label: string;
  description: string;
}

export const DEFAULT_ALERT_SUGGESTIONS: AlertSuggestion[] = [
  {
    trigger: "star_spike",
    threshold: 100,
    label: "Star spike (100+/day)",
    description: "Fires when a repo gains more than 100 stars in 24 hours.",
  },
  {
    trigger: "new_release",
    threshold: 0,
    label: "New release",
    description: "Fires when a repo publishes a new release tag.",
  },
  {
    trigger: "rank_jump",
    threshold: 5,
    label: "Rank climb (5+ places)",
    description: "Fires when a repo's rank improves by 5 or more places.",
  },
  {
    trigger: "breakout_detected",
    threshold: 0,
    label: "Breakout detected",
    description: "Fires when the scorer classifies a repo as a breakout.",
  },
  {
    trigger: "momentum_threshold",
    threshold: 75,
    label: "Hot momentum (>75)",
    description: "Fires when overall momentum crosses the 75 threshold.",
  },
  {
    trigger: "daily_digest",
    threshold: 0,
    label: "Daily digest",
    description: "A once-per-day summary of the top movers for you.",
  },
  {
    trigger: "weekly_digest",
    threshold: 0,
    label: "Weekly digest",
    description: "A once-per-week summary of the top movers for you.",
  },
];
