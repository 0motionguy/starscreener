// Zod validation schemas for `/api/me/alert-rules` (Chunk D).
//
// The on-disk shape of an `alert_rules` row mixes structural columns
// (cadence, watchlistId, webhookUrl, quietHours, active) with a
// per-rule-type config blob stored in `rule_config jsonb`. We keep the
// structural validation flat here and use a discriminated union on
// `ruleType` to validate the config blob — the four supported rule
// types each carry different threshold knobs.
//
// Source-of-truth for allowed values:
//   - ALERT_RULE_TYPES + ALERT_CADENCES from `@/lib/db/schema/alerts`
//   - profiles.quiet_hours JSON shape lives in
//     `src/lib/alerts/quiet-hours.ts` as `QuietHoursWindow`
//
// Webhook URL validation: HTTPS-only, max 2048 chars. The dispatcher
// short-circuits non-https values at delivery time anyway, but rejecting
// them at the API boundary saves the user from silent webhook failures.

import { z } from "zod";

import {
  ALERT_CADENCES,
  ALERT_RULE_TYPES,
} from "@/lib/db/schema/alerts";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Allowed values mirror the DB-level constants. */
export const cadenceSchema = z.enum(ALERT_CADENCES);

/** Mirrors `QuietHoursWindow` in `src/lib/alerts/quiet-hours.ts` — both
 *  endpoints are HH:MM 24h strings; the engine resolves cross-midnight
 *  ranges. Timezone is optional because the user's profile timezone is
 *  used as the fallback. */
const hhmmRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
export const quietHoursSchema = z.object({
  start: z.string().regex(hhmmRegex, "expected HH:MM 24h string"),
  end: z.string().regex(hhmmRegex, "expected HH:MM 24h string"),
  timezone: z.string().min(1).max(64).optional(),
});
export type QuietHoursInput = z.infer<typeof quietHoursSchema>;

/** HTTPS-only URL validator. Empty/null = no webhook. */
export const webhookUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((u) => u.startsWith("https://"), {
    message: "webhook_url must use https://",
  });

// ---------------------------------------------------------------------------
// Per-rule-type config (discriminated union on `ruleType`)
// ---------------------------------------------------------------------------

const breakoutConfig = z.object({
  ruleType: z.literal("breakout"),
  minScore: z.number().min(0).max(100).optional(),
  fullName: z.string().min(1).max(140).optional(),
});

const rankThresholdConfig = z.object({
  ruleType: z.literal("rank_threshold"),
  scope: z.enum(["global", "category"]),
  categoryId: z.string().min(1).max(64).optional(),
  maxRank: z.number().int().min(1).max(1000),
  direction: z.enum(["into", "outof"]),
});

const releaseConfig = z.object({
  ruleType: z.literal("release"),
  fullName: z.string().min(1).max(140),
  includePrerelease: z.boolean().optional(),
});

const mentionSpikeConfig = z.object({
  ruleType: z.literal("mention_spike"),
  fullName: z.string().min(1).max(140).optional(),
  multiplier: z.number().min(1).max(100),
  window: z.enum(["24h", "7d"]),
});

/** Discriminated union — pick by `ruleType`. */
export const ruleConfigSchema = z.discriminatedUnion("ruleType", [
  breakoutConfig,
  rankThresholdConfig,
  releaseConfig,
  mentionSpikeConfig,
]);
export type RuleConfig = z.infer<typeof ruleConfigSchema>;

// ---------------------------------------------------------------------------
// Top-level request bodies
// ---------------------------------------------------------------------------

/** POST body — create rule. */
export const createAlertRuleSchema = z.object({
  name: z.string().min(1).max(120),
  ruleType: z.enum(ALERT_RULE_TYPES),
  ruleConfig: ruleConfigSchema,
  cadence: cadenceSchema.default("realtime"),
  watchlistId: z.string().uuid().nullish(),
  webhookUrl: webhookUrlSchema.nullish(),
  quietHours: quietHoursSchema.nullish(),
});
export type CreateAlertRuleInput = z.infer<typeof createAlertRuleSchema>;

/** PATCH body — every field optional, but at least one must be supplied. */
export const patchAlertRuleSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    active: z.boolean().optional(),
    cadence: cadenceSchema.optional(),
    ruleConfig: ruleConfigSchema.optional(),
    quietHours: quietHoursSchema.nullish(),
    webhookUrl: webhookUrlSchema.nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "patch body must include at least one field",
  });
export type PatchAlertRuleInput = z.infer<typeof patchAlertRuleSchema>;

/** PATCH body for `/api/me/profile` — global notification preferences. */
export const patchProfilePrefsSchema = z
  .object({
    emailAlertsCadence: z
      .enum(["realtime", "daily", "weekly", "off"])
      .optional(),
    quietHours: quietHoursSchema.nullish(),
    timezone: z.string().min(1).max(64).optional(),
    emailReferralUpdates: z.boolean().optional(),
    emailProductUpdates: z.boolean().optional(),
    emailSystem: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "patch body must include at least one field",
  });
export type PatchProfilePrefsInput = z.infer<typeof patchProfilePrefsSchema>;
