// Shared types for the /you/alerts client islands.
//
// These mirror Lane 1's `/api/me/alert-rules` contract verbatim — they're
// the over-the-wire shape (no Date objects, no Drizzle row internals) that
// both the server page passes down via props AND that the client API
// callers expect back.
//
// Keep this in sync with `src/lib/api/alert-rules/schemas.ts` (Lane 1).
// If a field is added there, add it here too.

import type { AlertRuleType, AlertCadence } from "@/lib/db/schema/alerts";
import type { EmailAlertsCadence } from "@/lib/db/schema/profiles";

export type QuietHours = {
  startMin: number; // 0..1439 (minute-of-day in user's timezone)
  endMin: number; // 0..1439, may be < startMin (wraps midnight)
};

// Discriminated union mirroring Lane 1's Zod schema for `rule_config`.
// Lane 1 source of truth: `src/lib/api/alert-rules/schemas.ts`.
export type BreakoutConfig = {
  minScore?: number;
  fullName?: string; // optional scope to a single repo
};

export type RankThresholdConfig = {
  scope: "global" | "category";
  categoryId?: string;
  maxRank: number;
  direction: "into" | "outof";
};

export type ReleaseConfig = {
  fullName: string;
  includePrerelease?: boolean;
};

export type MentionSpikeConfig = {
  fullName?: string;
  multiplier: number;
  window: "24h" | "7d";
};

export type AlertRuleConfig =
  | BreakoutConfig
  | RankThresholdConfig
  | ReleaseConfig
  | MentionSpikeConfig;

export interface SerializedAlertRule {
  id: string;
  name: string;
  ruleType: AlertRuleType;
  ruleConfig: Record<string, unknown>; // typed via discriminator on ruleType
  cadence: AlertCadence;
  webhookUrl: string | null;
  quietHours: QuietHours | null;
  active: boolean;
  lastFiredAt: string | null; // ISO
  fireCountToday: number;
  fireCountTotal: number;
  createdAt: string; // ISO
}

export interface SerializedProfilePrefs {
  emailAlertsCadence: string; // EmailAlertsCadence value
  quietHours: QuietHours | null;
  timezone: string;
  emailReferralUpdates: boolean;
  emailProductUpdates: boolean;
  emailSystem: boolean;
}

// POST body shape for `/api/me/alert-rules`. `webhookUrl` and `quietHours`
// are optional. `plaintextSecret` only appears in the response when
// `webhookUrl` was supplied at create time.
export interface CreateAlertRuleBody {
  name: string;
  ruleType: AlertRuleType;
  ruleConfig: AlertRuleConfig;
  cadence: AlertCadence;
  webhookUrl?: string;
  quietHours?: QuietHours | null;
}

// PATCH body for `/api/me/alert-rules/[id]` — partial of POST shape plus
// `active` toggle.
export type PatchAlertRuleBody = Partial<CreateAlertRuleBody> & {
  active?: boolean;
};

export type PatchProfilePrefsBody = Partial<{
  emailAlertsCadence: EmailAlertsCadence;
  quietHours: QuietHours | null;
  timezone: string;
  emailReferralUpdates: boolean;
  emailProductUpdates: boolean;
  emailSystem: boolean;
}>;

// Response envelopes.
export type ApiOk<T> = { ok: true } & T;
export type ApiErr = {
  ok: false;
  error: string;
  message?: string;
};
